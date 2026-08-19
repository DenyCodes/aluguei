import { json, serve, serviceClient } from "../_shared/http.ts";
import {
  AsaasApiError,
  asaasRequest,
  assertOliveiraAsaasAccount,
  businessDaysUntil,
  chargeReference,
  finishOperation,
  getBillingFlags,
  installmentNetAmount,
  markOperationRunning,
  reserveOperation,
  saoPauloDate,
  type JsonObject,
} from "../_shared/oliveira-asaas.ts";

const asString = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

async function requireCron(request: Request) {
  const client = serviceClient();
  const validation = await client.rpc("oliveira_validate_cron_secret", {
    p_secret: request.headers.get("x-oliveira-cron-secret") ?? "",
  });
  if (validation.error || validation.data !== true) throw new Error("Acesso negado");
}

serve(async (request) => {
  await requireCron(request);
  const client = serviceClient();
  const flags = await getBillingFlags(client);
  if (!flags.billingEnabled || !flags.automaticCreationEnabled || !flags.billingStartedAt) {
    return json({ disabled: true, created: 0 });
  }
  await assertOliveiraAsaasAccount();
  const today = saoPauloDate();
  const agreements = await client.from("oliveira_billing_agreements")
    .select("*,customer:oliveira_asaas_customers(provider_customer_id)")
    .eq("method", "pix_automatic")
    .eq("status", "active")
    .gte("created_at", flags.billingStartedAt)
    .not("provider_authorization_id", "is", null)
    .order("created_at", { ascending: true });
  if (agreements.error) throw agreements.error;

  const results: Array<JsonObject> = [];
  for (const agreement of agreements.data ?? []) {
    const installments = await client.from("oliveira_rent_installments").select("*")
      .eq("tenancy_id", agreement.tenancy_id)
      .gte("due_date", today)
      .gte("due_date", agreement.starts_on)
      .lte("due_date", agreement.ends_on)
      .in("status", ["upcoming", "pending"])
      .is("principal_paid_at", null)
      .order("due_date", { ascending: true })
      .limit(3);
    if (installments.error) throw installments.error;
    for (const installment of installments.data ?? []) {
      const businessDays = businessDaysUntil(today, installment.due_date);
      if (businessDays < 2 || businessDays > 10) continue;

      // Qualquer tentativa automatica anterior bloqueia nova tentativa para a
      // mesma parcela. Uma nova cobranca so pode nascer de acao humana.
      const previous = await client.from("oliveira_billing_charges").select("id,status")
        .eq("installment_id", installment.id).eq("kind", "rent_principal")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (previous.error) throw previous.error;
      if (previous.data) {
        results.push({ installment_id: installment.id, outcome: "already_attempted", status: previous.data.status });
        continue;
      }
      const amount = installmentNetAmount(installment as JsonObject);
      if (amount <= 0) {
        results.push({ installment_id: installment.id, outcome: "no_balance" });
        continue;
      }
      const chargeId = crypto.randomUUID();
      const externalReference = chargeReference(chargeId);
      const inserted = await client.from("oliveira_billing_charges").insert({
        id: chargeId,
        installment_id: installment.id,
        agreement_id: agreement.id,
        tenancy_id: agreement.tenancy_id,
        tenant_id: agreement.tenant_id,
        kind: "rent_principal",
        method: "pix_automatic",
        status: "creating",
        amount,
        due_date: installment.due_date,
        external_reference: externalReference,
        metadata: {
          automatic_creation: true,
          automatic_attempt_number: 1,
          business_days_before_due: businessDays,
          retry_policy: "NOT_ALLOWED",
        },
      }).select().single();
      if (inserted.error) {
        if (inserted.error.code === "23505") continue;
        throw inserted.error;
      }
      const customer = Array.isArray(agreement.customer) ? agreement.customer[0] : agreement.customer;
      const customerId = asString(customer?.provider_customer_id);
      if (!customerId) {
        await client.from("oliveira_billing_charges").update({
          status: "manual_review",
          error_code: "customer_mapping_missing",
          updated_at: new Date().toISOString(),
        }).eq("id", chargeId);
        results.push({ installment_id: installment.id, outcome: "customer_mapping_missing" });
        continue;
      }
      const requestPayload: JsonObject = {
        customer: customerId,
        billingType: "PIX",
        value: amount,
        dueDate: installment.due_date,
        description: `Aluguel ${installment.reference_month} - Imobiliaria Oliveira`,
        externalReference,
        pixAutomaticAuthorizationId: agreement.provider_authorization_id,
      };
      const operation = await reserveOperation(client, {
        operationKey: `pix-automatic-payment:${chargeId}`,
        operationType: "create_payment",
        agreementId: agreement.id,
        chargeId,
        requestPayload,
      });
      if (!await markOperationRunning(client, operation.id)) {
        results.push({ installment_id: installment.id, charge_id: chargeId, outcome: "already_processing" });
        continue;
      }
      try {
        const payment = await asaasRequest<JsonObject>("/payments", {
          method: "POST",
          body: requestPayload,
        });
        const paymentId = asString(payment.id);
        if (!paymentId) throw new Error("Asaas nao retornou a cobranca automatica");
        const update = await client.from("oliveira_billing_charges").update({
          status: "scheduled",
          provider_payment_id: paymentId,
          provider_status: asString(payment.status) || "PENDING",
          invoice_url: asString(payment.invoiceUrl) || null,
          updated_at: new Date().toISOString(),
        }).eq("id", chargeId);
        if (update.error) throw update.error;
        await finishOperation(client, operation.id, { status: "succeeded", providerResourceId: paymentId });
        results.push({ installment_id: installment.id, charge_id: chargeId, outcome: "scheduled" });
      } catch (error) {
        const unknown = error instanceof AsaasApiError && error.retryable;
        await finishOperation(client, operation.id, {
          status: unknown ? "unknown" : "permanent_failed",
          error: error instanceof Error ? error.message : "Falha Asaas",
        });
        await client.from("oliveira_billing_charges").update({
          status: unknown ? "manual_review" : "refused",
          error_code: unknown ? "provider_result_unknown" : "provider_rejected",
          error_message: (error instanceof Error ? error.message : "Falha Asaas").slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("id", chargeId);
        if (!unknown) {
          await client.from("oliveira_billing_agreements").update({
            status: "fallback_required",
            fallback_reason: "automatic_payment_creation_rejected",
            updated_at: new Date().toISOString(),
          }).eq("id", agreement.id);
        }
        results.push({ installment_id: installment.id, charge_id: chargeId, outcome: unknown ? "manual_review" : "rejected" });
      }
    }
  }
  return json({ date: today, agreements: agreements.data?.length ?? 0, results });
});
