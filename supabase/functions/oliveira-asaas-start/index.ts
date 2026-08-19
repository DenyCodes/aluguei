import { audit, json, requireUser, serve, serviceClient } from "../_shared/http.ts";
import {
  agreementReference,
  AsaasApiError,
  asaasCheckoutUrl,
  asaasRequest,
  assertOliveiraAsaasAccount,
  authorizationContractId,
  chargeReference,
  ensureAsaasCustomer,
  finishOperation,
  getBillingFlags,
  installmentNetAmount,
  markOperationRunning,
  reserveOperation,
  saoPauloDate,
  type JsonObject,
} from "../_shared/oliveira-asaas.ts";

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
const asString = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const CONSENT_VERSION = "oliveira-billing-v1";

async function loadTenantContext(
  tenantId: string,
  tenancyId: string,
  options: { allowPast?: boolean; installmentId?: string } = {},
) {
  const client = serviceClient();
  const tenancy = await client.from("oliveira_tenancies")
    .select("id,tenant_id,property_id,starts_on,ends_on,status,deleted_at,property:oliveira_properties(title),tenant:oliveira_profiles(full_name,email,phone)")
    .eq("id", tenancyId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (tenancy.error) throw tenancy.error;
  if (!tenancy.data) throw new Error("Locacao ativa nao encontrada");

  const contract = await client.from("oliveira_contracts").select("id,status,signed_at")
    .eq("tenancy_id", tenancyId).eq("status", "signed")
    .not("signed_at", "is", null).order("version", { ascending: false }).limit(1).maybeSingle();
  if (contract.error) throw contract.error;
  if (!contract.data) throw new Error("Contrato assinado obrigatorio");

  let installmentQuery = client.from("oliveira_rent_installments").select("*")
    .eq("tenancy_id", tenancyId)
    .in("status", options.allowPast ? ["upcoming", "pending", "late"] : ["upcoming", "pending"])
    .is("principal_paid_at", null)
    .order("due_date", { ascending: true }).limit(1);
  if (!options.allowPast) installmentQuery = installmentQuery.gte("due_date", saoPauloDate());
  if (options.installmentId) installmentQuery = installmentQuery.eq("id", options.installmentId);
  const installment = await installmentQuery.maybeSingle();
  if (installment.error) throw installment.error;
  if (!installment.data) throw new Error("Nao ha parcela futura elegivel");
  const amount = installmentNetAmount(installment.data as JsonObject);
  if (amount <= 0) throw new Error("A parcela futura nao possui saldo principal");
  return { client, tenancy: tenancy.data, installment: installment.data, amount };
}

async function getOrCreatePrincipalCharge(input: {
  tenancyId: string;
  tenantId: string;
  installmentId: string;
  agreementId?: string | null;
  method: "pix_automatic" | "credit_card" | "pix";
  amount: number;
  dueDate: string;
}) {
  const client = serviceClient();
  const existing = await client.from("oliveira_billing_charges").select("*")
    .eq("installment_id", input.installmentId).eq("kind", "rent_principal")
    .not("status", "in", "(refused,cancelled,refunded,chargeback)")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.method !== input.method) {
      throw new Error("Existe uma cobranca deste aluguel aguardando conciliacao");
    }
    return existing.data;
  }
  const id = crypto.randomUUID();
  const inserted = await client.from("oliveira_billing_charges").insert({
    id,
    installment_id: input.installmentId,
    agreement_id: input.agreementId ?? null,
    tenancy_id: input.tenancyId,
    tenant_id: input.tenantId,
    kind: "rent_principal",
    method: input.method,
    status: "creating",
    amount: input.amount,
    due_date: input.dueDate,
    external_reference: chargeReference(id),
    metadata: { retroactive: false },
  }).select().single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function createAgreement(input: {
  tenancyId: string;
  tenantId: string;
  asaasCustomerId?: string | null;
  method: "pix_automatic" | "credit_card_subscription";
  startsOn: string;
  endsOn: string;
  consentAt: string;
}) {
  const client = serviceClient();
  const current = await client.from("oliveira_billing_agreements").select("*")
    .eq("tenancy_id", input.tenancyId)
    .in("status", ["setup_pending", "awaiting_authorization", "active"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (current.error) throw current.error;
  if (current.data) return { agreement: current.data, existing: true };
  const id = crypto.randomUUID();
  const inserted = await client.from("oliveira_billing_agreements").insert({
    id,
    tenancy_id: input.tenancyId,
    tenant_id: input.tenantId,
    asaas_customer_id: input.asaasCustomerId ?? null,
    method: input.method,
    external_reference: agreementReference(id),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    consent_at: input.consentAt,
    consent_version: CONSENT_VERSION,
    consent_method: "tenant_web",
    metadata: { retry_policy: input.method === "pix_automatic" ? "NOT_ALLOWED" : null },
  }).select().single();
  if (inserted.error) throw inserted.error;
  return { agreement: inserted.data, existing: false };
}

async function startPixAutomatic(userId: string, body: JsonObject, request: Request) {
  const tenancyId = asString(body.tenancy_id);
  if (!tenancyId) throw new Error("Locacao obrigatoria");
  if (body.consent !== true) throw new Error("Aceite explicito obrigatorio para o Pix Automatico");
  const context = await loadTenantContext(userId, tenancyId);
  const flags = await getBillingFlags(context.client);
  if (!flags.billingEnabled || !flags.automaticCreationEnabled) {
    throw new Error("Cobranca automatica ainda nao foi habilitada pelo administrador");
  }
  await assertOliveiraAsaasAccount();
  const integration = await context.client.from("oliveira_asaas_integration")
    .select("pix_automatic_eligibility").eq("id", 1).single();
  if (integration.error) throw integration.error;
  if (integration.data.pix_automatic_eligibility === "ineligible") {
    throw new Error("Pix Automatico indisponivel; use cartao recorrente ou Pix comum");
  }

  const tenant = asObject(context.tenancy.tenant);
  const customer = await ensureAsaasCustomer(context.client, {
    tenantId: userId,
    name: asString(tenant.full_name),
    email: asString(tenant.email),
    phone: asString(tenant.phone) || null,
    cpfCnpj: body.cpf_cnpj,
  });
  const created = await createAgreement({
    tenancyId,
    tenantId: userId,
    asaasCustomerId: customer.id,
    method: "pix_automatic",
    startsOn: context.installment.due_date,
    endsOn: context.tenancy.ends_on,
    consentAt: new Date().toISOString(),
  });
  if (created.existing) return { agreement: created.agreement, reused: true };

  const agreement = created.agreement;
  const charge = await getOrCreatePrincipalCharge({
    tenancyId,
    tenantId: userId,
    installmentId: context.installment.id,
    agreementId: agreement.id,
    method: "pix_automatic",
    amount: context.amount,
    dueDate: context.installment.due_date,
  });
  const requestPayload: JsonObject = {
    customerId: customer.provider_customer_id,
    frequency: "MONTHLY",
    contractId: authorizationContractId(tenancyId),
    startDate: context.installment.due_date,
    finishDate: context.tenancy.ends_on,
    description: "Aluguel - Imobiliaria Oliveira",
    immediateQrCode: {
      value: context.amount,
      paymentCreationMode: "MANUAL",
      retryPolicy: "NOT_ALLOWED",
    },
  };
  const operation = await reserveOperation(context.client, {
    operationKey: `pix-automatic-authorization:${agreement.id}`,
    operationType: "create_authorization",
    agreementId: agreement.id,
    chargeId: charge.id,
    requestPayload,
  });
  if (operation.status !== "pending") {
    throw new Error("Solicitacao ja registrada; aguarde conciliacao antes de tentar novamente");
  }
  await audit(userId, "billing.pix_automatic.consent", "billing_agreement", agreement.id, {
    consent_version: CONSENT_VERSION,
    consent_method: "tenant_web",
    tenancy_id: tenancyId,
  }, request);
  if (!await markOperationRunning(context.client, operation.id)) {
    throw new Error("Solicitacao ja esta em processamento");
  }
  try {
    const response = await asaasRequest<JsonObject>("/pix/automatic/authorizations", {
      method: "POST",
      body: requestPayload,
    });
    const authorization = asObject(response.authorization);
    const immediate = asObject(response.immediateQrCode);
    const payment = asObject(response.payment);
    const authorizationId = asString(response.id || authorization.id);
    if (!authorizationId) throw new Error("Asaas nao retornou a autorizacao Pix");
    await context.client.from("oliveira_billing_agreements").update({
      status: "awaiting_authorization",
      provider_authorization_id: authorizationId,
      provider_status: asString(response.status || authorization.status) || "PENDING",
      updated_at: new Date().toISOString(),
    }).eq("id", agreement.id);
    await context.client.from("oliveira_billing_charges").update({
      status: "pending",
      provider_payment_id: asString(payment.id) || null,
      pix_qr_payload: asString(immediate.payload || immediate.encodedImage) || null,
      expires_at: asString(immediate.expirationDate) || null,
      invoice_url: asString(payment.invoiceUrl) || null,
      provider_status: asString(payment.status) || "PENDING",
      metadata: {
        retry_policy: "NOT_ALLOWED",
        payment_creation_mode: "MANUAL",
        conciliation_identifier: asString(immediate.conciliationIdentifier) || null,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    await finishOperation(context.client, operation.id, {
      status: "succeeded",
      providerResourceId: authorizationId,
    });
    return {
      agreement_id: agreement.id,
      charge_id: charge.id,
      status: "awaiting_authorization",
      qr_payload: asString(immediate.payload || immediate.encodedImage) || null,
      expires_at: asString(immediate.expirationDate) || null,
      retry_policy: "NOT_ALLOWED",
    };
  } catch (error) {
    const unknown = error instanceof AsaasApiError && error.retryable;
    await finishOperation(context.client, operation.id, {
      status: unknown ? "unknown" : "permanent_failed",
      error: error instanceof Error ? error.message : "Falha Asaas",
    });
    await context.client.from("oliveira_billing_agreements").update({
      status: "failed",
      fallback_reason: unknown ? "provider_result_unknown" : "provider_rejected",
      updated_at: new Date().toISOString(),
    }).eq("id", agreement.id);
    await context.client.from("oliveira_billing_charges").update({
      status: unknown ? "manual_review" : "refused",
      error_code: unknown ? "provider_result_unknown" : "provider_rejected",
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    throw error;
  }
}

async function startCardSubscription(userId: string, body: JsonObject, request: Request) {
  const tenancyId = asString(body.tenancy_id);
  if (!tenancyId) throw new Error("Locacao obrigatoria");
  if (body.consent !== true) throw new Error("Aceite explicito obrigatorio para o cartao recorrente");
  const context = await loadTenantContext(userId, tenancyId);
  const flags = await getBillingFlags(context.client);
  if (!flags.billingEnabled || !flags.automaticCreationEnabled) {
    throw new Error("Cobranca automatica ainda nao foi habilitada pelo administrador");
  }
  await assertOliveiraAsaasAccount();
  const created = await createAgreement({
    tenancyId,
    tenantId: userId,
    method: "credit_card_subscription",
    startsOn: context.installment.due_date,
    endsOn: context.tenancy.ends_on,
    consentAt: new Date().toISOString(),
  });
  if (created.existing) return { agreement: created.agreement, reused: true };
  const agreement = created.agreement;
  const charge = await getOrCreatePrincipalCharge({
    tenancyId,
    tenantId: userId,
    installmentId: context.installment.id,
    agreementId: agreement.id,
    method: "credit_card",
    amount: context.amount,
    dueDate: context.installment.due_date,
  });
  const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  if (!siteUrl) throw new Error("SITE_URL nao configurada");
  const property = asObject(context.tenancy.property);
  const requestPayload: JsonObject = {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: 60,
    externalReference: agreement.external_reference,
    callback: {
      successUrl: `${siteUrl}/inquilino/alugueis?setup=success`,
      cancelUrl: `${siteUrl}/inquilino/alugueis?setup=cancelled`,
      expiredUrl: `${siteUrl}/inquilino/alugueis?setup=expired`,
    },
    items: [{
      name: "Aluguel mensal",
      description: `${asString(property.title)} - ${context.installment.reference_month}`.slice(0, 255),
      quantity: 1,
      value: context.amount,
    }],
    subscription: {
      cycle: "MONTHLY",
      nextDueDate: context.installment.due_date,
      endDate: context.tenancy.ends_on,
    },
  };
  const operation = await reserveOperation(context.client, {
    operationKey: `card-recurring-checkout:${agreement.id}`,
    operationType: "create_checkout",
    agreementId: agreement.id,
    chargeId: charge.id,
    requestPayload,
  });
  if (operation.status !== "pending") {
    throw new Error("Checkout ja registrado; aguarde conciliacao");
  }
  await audit(userId, "billing.card_subscription.consent", "billing_agreement", agreement.id, {
    consent_version: CONSENT_VERSION,
    consent_method: "tenant_web",
    tenancy_id: tenancyId,
  }, request);
  if (!await markOperationRunning(context.client, operation.id)) {
    throw new Error("Checkout ja esta em processamento");
  }
  try {
    const response = await asaasRequest<JsonObject>("/checkouts", { method: "POST", body: requestPayload });
    const checkoutId = asString(response.id);
    const checkoutUrl = asString(response.link || response.url) || (checkoutId ? asaasCheckoutUrl(checkoutId) : "");
    if (!checkoutId) throw new Error("Asaas nao retornou o checkout");
    await context.client.from("oliveira_billing_agreements").update({
      status: "awaiting_authorization",
      provider_checkout_id: checkoutId,
      provider_status: asString(response.status) || "PENDING",
      metadata: { checkout_url: checkoutUrl },
      updated_at: new Date().toISOString(),
    }).eq("id", agreement.id);
    await context.client.from("oliveira_billing_charges").update({
      status: "pending",
      provider_checkout_id: checkoutId,
      provider_status: asString(response.status) || "PENDING",
      invoice_url: checkoutUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    await finishOperation(context.client, operation.id, { status: "succeeded", providerResourceId: checkoutId });
    return { agreement_id: agreement.id, charge_id: charge.id, status: "awaiting_authorization", checkout_url: checkoutUrl };
  } catch (error) {
    const unknown = error instanceof AsaasApiError && error.retryable;
    await finishOperation(context.client, operation.id, {
      status: unknown ? "unknown" : "permanent_failed",
      error: error instanceof Error ? error.message : "Falha Asaas",
    });
    await context.client.from("oliveira_billing_agreements").update({
      status: "failed",
      fallback_reason: unknown ? "provider_result_unknown" : "provider_rejected",
      updated_at: new Date().toISOString(),
    }).eq("id", agreement.id);
    await context.client.from("oliveira_billing_charges").update({
      status: unknown ? "manual_review" : "refused",
      error_code: unknown ? "provider_result_unknown" : "provider_rejected",
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    throw error;
  }
}

async function createRegularPix(userId: string, body: JsonObject, request: Request) {
  const tenancyId = asString(body.tenancy_id);
  if (!tenancyId) throw new Error("Locacao obrigatoria");
  if (body.consent !== true) throw new Error("Aceite explicito obrigatorio para gerar o Pix");
  const context = await loadTenantContext(userId, tenancyId, {
    allowPast: true,
    installmentId: asString(body.installment_id) || undefined,
  });
  const flags = await getBillingFlags(context.client);
  if (!flags.billingEnabled) throw new Error("Cobranca online ainda nao foi habilitada");
  await assertOliveiraAsaasAccount();
  const tenant = asObject(context.tenancy.tenant);
  const customer = await ensureAsaasCustomer(context.client, {
    tenantId: userId,
    name: asString(tenant.full_name),
    email: asString(tenant.email),
    phone: asString(tenant.phone) || null,
    cpfCnpj: body.cpf_cnpj,
  });
  const charge = await getOrCreatePrincipalCharge({
    tenancyId,
    tenantId: userId,
    installmentId: context.installment.id,
    method: "pix",
    amount: context.amount,
    dueDate: context.installment.due_date,
  });
  await context.client.from("oliveira_billing_charges").update({
    metadata: {
      ...(asObject(charge.metadata)),
      consent_at: new Date().toISOString(),
      consent_version: CONSENT_VERSION,
      consent_method: "tenant_web",
      user_initiated: true,
    },
    updated_at: new Date().toISOString(),
  }).eq("id", charge.id);
  await audit(userId, "billing.regular_pix.consent", "billing_charge", charge.id, {
    consent_version: CONSENT_VERSION,
    consent_method: "tenant_web",
    tenancy_id: tenancyId,
    installment_id: context.installment.id,
  }, request);
  if (charge.provider_payment_id && charge.pix_qr_payload) {
    return { charge_id: charge.id, status: charge.status, qr_payload: charge.pix_qr_payload, invoice_url: charge.invoice_url, reused: true };
  }
  const requestPayload: JsonObject = {
    customer: customer.provider_customer_id,
    billingType: "PIX",
    value: context.amount,
    dueDate: context.installment.due_date,
    description: `Aluguel ${context.installment.reference_month} - Imobiliaria Oliveira`,
    externalReference: charge.external_reference,
  };
  const operation = await reserveOperation(context.client, {
    operationKey: `regular-pix-payment:${charge.id}`,
    operationType: "create_payment",
    chargeId: charge.id,
    requestPayload,
  });
  if (operation.status !== "pending") throw new Error("Cobranca ja registrada; aguarde conciliacao");
  if (!await markOperationRunning(context.client, operation.id)) {
    throw new Error("Cobranca ja esta em processamento");
  }
  try {
    const payment = await asaasRequest<JsonObject>("/payments", { method: "POST", body: requestPayload });
    const paymentId = asString(payment.id);
    if (!paymentId) throw new Error("Asaas nao retornou a cobranca");
    const qr = await asaasRequest<JsonObject>(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
    await context.client.from("oliveira_billing_charges").update({
      status: "pending",
      provider_payment_id: paymentId,
      provider_status: asString(payment.status) || "PENDING",
      invoice_url: asString(payment.invoiceUrl) || null,
      pix_qr_payload: asString(qr.payload) || null,
      expires_at: asString(qr.expirationDate) || null,
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    await finishOperation(context.client, operation.id, { status: "succeeded", providerResourceId: paymentId });
    return { charge_id: charge.id, status: "pending", qr_payload: asString(qr.payload) || null, expires_at: asString(qr.expirationDate) || null, invoice_url: asString(payment.invoiceUrl) || null };
  } catch (error) {
    const unknown = error instanceof AsaasApiError && error.retryable;
    await finishOperation(context.client, operation.id, {
      status: unknown ? "unknown" : "permanent_failed",
      error: error instanceof Error ? error.message : "Falha Asaas",
    });
    if (!unknown) {
      await context.client.from("oliveira_billing_charges").update({
        status: "refused",
        error_code: "provider_rejected",
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id);
    }
    throw error;
  }
}

async function getStatus(userId: string, body: JsonObject) {
  const client = serviceClient();
  let agreements = client.from("oliveira_billing_agreements").select("*").eq("tenant_id", userId).order("created_at", { ascending: false });
  let charges = client.from("oliveira_billing_charges").select("*").eq("tenant_id", userId).order("due_date", { ascending: false });
  if (asString(body.tenancy_id)) {
    agreements = agreements.eq("tenancy_id", asString(body.tenancy_id));
    charges = charges.eq("tenancy_id", asString(body.tenancy_id));
  }
  const [agreementResult, chargeResult, flags] = await Promise.all([agreements, charges, getBillingFlags(client)]);
  if (agreementResult.error) throw agreementResult.error;
  if (chargeResult.error) throw chargeResult.error;
  return { flags, agreements: agreementResult.data, charges: chargeResult.data };
}

serve(async (request) => {
  const user = await requireUser(request);
  const body = asObject(await request.json());
  const action = asString(body.action);
  if (action === "get_status") return json(await getStatus(user.id, body));
  if (action === "start_pix_automatic") return json(await startPixAutomatic(user.id, body, request));
  if (action === "start_card_subscription") return json(await startCardSubscription(user.id, body, request));
  if (action === "create_regular_pix") return json(await createRegularPix(user.id, body, request));
  throw new Error("Acao invalida");
});
