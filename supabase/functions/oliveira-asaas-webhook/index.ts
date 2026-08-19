import { serviceClient } from "../_shared/http.ts";
import {
  constantTimeEqual,
  minimizedUnknownWebhook,
  normalizeWebhookPayload,
  webhookBelongsToOliveira,
} from "../_shared/oliveira-asaas.ts";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const configuredToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
  const receivedToken = request.headers.get("asaas-access-token") ?? "";
  if (!configuredToken || !constantTimeEqual(receivedToken, configuredToken)) {
    return response({ error: "unauthorized" }, 401);
  }
  const announcedLength = Number(request.headers.get("content-length") ?? "0");
  if (announcedLength > 524_288) return response({ error: "payload_too_large" }, 413);

  let raw: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 524_288) {
      return response({ error: "payload_too_large" }, 413);
    }
    raw = JSON.parse(text);
  } catch {
    return response({ error: "invalid_json" }, 400);
  }

  const normalized = normalizeWebhookPayload(raw);
  if (!normalized.eventId || !normalized.eventType) {
    return response({ accepted: true, ignored: true });
  }
  const client = serviceClient();
  const local = await webhookBelongsToOliveira(client, normalized);
  const storedPayload = local
    ? normalized.payload
    : minimizedUnknownWebhook(normalized);
  const inserted = await client.from("oliveira_asaas_webhook_events").insert({
    event_id: normalized.eventId,
    event_type: normalized.eventType,
    account_id: normalized.accountId || null,
    resource_kind: normalized.resourceKind,
    resource_id: normalized.resourceId || null,
    external_reference: normalized.externalReference || null,
    is_oliveira: local,
    payload: storedPayload,
    status: local ? "pending" : "ignored",
    provider_created_at: normalized.providerCreatedAt,
    processed_at: local ? null : new Date().toISOString(),
  });
  if (inserted.error && inserted.error.code !== "23505") {
    console.error("Oliveira webhook persistence failed", { code: inserted.error.code });
    return response({ error: "persistence_failed" }, 500);
  }
  await client.from("oliveira_asaas_integration").update({
    last_webhook_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  return response({ accepted: true, duplicate: inserted.error?.code === "23505" });
});
