import { json, serve, serviceClient } from "../_shared/http.ts";
import { verifySvixSignature } from "../_shared/resend-webhook-security.ts";

const trackedEvents = new Set([
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "failed",
  "suppressed",
]);

type ResendWebhookPayload = {
  type?: unknown;
  created_at?: unknown;
  data?: { email_id?: unknown } | null;
};

serve(async (request) => {
  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id") ?? "";
  const svixTimestamp = request.headers.get("svix-timestamp") ?? "";
  const svixSignature = request.headers.get("svix-signature") ?? "";
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
  if (!secret)
    return json({ error: "Webhook temporariamente indisponivel" }, 503);

  const verified = await verifySvixSignature({
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
    secret,
  });
  if (!verified) return json({ error: "Assinatura do webhook invalida" }, 401);

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return json({ error: "Corpo do webhook invalido" }, 400);
  }

  const eventType = String(payload.type ?? "").replace(/^email\./, "");
  if (!trackedEvents.has(eventType)) {
    // Aberturas e cliques, assim como qualquer evento nao operacional, nao sao armazenados.
    return json({ received: true, ignored: true });
  }

  const providerMessageId = String(payload.data?.email_id ?? "");
  if (!providerMessageId)
    return json({ error: "Identificador do e-mail ausente" }, 400);

  const parsedOccurredAt = new Date(String(payload.created_at ?? ""));
  const occurredAt = Number.isNaN(parsedOccurredAt.getTime())
    ? new Date(Number(svixTimestamp) * 1000).toISOString()
    : parsedOccurredAt.toISOString();

  const recorded = await serviceClient().rpc(
    "oliveira_record_email_provider_event",
    {
      p_svix_id: svixId,
      p_provider_message_id: providerMessageId,
      p_event_type: eventType,
      p_occurred_at: occurredAt,
    },
  );
  if (recorded.error) throw recorded.error;

  return json({ received: true, ...(recorded.data ?? {}) });
});
