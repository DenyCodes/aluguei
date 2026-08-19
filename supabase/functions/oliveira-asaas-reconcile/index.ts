import { json, requireAdmin, serve, serviceClient } from "../_shared/http.ts";
import {
  AsaasApiError,
  asaasRequest,
  findPaymentByExternalReference,
  type JsonObject,
} from "../_shared/oliveira-asaas.ts";

const asString = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

async function authorize(request: Request) {
  const client = serviceClient();
  const supplied = request.headers.get("x-oliveira-cron-secret") ?? "";
  if (supplied) {
    const validation = await client.rpc("oliveira_validate_cron_secret", { p_secret: supplied });
    if (!validation.error && validation.data === true) return null;
  }
  const admin = await requireAdmin(request, { elevated: true });
  return admin.id;
}

serve(async (request) => {
  const requestedBy = await authorize(request);
  const client = serviceClient();
  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(200, Number(body?.limit ?? 100)));
  const run = await client.from("oliveira_billing_reconciliation_runs").insert({
    requested_by: requestedBy,
  }).select().single();
  if (run.error) throw run.error;
  const findings: Array<JsonObject> = [];
  let inspected = 0;
  let repaired = 0;
  let divergences = 0;
  try {
    const account = await asaasRequest<JsonObject>("/myAccount");
    const expectedAccount = Deno.env.get("ASAAS_ACCOUNT_ID") ?? "";
    const actualAccount = asString(account.id);
    if (!expectedAccount || !actualAccount || actualAccount !== expectedAccount) {
      throw new Error("Conta Asaas diferente da conta Oliveira configurada");
    }

    const charges = await client.from("oliveira_billing_charges").select("*")
      .in("status", ["creating", "pending", "scheduled", "overdue", "confirmed", "received", "refused", "manual_review"])
      .order("updated_at", { ascending: true }).limit(limit);
    if (charges.error) throw charges.error;
    for (const charge of charges.data ?? []) {
      inspected += 1;
      try {
        let provider: JsonObject | null = null;
        let resourceKind = "payment";
        if (charge.provider_payment_id) {
          provider = await asaasRequest<JsonObject>(`/payments/${encodeURIComponent(charge.provider_payment_id)}`);
        } else if (charge.provider_checkout_id) {
          resourceKind = "checkout";
          provider = await asaasRequest<JsonObject>(`/checkouts/${encodeURIComponent(charge.provider_checkout_id)}`);
        } else {
          provider = await findPaymentByExternalReference(charge.external_reference);
        }
        if (!provider) {
          findings.push({ type: "provider_resource_missing", charge_id: charge.id });
          divergences += 1;
          continue;
        }
        const providerId = asString(provider.id);
        const providerStatus = asString(provider.status).toUpperCase();
        const patch: JsonObject = {
          provider_status: providerStatus || null,
          invoice_url: asString(provider.invoiceUrl || provider.link || provider.url) || charge.invoice_url,
          updated_at: new Date().toISOString(),
        };
        if (resourceKind === "payment" && providerId && !charge.provider_payment_id) {
          patch.provider_payment_id = providerId;
          repaired += 1;
        }
        if (resourceKind === "checkout" && providerId && !charge.provider_checkout_id) {
          patch.provider_checkout_id = providerId;
          repaired += 1;
        }
        const providerPaid = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(providerStatus);
        const localPaid = ["confirmed", "received"].includes(charge.status);
        if (providerPaid !== localPaid) {
          patch.status = "manual_review";
          patch.error_code = providerPaid ? "paid_webhook_missing" : "provider_local_divergence";
          patch.error_message = providerPaid
            ? "Provedor indica pagamento, mas o webhook correspondente nao foi processado"
            : "Estado local pago diverge do provedor";
          findings.push({
            type: providerPaid ? "paid_webhook_missing" : "provider_local_divergence",
            charge_id: charge.id,
            provider_status: providerStatus,
            local_status: charge.status,
          });
          divergences += 1;
        }
        const updated = await client.from("oliveira_billing_charges").update(patch).eq("id", charge.id);
        if (updated.error) throw updated.error;
      } catch (error) {
        if (error instanceof AsaasApiError && error.status === 404) {
          findings.push({ type: "provider_resource_404", charge_id: charge.id });
          divergences += 1;
          continue;
        }
        throw error;
      }
    }

    const remaining = Math.max(0, limit - inspected);
    if (remaining > 0) {
      const agreements = await client.from("oliveira_billing_agreements").select("*")
        .in("status", ["setup_pending", "awaiting_authorization", "active", "fallback_required"])
        .order("updated_at", { ascending: true }).limit(remaining);
      if (agreements.error) throw agreements.error;
      for (const agreement of agreements.data ?? []) {
        inspected += 1;
        try {
          let provider: JsonObject | null = null;
          if (agreement.provider_authorization_id) {
            provider = await asaasRequest<JsonObject>(`/pix/automatic/authorizations/${encodeURIComponent(agreement.provider_authorization_id)}`);
          } else if (agreement.provider_subscription_id) {
            provider = await asaasRequest<JsonObject>(`/subscriptions/${encodeURIComponent(agreement.provider_subscription_id)}`);
          } else if (agreement.provider_checkout_id) {
            provider = await asaasRequest<JsonObject>(`/checkouts/${encodeURIComponent(agreement.provider_checkout_id)}`);
          }
          if (!provider) {
            findings.push({ type: "agreement_provider_resource_missing", agreement_id: agreement.id });
            divergences += 1;
            continue;
          }
          const providerStatus = asString(provider.status).toUpperCase();
          const update = await client.from("oliveira_billing_agreements").update({
            provider_status: providerStatus || agreement.provider_status,
            updated_at: new Date().toISOString(),
          }).eq("id", agreement.id);
          if (update.error) throw update.error;
          const providerInactive = /CANCEL|EXPIRE|INACTIV|REFUS|REJECT/.test(providerStatus);
          if (providerInactive && agreement.status === "active") {
            findings.push({
              type: "agreement_status_divergence",
              agreement_id: agreement.id,
              provider_status: providerStatus,
              local_status: agreement.status,
            });
            divergences += 1;
          }
        } catch (error) {
          if (error instanceof AsaasApiError && error.status === 404) {
            findings.push({ type: "agreement_provider_resource_404", agreement_id: agreement.id });
            divergences += 1;
            continue;
          }
          throw error;
        }
      }
    }
    const completed = await client.from("oliveira_billing_reconciliation_runs").update({
      status: "completed",
      inspected_count: inspected,
      repaired_count: repaired,
      divergence_count: divergences,
      findings: findings.slice(0, 200),
      completed_at: new Date().toISOString(),
    }).eq("id", run.data.id);
    if (completed.error) throw completed.error;
    return json({ run_id: run.data.id, inspected, repaired, divergences, findings });
  } catch (error) {
    await client.from("oliveira_billing_reconciliation_runs").update({
      status: "failed",
      inspected_count: inspected,
      repaired_count: repaired,
      divergence_count: divergences,
      findings: findings.slice(0, 200),
      error_message: (error instanceof Error ? error.message : "Falha na conciliacao").slice(0, 1000),
      completed_at: new Date().toISOString(),
    }).eq("id", run.data.id);
    throw error;
  }
});
