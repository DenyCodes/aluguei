import { audit, json, requireAdmin, serve, serviceClient } from "../_shared/http.ts";
import {
  asaasRequest,
  getAsaasEnvironment,
  type JsonObject,
} from "../_shared/oliveira-asaas.ts";

const WEBHOOK_NAME = "Imobiliaria Oliveira Billing";
const EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
  "CHECKOUT_CREATED",
  "CHECKOUT_CANCELED",
  "CHECKOUT_EXPIRED",
  "CHECKOUT_PAID",
  "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CANCELLED",
] as const;

const asString = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const client = serviceClient();
  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
  const apiKey = Deno.env.get("ASAAS_API_KEY") ?? "";
  if (webhookToken.length < 32) throw new Error("ASAAS_WEBHOOK_TOKEN deve possuir pelo menos 32 caracteres");
  if (webhookToken === apiKey) throw new Error("O token do webhook deve ser diferente da chave da API");
  const account = await asaasRequest<JsonObject>("/myAccount");
  const accountId = asString(account.id);
  const expectedAccount = Deno.env.get("ASAAS_ACCOUNT_ID") ?? "";
  if (!expectedAccount || !accountId || accountId !== expectedAccount) {
    throw new Error("A credencial Asaas nao pertence a conta Oliveira configurada");
  }
  const settings = await client.from("oliveira_settings").select("email_admin_copy").eq("id", 1).single();
  if (settings.error) throw settings.error;
  const email = (Deno.env.get("ASAAS_WEBHOOK_EMAIL") ?? settings.data.email_admin_copy ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Configure ASAAS_WEBHOOK_EMAIL para alertas operacionais");
  }
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("SUPABASE_URL nao configurada");
  const webhookUrl = `${supabaseUrl}/functions/v1/oliveira-asaas-webhook`;
  const listed = await asaasRequest<{ data?: Array<JsonObject> }>("/webhooks?limit=100&offset=0");
  const existing = (listed.data ?? []).find((item) =>
    asString(item.name) === WEBHOOK_NAME || asString(item.url) === webhookUrl
  );
  const payload: JsonObject = {
    name: WEBHOOK_NAME,
    url: webhookUrl,
    email,
    enabled: true,
    interrupted: false,
    sendType: "SEQUENTIALLY",
    authToken: webhookToken,
    events: [...EVENTS],
  };
  const configured = existing
    ? await asaasRequest<JsonObject>(`/webhooks/${encodeURIComponent(asString(existing.id))}`, {
      method: "PUT",
      body: payload,
    })
    : await asaasRequest<JsonObject>("/webhooks", { method: "POST", body: payload });
  const webhookId = asString(configured.id || existing?.id);
  if (!webhookId) throw new Error("Asaas nao retornou o identificador do webhook");
  const now = new Date().toISOString();
  const integration = await client.from("oliveira_asaas_integration").update({
    environment: getAsaasEnvironment(),
    account_id: accountId,
    webhook_id: webhookId,
    webhook_url: webhookUrl,
    webhook_configured_at: now,
    updated_at: now,
  }).eq("id", 1);
  if (integration.error) throw integration.error;
  await audit(admin.id, existing ? "billing.webhook.updated" : "billing.webhook.created", "asaas_webhook", webhookId, {
    environment: getAsaasEnvironment(),
    event_count: EVENTS.length,
    url: webhookUrl,
  }, request);
  return json({
    configured: true,
    webhook_id: webhookId,
    environment: getAsaasEnvironment(),
    event_count: EVENTS.length,
    billing_unchanged: true,
    note: "A configuracao do webhook nao altera as flags de cobranca.",
  });
});
