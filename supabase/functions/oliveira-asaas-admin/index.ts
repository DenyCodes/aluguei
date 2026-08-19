import { audit, json, requireAdmin, serve, serviceClient } from "../_shared/http.ts";
import {
  AsaasApiError,
  asaasCheckoutUrl,
  asaasRequest,
  assertOliveiraAsaasAccount,
  chargeReference,
  finishOperation,
  getAsaasEnvironment,
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

async function setFlags(adminId: string, body: JsonObject, request: Request) {
  const billingEnabled = body.billing_enabled === true;
  const automaticCreationEnabled = body.automatic_creation_enabled === true;
  if (automaticCreationEnabled && !billingEnabled) {
    throw new Error("A criacao automatica exige cobranca habilitada");
  }
  const client = serviceClient();
  const current = await client.from("oliveira_settings")
    .select("billing_enabled,automatic_creation_enabled,billing_started_at")
    .eq("id", 1).single();
  if (current.error) throw current.error;
  const integration = await client.from("oliveira_asaas_integration").select("*").eq("id", 1).single();
  if (integration.error) throw integration.error;
  if (billingEnabled && (!integration.data.webhook_configured_at || !integration.data.account_id)) {
    throw new Error("Configure e valide o webhook Asaas antes de habilitar cobrancas");
  }
  if (billingEnabled) await assertOliveiraAsaasAccount();
  const now = new Date().toISOString();
  const startedAt = billingEnabled
    ? current.data.billing_started_at ?? now
    : current.data.billing_started_at;
  const updated = await client.from("oliveira_settings").update({
    billing_enabled: billingEnabled,
    automatic_creation_enabled: automaticCreationEnabled,
    billing_started_at: startedAt,
    updated_at: now,
  }).eq("id", 1).select("billing_enabled,automatic_creation_enabled,billing_started_at").single();
  if (updated.error) throw updated.error;
  await client.from("oliveira_asaas_integration").update({
    environment: getAsaasEnvironment(),
    enabled_at: billingEnabled ? integration.data.enabled_at ?? now : integration.data.enabled_at,
    updated_at: now,
  }).eq("id", 1);
  await audit(adminId, "billing.flags.updated", "settings", "1", {
    before: {
      billing_enabled: current.data.billing_enabled,
      automatic_creation_enabled: current.data.automatic_creation_enabled,
    },
    after: updated.data,
  }, request);
  return updated.data;
}

async function authorizeLateAdjustment(adminId: string, body: JsonObject, request: Request) {
  const installmentId = asString(body.installment_id);
  if (!installmentId) throw new Error("Parcela obrigatoria");
  const client = serviceClient();
  const settings = await client.from("oliveira_settings").select("billing_enabled").eq("id", 1).single();
  if (settings.error) throw settings.error;
  if (!settings.data.billing_enabled) throw new Error("Cobranca online desabilitada");
  await assertOliveiraAsaasAccount();
  const installment = await client.from("oliveira_rent_installments")
    .select("*,tenancy:oliveira_tenancies(id,tenant_id,status,deleted_at,property:oliveira_properties(title))")
    .eq("id", installmentId).single();
  if (installment.error) throw installment.error;
  if (!installment.data.principal_paid_at) {
    throw new Error("Multa e juros so podem ser autorizados apos o principal confirmado");
  }
  const tenancy = asObject(installment.data.tenancy);
  if (asString(tenancy.status) !== "active" || tenancy.deleted_at) {
    throw new Error("Locacao inativa");
  }
  const calculation = await client.rpc("oliveira_billing_calculate_late_adjustment", {
    p_installment_id: installmentId,
    p_paid_at: installment.data.principal_paid_at,
  });
  if (calculation.error) throw calculation.error;
  const amount = Number(calculation.data ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nao ha multa ou juros a cobrar");

  const existing = await client.from("oliveira_billing_charges").select("*")
    .eq("installment_id", installmentId).eq("kind", "late_adjustment")
    .not("status", "in", "(refused,cancelled,refunded,chargeback)")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.provider_checkout_id) {
    return { charge_id: existing.data.id, status: existing.data.status, checkout_url: existing.data.invoice_url, reused: true };
  }
  let charge = existing.data;
  if (!charge) {
    const id = crypto.randomUUID();
    const inserted = await client.from("oliveira_billing_charges").insert({
      id,
      installment_id: installmentId,
      tenancy_id: asString(tenancy.id),
      tenant_id: asString(tenancy.tenant_id),
      kind: "late_adjustment",
      method: "manual",
      status: "draft",
      amount,
      due_date: saoPauloDate(),
      external_reference: chargeReference(id),
      metadata: { requires_admin_authorization: true },
    }).select().single();
    if (inserted.error) throw inserted.error;
    charge = inserted.data;
  }
  const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  if (!siteUrl) throw new Error("SITE_URL nao configurada");
  const property = asObject(tenancy.property);
  const requestPayload: JsonObject = {
    billingTypes: ["PIX", "CREDIT_CARD"],
    chargeTypes: ["DETACHED"],
    minutesToExpire: 1_440,
    externalReference: charge.external_reference,
    callback: {
      successUrl: `${siteUrl}/inquilino/pagamentos?late_adjustment=success`,
      cancelUrl: `${siteUrl}/inquilino/pagamentos?late_adjustment=cancelled`,
      expiredUrl: `${siteUrl}/inquilino/pagamentos?late_adjustment=expired`,
    },
    items: [{
      name: "Multa e juros autorizados",
      description: `${asString(property.title)} - ${installment.data.reference_month}`.slice(0, 255),
      quantity: 1,
      value: amount,
    }],
  };
  const operation = await reserveOperation(client, {
    operationKey: `late-adjustment-checkout:${charge.id}`,
    operationType: "create_checkout",
    chargeId: charge.id,
    requestPayload,
  });
  if (operation.status !== "pending") throw new Error("Cobranca adicional ja registrada; aguarde conciliacao");
  if (!await markOperationRunning(client, operation.id)) {
    throw new Error("Cobranca adicional ja esta em processamento");
  }
  await client.from("oliveira_billing_charges").update({
    status: "creating",
    amount,
    due_date: saoPauloDate(),
    metadata: {
      requires_admin_authorization: true,
      authorized_by: adminId,
      authorized_at: new Date().toISOString(),
      principal_paid_at: installment.data.principal_paid_at,
    },
    updated_at: new Date().toISOString(),
  }).eq("id", charge.id);
  try {
    const checkout = await asaasRequest<JsonObject>("/checkouts", { method: "POST", body: requestPayload });
    const checkoutId = asString(checkout.id);
    const checkoutUrl = asString(checkout.link || checkout.url) || (checkoutId ? asaasCheckoutUrl(checkoutId) : "");
    if (!checkoutId) throw new Error("Asaas nao retornou o checkout adicional");
    await client.from("oliveira_billing_charges").update({
      method: "manual",
      status: "pending",
      provider_checkout_id: checkoutId,
      provider_status: asString(checkout.status) || "PENDING",
      invoice_url: checkoutUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    await finishOperation(client, operation.id, { status: "succeeded", providerResourceId: checkoutId });
    await audit(adminId, "billing.late_adjustment.authorized", "billing_charge", charge.id, {
      installment_id: installmentId,
      amount,
      checkout_id: checkoutId,
    }, request);
    return { charge_id: charge.id, status: "pending", checkout_url: checkoutUrl };
  } catch (error) {
    const unknown = error instanceof AsaasApiError && error.retryable;
    await finishOperation(client, operation.id, {
      status: unknown ? "unknown" : "permanent_failed",
      error: error instanceof Error ? error.message : "Falha Asaas",
    });
    await client.from("oliveira_billing_charges").update({
      status: "manual_review",
      error_code: unknown ? "provider_result_unknown" : "provider_rejected",
      error_message: (error instanceof Error ? error.message : "Falha Asaas").slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    throw error;
  }
}

async function cancelCharge(adminId: string, body: JsonObject, request: Request, waived = false) {
  const chargeId = asString(body.charge_id);
  if (!chargeId) throw new Error("Cobranca obrigatoria");
  const client = serviceClient();
  const result = await client.from("oliveira_billing_charges").select("*").eq("id", chargeId).single();
  if (result.error) throw result.error;
  const charge = result.data;
  if (charge.status === "cancelled") return charge;
  if (["confirmed", "received", "refunded", "chargeback"].includes(charge.status)) {
    throw new Error("Cobranca liquidada exige estorno e conciliacao, nao cancelamento");
  }
  if (charge.provider_payment_id || charge.provider_checkout_id) {
    await assertOliveiraAsaasAccount();
  }
  if (waived && charge.kind !== "late_adjustment") throw new Error("Somente multa e juros podem ser dispensados");
  try {
    if (charge.provider_payment_id) {
      await asaasRequest(`/payments/${encodeURIComponent(charge.provider_payment_id)}`, { method: "DELETE" });
    } else if (charge.provider_checkout_id) {
      await asaasRequest(`/checkouts/${encodeURIComponent(charge.provider_checkout_id)}`, { method: "DELETE" });
    }
  } catch (error) {
    if (!(error instanceof AsaasApiError && error.status === 404)) throw error;
  }
  const now = new Date().toISOString();
  const updated = await client.from("oliveira_billing_charges").update({
    status: "cancelled",
    cancelled_at: now,
    provider_status: waived ? "WAIVED_BY_ADMIN" : "CANCELLED_BY_ADMIN",
    metadata: {
      ...(asObject(charge.metadata)),
      cancelled_by: adminId,
      cancellation_note: asString(body.note).slice(0, 500) || null,
      waived,
    },
    updated_at: now,
  }).eq("id", chargeId).select().single();
  if (updated.error) throw updated.error;
  if (charge.kind === "late_adjustment" && charge.installment_id) {
    const installment = await client.from("oliveira_rent_installments").select("principal_paid_at")
      .eq("id", charge.installment_id).single();
    if (installment.data?.principal_paid_at) {
      await client.from("oliveira_rent_installments").update({
        status: "paid",
        paid_at: installment.data.principal_paid_at,
        settled_at: now,
      }).eq("id", charge.installment_id);
    }
  }
  await audit(adminId, waived ? "billing.late_adjustment.waived" : "billing.charge.cancelled", "billing_charge", chargeId, {
    note: asString(body.note).slice(0, 500) || null,
  }, request);
  return updated.data;
}

async function getOverview(body: JsonObject) {
  const client = serviceClient();
  const limit = Math.max(1, Math.min(200, Number(body.limit ?? 100)));
  let agreements = client.from("oliveira_billing_agreements").select("*")
    .order("created_at", { ascending: false }).limit(limit);
  let charges = client.from("oliveira_billing_charges").select("*")
    .order("created_at", { ascending: false }).limit(limit);
  const tenancyId = asString(body.tenancy_id);
  if (tenancyId) {
    agreements = agreements.eq("tenancy_id", tenancyId);
    charges = charges.eq("tenancy_id", tenancyId);
  }
  const [settings, integration, agreementRows, chargeRows, operations, events, reconciliations] = await Promise.all([
    client.from("oliveira_settings").select("billing_enabled,automatic_creation_enabled,billing_started_at").eq("id", 1).single(),
    client.from("oliveira_asaas_integration").select("*").eq("id", 1).single(),
    agreements,
    charges,
    client.from("oliveira_billing_operations").select("*").order("created_at", { ascending: false }).limit(limit),
    client.from("oliveira_asaas_webhook_events").select("id,event_id,event_type,resource_kind,resource_id,is_oliveira,status,attempts,error_message,provider_created_at,received_at,processed_at").order("received_at", { ascending: false }).limit(limit),
    client.from("oliveira_billing_reconciliation_runs").select("*").order("started_at", { ascending: false }).limit(20),
  ]);
  for (const result of [settings, integration, agreementRows, chargeRows, operations, events, reconciliations]) {
    if (result.error) throw result.error;
  }
  return {
    settings: settings.data,
    integration: integration.data,
    agreements: agreementRows.data,
    charges: chargeRows.data,
    operations: operations.data,
    webhook_events: events.data,
    reconciliation_runs: reconciliations.data,
  };
}

async function cancelAgreement(adminId: string, body: JsonObject, request: Request) {
  const agreementId = asString(body.agreement_id);
  if (!agreementId) throw new Error("Acordo obrigatorio");
  const client = serviceClient();
  const result = await client.from("oliveira_billing_agreements").select("*").eq("id", agreementId).single();
  if (result.error) throw result.error;
  const agreement = result.data;
  if (agreement.status === "cancelled") return agreement;
  if (agreement.provider_authorization_id || agreement.provider_subscription_id || agreement.provider_checkout_id) {
    await assertOliveiraAsaasAccount();
  }
  try {
    if (agreement.provider_authorization_id) {
      await asaasRequest(`/pix/automatic/authorizations/${encodeURIComponent(agreement.provider_authorization_id)}`, { method: "DELETE" });
    } else if (agreement.provider_subscription_id) {
      await asaasRequest(`/subscriptions/${encodeURIComponent(agreement.provider_subscription_id)}`, { method: "DELETE" });
    } else if (agreement.provider_checkout_id) {
      await asaasRequest(`/checkouts/${encodeURIComponent(agreement.provider_checkout_id)}`, { method: "DELETE" });
    }
  } catch (error) {
    if (!(error instanceof AsaasApiError && error.status === 404)) throw error;
  }
  const now = new Date().toISOString();
  const updated = await client.from("oliveira_billing_agreements").update({
    status: "cancelled",
    cancelled_at: now,
    provider_status: "CANCELLED_BY_ADMIN",
    metadata: {
      ...(asObject(agreement.metadata)),
      cancelled_by: adminId,
      cancellation_note: asString(body.note).slice(0, 500) || null,
    },
    updated_at: now,
  }).eq("id", agreementId).select().single();
  if (updated.error) throw updated.error;
  await audit(adminId, "billing.agreement.cancelled", "billing_agreement", agreementId, {
    note: asString(body.note).slice(0, 500) || null,
  }, request);
  return updated.data;
}

serve(async (request) => {
  const body = asObject(await request.json());
  const action = asString(body.action);
  const admin = await requireAdmin(request, { elevated: action !== "get_overview" });
  if (action === "get_overview") return json(await getOverview(body));
  if (action === "set_flags") return json(await setFlags(admin.id, body, request));
  if (action === "authorize_late_adjustment") return json(await authorizeLateAdjustment(admin.id, body, request));
  if (action === "waive_late_adjustment") return json(await cancelCharge(admin.id, body, request, true));
  if (action === "cancel_charge") return json(await cancelCharge(admin.id, body, request));
  if (action === "cancel_agreement") return json(await cancelAgreement(admin.id, body, request));
  throw new Error("Acao invalida");
});
