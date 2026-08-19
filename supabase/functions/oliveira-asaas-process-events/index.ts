import { buildRentReceiptPdf } from "../_shared/receipt-pdf.ts";
import { json, serve, serviceClient } from "../_shared/http.ts";
import {
  chargeReference,
  installmentNetAmount,
  isStaleProviderEvent,
  parseProviderDate,
  saoPauloDate,
  type JsonObject,
} from "../_shared/oliveira-asaas.ts";

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
const asString = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const eventTime = (event: JsonObject) =>
  parseProviderDate(event.provider_created_at || event.received_at) ?? new Date().toISOString();

async function requireCron(request: Request) {
  const client = serviceClient();
  const validation = await client.rpc("oliveira_validate_cron_secret", {
    p_secret: request.headers.get("x-oliveira-cron-secret") ?? "",
  });
  if (validation.error || validation.data !== true) throw new Error("Acesso negado");
}

async function findAgreement(payload: JsonObject, externalReference: string) {
  const client = serviceClient();
  const authorization = asObject(payload.authorization);
  const subscription = asObject(payload.subscription);
  const checkout = asObject(payload.checkout);
  const authorizationId = asString(authorization.id);
  const subscriptionId = asString(subscription.id);
  const checkoutId = asString(checkout.id);
  if (authorizationId) {
    const found = await client.from("oliveira_billing_agreements").select("*")
      .eq("provider_authorization_id", authorizationId).maybeSingle();
    if (found.error) throw found.error;
    if (found.data) return found.data;
  }
  if (subscriptionId) {
    const found = await client.from("oliveira_billing_agreements").select("*")
      .eq("provider_subscription_id", subscriptionId).maybeSingle();
    if (found.error) throw found.error;
    if (found.data) return found.data;
  }
  if (checkoutId) {
    const found = await client.from("oliveira_billing_agreements").select("*")
      .eq("provider_checkout_id", checkoutId).maybeSingle();
    if (found.error) throw found.error;
    if (found.data) return found.data;
  }
  if (externalReference.startsWith("oliveira:agreement:")) {
    const found = await client.from("oliveira_billing_agreements").select("*")
      .eq("external_reference", externalReference).maybeSingle();
    if (found.error) throw found.error;
    return found.data;
  }
  return null;
}

async function handleEligibility(eventType: string, payload: JsonObject, providerEventAt: string) {
  const eligibility = asObject(payload.eligibility);
  const rawStatus = asString(eligibility.status).toUpperCase();
  const ineligible = rawStatus.includes("INELIGIBLE") || eventType.includes("INELIGIBLE");
  const eligible = !ineligible && (rawStatus === "ELIGIBLE" || rawStatus === "ACTIVE" || eventType.includes("ELIGIBLE"));
  if (!eligible && !ineligible) return "eligibility_unknown";
  const client = serviceClient();
  const now = new Date().toISOString();
  const current = await client.from("oliveira_asaas_integration")
    .select("last_eligibility_event_at").eq("id", 1).single();
  if (current.error) throw current.error;
  if (isStaleProviderEvent(current.data.last_eligibility_event_at, providerEventAt)) {
    return "stale_eligibility_ignored";
  }
  const updated = await client.from("oliveira_asaas_integration").update({
    pix_automatic_eligibility: eligible ? "eligible" : "ineligible",
    pix_automatic_ineligible_reasons: Array.isArray(eligibility.ineligibleReasons)
      ? eligibility.ineligibleReasons
      : [],
    last_eligibility_event_at: providerEventAt,
    updated_at: now,
  }).eq("id", 1);
  if (updated.error) throw updated.error;
  if (ineligible) {
    const fallback = await client.from("oliveira_billing_agreements").update({
      status: "fallback_required",
      fallback_reason: "pix_automatic_ineligible",
      updated_at: now,
    }).eq("method", "pix_automatic").in("status", ["setup_pending", "awaiting_authorization", "active"]);
    if (fallback.error) throw fallback.error;
  }
  return eligible ? "eligible" : "ineligible";
}

async function handleAuthorization(eventType: string, payload: JsonObject, externalReference: string) {
  const client = serviceClient();
  const authorization = asObject(payload.authorization);
  const agreement = await findAgreement(payload, externalReference);
  if (!agreement) return "authorization_not_mapped";
  const providerStatus = asString(authorization.status) || eventType;
  const upper = `${eventType} ${providerStatus}`.toUpperCase();
  let status = agreement.status;
  let fallbackReason: string | null = agreement.fallback_reason;
  if (/ACTIVE|AUTHORIZED|APPROVED/.test(upper)) status = "active";
  if (/CANCEL|EXPIRE|REFUS|REJECT|INACTIV/.test(upper)) {
    status = "fallback_required";
    fallbackReason = providerStatus || eventType;
  }
  const updated = await client.from("oliveira_billing_agreements").update({
    provider_authorization_id: asString(authorization.id) || agreement.provider_authorization_id,
    provider_status: providerStatus,
    status,
    fallback_reason: fallbackReason,
    activated_at: status === "active" ? agreement.activated_at ?? new Date().toISOString() : agreement.activated_at,
    updated_at: new Date().toISOString(),
  }).eq("id", agreement.id);
  if (updated.error) throw updated.error;
  return status;
}

async function handleSubscription(eventType: string, payload: JsonObject, externalReference: string) {
  const client = serviceClient();
  const subscription = asObject(payload.subscription);
  const agreement = await findAgreement(payload, externalReference);
  if (!agreement) return "subscription_not_mapped";
  const providerStatus = asString(subscription.status) || eventType;
  const upper = `${eventType} ${providerStatus}`.toUpperCase();
  let status = agreement.status;
  if (/ACTIVE|CREATED|UPDATED/.test(upper) && !/INACTIV|DELETE|CANCEL|EXPIRE/.test(upper)) status = "active";
  if (/INACTIV|DELETE|CANCEL|EXPIRE|REFUS/.test(upper)) status = "fallback_required";
  const updated = await client.from("oliveira_billing_agreements").update({
    provider_subscription_id: asString(subscription.id) || agreement.provider_subscription_id,
    provider_status: providerStatus,
    status,
    activated_at: status === "active" ? agreement.activated_at ?? new Date().toISOString() : agreement.activated_at,
    fallback_reason: status === "fallback_required" ? providerStatus : agreement.fallback_reason,
    updated_at: new Date().toISOString(),
  }).eq("id", agreement.id);
  if (updated.error) throw updated.error;
  return status;
}

async function handleCheckout(eventType: string, payload: JsonObject, externalReference: string) {
  const client = serviceClient();
  const checkout = asObject(payload.checkout);
  const checkoutId = asString(checkout.id);
  const providerStatus = asString(checkout.status) || eventType;
  const agreement = await findAgreement(payload, externalReference);
  if (agreement) {
    const upper = `${eventType} ${providerStatus}`.toUpperCase();
    const status = /CANCEL|EXPIRE/.test(upper)
      ? "fallback_required"
      : /PAID/.test(upper)
        ? "awaiting_authorization"
        : agreement.status;
    const updated = await client.from("oliveira_billing_agreements").update({
      provider_checkout_id: checkoutId || agreement.provider_checkout_id,
      provider_status: providerStatus,
      status,
      fallback_reason: status === "fallback_required" ? providerStatus : agreement.fallback_reason,
      updated_at: new Date().toISOString(),
    }).eq("id", agreement.id);
    if (updated.error) throw updated.error;
    return `agreement_${status}`;
  }
  const charge = checkoutId
    ? await client.from("oliveira_billing_charges").select("*").eq("provider_checkout_id", checkoutId).maybeSingle()
    : await client.from("oliveira_billing_charges").select("*").eq("external_reference", externalReference).maybeSingle();
  if (charge.error) throw charge.error;
  if (!charge.data) return "checkout_not_mapped";
  const upper = `${eventType} ${providerStatus}`.toUpperCase();
  const status = /CANCEL|EXPIRE/.test(upper) ? "cancelled" : charge.data.status;
  const updated = await client.from("oliveira_billing_charges").update({
    provider_checkout_id: checkoutId || charge.data.provider_checkout_id,
    provider_status: providerStatus,
    status,
    cancelled_at: status === "cancelled" ? new Date().toISOString() : charge.data.cancelled_at,
    last_event_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", charge.data.id);
  if (updated.error) throw updated.error;
  return `charge_${status}`;
}

async function issueReceipt(charge: JsonObject, paidAt: string) {
  const client = serviceClient();
  const chargeId = asString(charge.id);
  let receipt = await client.from("oliveira_rent_receipts").select("*")
    .eq("billing_charge_id", chargeId).maybeSingle();
  if (receipt.error) throw receipt.error;
  let created = false;
  if (!receipt.data) {
    const installment = await client.from("oliveira_rent_installments")
      .select("*,tenancy:oliveira_tenancies(id,tenant_id,property:oliveira_properties(title),tenant:oliveira_profiles(full_name))")
      .eq("id", asString(charge.installment_id)).single();
    if (installment.error) throw installment.error;
    const receiptNumber = `IO-${new Date(paidAt).getFullYear()}-${chargeId.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const inserted = await client.from("oliveira_rent_receipts").insert({
      installment_id: installment.data.id,
      tenancy_id: installment.data.tenancy.id,
      tenant_id: installment.data.tenancy.tenant_id,
      receipt_number: receiptNumber,
      amount: asNumber(charge.amount),
      paid_at: paidAt,
      issued_by: null,
      billing_charge_id: chargeId,
      source: "asaas",
      status: "active",
      provider_payment_id: asString(charge.provider_payment_id) || null,
    }).select().single();
    if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    if (inserted.data) {
      receipt = { data: inserted.data, error: null } as typeof receipt;
      created = true;
    } else {
      receipt = await client.from("oliveira_rent_receipts").select("*").eq("billing_charge_id", chargeId).single();
      if (receipt.error) throw receipt.error;
    }
  }
  if (!receipt.data.pdf_path) {
    const installment = await client.from("oliveira_rent_installments")
      .select("reference_month,tenancy:oliveira_tenancies(tenant_id,property:oliveira_properties(title),tenant:oliveira_profiles(full_name))")
      .eq("id", asString(charge.installment_id)).single();
    if (installment.error) throw installment.error;
    const bytes = await buildRentReceiptPdf({
      receiptNumber: receipt.data.receipt_number,
      tenantName: installment.data.tenancy.tenant.full_name,
      propertyTitle: installment.data.tenancy.property.title,
      referenceMonth: installment.data.reference_month,
      amount: Number(charge.amount),
      paidAt,
      issuedBy: "Asaas via webhook",
    });
    const path = `receipts/${installment.data.tenancy.tenant_id}/${receipt.data.id}.pdf`;
    const upload = await client.storage.from("oliveira-private-documents")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw upload.error;
    const update = await client.from("oliveira_rent_receipts").update({ pdf_path: path })
      .eq("id", receipt.data.id);
    if (update.error) throw update.error;
    receipt.data.pdf_path = path;
  }
  return { receipt: receipt.data, created };
}

async function settleCharge(charge: JsonObject, paidAt: string, received: boolean) {
  const client = serviceClient();
  const now = new Date().toISOString();
  const chargeId = asString(charge.id);
  const status = received ? "received" : "confirmed";
  const updatedCharge = await client.from("oliveira_billing_charges").update({
    status,
    confirmed_at: asString(charge.confirmed_at) || paidAt,
    received_at: received ? paidAt : charge.received_at,
    last_event_at: now,
    updated_at: now,
  }).eq("id", chargeId).select().single();
  if (updatedCharge.error) throw updatedCharge.error;

  const installmentId = asString(charge.installment_id);
  if (!installmentId) return "charge_without_installment";
  const installment = await client.from("oliveira_rent_installments").select("*")
    .eq("id", installmentId).single();
  if (installment.error) throw installment.error;
  if (asString(charge.kind) === "late_adjustment") {
    const principalPaidAt = installment.data.principal_paid_at ?? paidAt;
    const settled = await client.from("oliveira_rent_installments").update({
      status: "paid",
      paid_at: principalPaidAt,
      settled_at: paidAt,
      payment_source: "asaas",
    }).eq("id", installmentId);
    if (settled.error) throw settled.error;
  } else {
    const paidDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(paidAt));
    const calculation = paidDate > installment.data.due_date
      ? await client.rpc("oliveira_billing_calculate_late_adjustment", {
        p_installment_id: installmentId,
        p_paid_at: paidAt,
      })
      : { data: 0, error: null };
    if (calculation.error) throw calculation.error;
    const lateAmount = Number(calculation.data ?? 0);
    const installmentUpdate = await client.from("oliveira_rent_installments").update({
      principal_paid_at: paidAt,
      paid_at: paidAt,
      paid_amount: Number(charge.amount),
      payment_source: "asaas",
      status: lateAmount > 0 ? "late" : "paid",
      settled_at: lateAmount > 0 ? null : paidAt,
    }).eq("id", installmentId);
    if (installmentUpdate.error) throw installmentUpdate.error;
    if (lateAmount > 0) {
      const existing = await client.from("oliveira_billing_charges").select("id")
        .eq("installment_id", installmentId).eq("kind", "late_adjustment")
        .not("status", "in", "(refused,cancelled,refunded,chargeback)").limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        const adjustmentId = crypto.randomUUID();
        const inserted = await client.from("oliveira_billing_charges").insert({
          id: adjustmentId,
          installment_id: installmentId,
          tenancy_id: charge.tenancy_id,
          tenant_id: charge.tenant_id,
          kind: "late_adjustment",
          method: "manual",
          status: "draft",
          amount: lateAmount,
          due_date: saoPauloDate(),
          external_reference: chargeReference(adjustmentId),
          metadata: {
            requires_admin_authorization: true,
            source_principal_charge_id: chargeId,
            principal_paid_at: paidAt,
          },
        });
        if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
      }
    }
  }
  const receiptResult = await issueReceipt(updatedCharge.data as JsonObject, paidAt);
  if (receiptResult.created) {
    await client.from("oliveira_notifications").insert({
      recipient_id: charge.tenant_id,
      event_type: "payment_paid",
      title: asString(charge.kind) === "late_adjustment" ? "Multa e juros confirmados" : "Pagamento confirmado",
      body: "A confirmacao do Asaas foi recebida e o recibo esta disponivel.",
      entity_type: "rent_receipt",
      entity_id: receiptResult.receipt.id,
      action_url: "/inquilino/comprovantes",
    });
  }
  return status;
}

async function findOrCreatePaymentCharge(payload: JsonObject, externalReference: string) {
  const client = serviceClient();
  const payment = asObject(payload.payment);
  const paymentId = asString(payment.id);
  if (paymentId) {
    const byId = await client.from("oliveira_billing_charges").select("*")
      .eq("provider_payment_id", paymentId).maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return byId.data;
  }
  if (externalReference.startsWith("oliveira:charge:")) {
    const byReference = await client.from("oliveira_billing_charges").select("*")
      .eq("external_reference", externalReference).maybeSingle();
    if (byReference.error) throw byReference.error;
    if (byReference.data) return byReference.data;
  }
  const agreement = await findAgreement(payload, externalReference);
  if (!agreement) return null;
  const dueDate = asString(payment.dueDate);
  if (!dueDate || dueDate < agreement.starts_on || (agreement.ends_on && dueDate > agreement.ends_on)) return null;
  const installment = await client.from("oliveira_rent_installments").select("*")
    .eq("tenancy_id", agreement.tenancy_id).eq("due_date", dueDate)
    .is("principal_paid_at", null).maybeSingle();
  if (installment.error) throw installment.error;
  if (!installment.data) return null;
  const existing = await client.from("oliveira_billing_charges").select("*")
    .eq("installment_id", installment.data.id).eq("kind", "rent_principal")
    .not("status", "in", "(refused,cancelled,refunded,chargeback)")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const amount = installmentNetAmount(installment.data as JsonObject);
  if (amount <= 0) return null;
  const id = crypto.randomUUID();
  const inserted = await client.from("oliveira_billing_charges").insert({
    id,
    installment_id: installment.data.id,
    agreement_id: agreement.id,
    tenancy_id: agreement.tenancy_id,
    tenant_id: agreement.tenant_id,
    kind: "rent_principal",
    method: agreement.method === "pix_automatic" ? "pix_automatic" : "credit_card",
    status: "pending",
    amount,
    due_date: dueDate,
    external_reference: chargeReference(id),
    provider_payment_id: paymentId || null,
    provider_status: asString(payment.status) || null,
    metadata: { created_from_webhook: true },
  }).select().single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function reverseCharge(charge: JsonObject, eventType: string) {
  const client = serviceClient();
  const now = new Date().toISOString();
  const chargeStatus = eventType.includes("CHARGEBACK") ? "chargeback" : "refunded";
  const update = await client.from("oliveira_billing_charges").update({
    status: chargeStatus,
    refunded_at: now,
    last_event_at: now,
    updated_at: now,
  }).eq("id", asString(charge.id));
  if (update.error) throw update.error;
  await client.from("oliveira_rent_receipts").update({
    status: "voided",
    voided_at: now,
    void_reason: eventType,
  }).eq("billing_charge_id", asString(charge.id)).eq("status", "active");
  if (charge.installment_id) {
    await client.from("oliveira_rent_installments").update({
      status: "under_review",
      settled_at: null,
    }).eq("id", asString(charge.installment_id));
  }
  await client.from("oliveira_notifications").insert({
    recipient_id: charge.tenant_id,
    event_type: "payment_reversed",
    title: "Pagamento em revisao",
    body: "O Asaas informou uma reversao. A administracao fara a conciliacao.",
    entity_type: "billing_charge",
    entity_id: charge.id,
    action_url: "/inquilino/comprovantes",
  });
  return chargeStatus;
}

async function flagReversalReview(charge: JsonObject, eventType: string) {
  const client = serviceClient();
  const now = new Date().toISOString();
  const update = await client.from("oliveira_billing_charges").update({
    status: "manual_review",
    error_code: eventType.toLowerCase(),
    error_message: "Reversao parcial ou em andamento exige conciliacao administrativa",
    last_event_at: now,
    updated_at: now,
  }).eq("id", asString(charge.id));
  if (update.error) throw update.error;
  if (eventType.includes("PARTIALLY_REFUNDED")) {
    await client.from("oliveira_rent_receipts").update({
      status: "voided",
      voided_at: now,
      void_reason: eventType,
    }).eq("billing_charge_id", asString(charge.id)).eq("status", "active");
  }
  if (charge.installment_id) {
    await client.from("oliveira_rent_installments").update({
      status: "under_review",
      settled_at: null,
    }).eq("id", asString(charge.installment_id));
  }
  return "manual_review";
}

async function handlePayment(event: JsonObject) {
  const client = serviceClient();
  const payload = asObject(event.payload);
  const payment = asObject(payload.payment);
  const eventType = asString(event.event_type).toUpperCase();
  const charge = await findOrCreatePaymentCharge(payload, asString(event.external_reference));
  if (!charge) return "payment_not_mapped";
  const paymentId = asString(payment.id);
  const providerValue = asNumber(payment.value);
  const billingType = asString(payment.billingType).toUpperCase();
  const resolvedMethod = charge.method === "manual"
    ? billingType === "CREDIT_CARD"
      ? "credit_card"
      : billingType === "PIX"
        ? "pix"
        : charge.method
    : charge.method;
  if (providerValue !== null && Math.abs(providerValue - Number(charge.amount)) > 0.009) {
    const mismatch = await client.from("oliveira_billing_charges").update({
      status: "manual_review",
      provider_payment_id: paymentId || charge.provider_payment_id,
      provider_status: asString(payment.status) || eventType,
      error_code: "amount_mismatch",
      error_message: `Valor local ${charge.amount}; valor Asaas ${providerValue}`,
      last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    if (mismatch.error) throw mismatch.error;
    return "amount_mismatch";
  }
  const baseUpdate = await client.from("oliveira_billing_charges").update({
    method: resolvedMethod,
    provider_payment_id: paymentId || charge.provider_payment_id,
    provider_status: asString(payment.status) || eventType,
    invoice_url: asString(payment.invoiceUrl) || charge.invoice_url,
    last_event_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", charge.id);
  if (baseUpdate.error) throw baseUpdate.error;

  if (eventType.includes("PAYMENT_PARTIALLY_REFUNDED") || eventType.includes("PAYMENT_REFUND_IN_PROGRESS")) {
    return flagReversalReview({ ...charge, provider_payment_id: paymentId }, eventType);
  }
  if (eventType.includes("PAYMENT_REFUNDED") || eventType.includes("CHARGEBACK")) {
    return reverseCharge({ ...charge, provider_payment_id: paymentId }, eventType);
  }
  if (/DELETED|CANCELLED/.test(eventType)) {
    const cancelled = await client.from("oliveira_billing_charges").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    if (cancelled.error) throw cancelled.error;
    return "cancelled";
  }
  if (/OVERDUE/.test(eventType)) {
    await client.from("oliveira_billing_charges").update({ status: "overdue", updated_at: new Date().toISOString() }).eq("id", charge.id);
    return "overdue";
  }
  if (/REFUSED|RISK_ANALYSIS/.test(eventType)) {
    await client.from("oliveira_billing_charges").update({ status: "refused", updated_at: new Date().toISOString() }).eq("id", charge.id);
    return "refused";
  }
  const received = eventType.includes("PAYMENT_RECEIVED");
  const confirmedCard = eventType.includes("PAYMENT_CONFIRMED") &&
    (billingType === "CREDIT_CARD" || resolvedMethod === "credit_card");
  if (received || confirmedCard) {
    if (["refunded", "chargeback"].includes(asString(charge.status)) ||
      (charge.status === "manual_review" && /refund|chargeback/.test(asString(charge.error_code)))) {
      return "manual_review_after_reversal";
    }
    const paidAt = parseProviderDate(
      payment.paymentDate || payment.confirmedDate || event.provider_created_at,
    ) ?? new Date().toISOString();
    return settleCharge({ ...charge, method: resolvedMethod, provider_payment_id: paymentId }, paidAt, received);
  }
  const pending = await client.from("oliveira_billing_charges").update({
    status: "pending",
    updated_at: new Date().toISOString(),
  }).eq("id", charge.id).in("status", ["creating", "scheduled", "pending", "overdue"]);
  if (pending.error) throw pending.error;
  return "pending";
}

async function handleInstruction(eventType: string, payload: JsonObject) {
  const client = serviceClient();
  const instruction = asObject(payload.paymentInstruction);
  const instructionId = asString(instruction.id);
  const paymentId = asString(instruction.payment);
  let query = client.from("oliveira_billing_charges").select("*");
  query = paymentId ? query.eq("provider_payment_id", paymentId) : query.eq("provider_instruction_id", instructionId);
  const charge = await query.limit(1).maybeSingle();
  if (charge.error) throw charge.error;
  if (!charge.data) return "instruction_not_mapped";
  const upper = `${eventType} ${asString(instruction.status)}`.toUpperCase();
  const refused = /REFUS|REJECT|CANCEL|FAIL/.test(upper);
  const update = await client.from("oliveira_billing_charges").update({
    provider_instruction_id: instructionId || charge.data.provider_instruction_id,
    provider_status: asString(instruction.status) || eventType,
    status: refused ? "refused" : charge.data.status,
    error_message: asString(instruction.refusalReason).slice(0, 500) || null,
    last_event_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", charge.data.id);
  if (update.error) throw update.error;
  if (refused && charge.data.agreement_id) {
    await client.from("oliveira_billing_agreements").update({
      status: "fallback_required",
      fallback_reason: asString(instruction.refusalReason) || eventType,
      updated_at: new Date().toISOString(),
    }).eq("id", charge.data.agreement_id);
  }
  return refused ? "refused" : "instruction_updated";
}

async function processEvent(event: JsonObject) {
  const eventType = asString(event.event_type).toUpperCase();
  const payload = asObject(event.payload);
  if (eventType.includes("ELIGIBILITY")) return handleEligibility(eventType, payload);
  if (eventType.includes("PAYMENT_INSTRUCTION")) return handleInstruction(eventType, payload);
  if (eventType.startsWith("PAYMENT_")) return handlePayment(event);
  if (eventType.includes("AUTHORIZATION")) return handleAuthorization(eventType, payload, asString(event.external_reference));
  if (eventType.startsWith("SUBSCRIPTION_")) return handleSubscription(eventType, payload, asString(event.external_reference));
  if (eventType.startsWith("CHECKOUT_")) return handleCheckout(eventType, payload, asString(event.external_reference));
  return "event_ignored";
}

serve(async (request) => {
  await requireCron(request);
  const client = serviceClient();
  const body = asObject(await request.json().catch(() => ({})));
  const limit = Math.max(1, Math.min(100, Number(body.limit ?? 50)));
  const queued = await client.from("oliveira_asaas_webhook_events").select("*")
    .eq("is_oliveira", true).in("status", ["pending", "failed"])
    .lt("attempts", 8).order("received_at", { ascending: true }).limit(limit);
  if (queued.error) throw queued.error;
  const results: Array<JsonObject> = [];
  for (const event of queued.data ?? []) {
    const claimed = await client.from("oliveira_asaas_webhook_events").update({
      status: "processing",
      attempts: Number(event.attempts ?? 0) + 1,
      error_message: null,
    }).eq("id", event.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) continue;
    try {
      const outcome = await processEvent(event as JsonObject);
      const completed = await client.from("oliveira_asaas_webhook_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", event.id);
      if (completed.error) throw completed.error;
      results.push({ event_id: event.event_id, outcome });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao processar evento";
      await client.from("oliveira_asaas_webhook_events").update({
        status: "failed",
        error_message: message.slice(0, 1000),
      }).eq("id", event.id);
      results.push({ event_id: event.event_id, outcome: "failed" });
    }
  }
  return json({ processed: results.length, results });
});
