import {
  audit,
  json,
  requireAdmin,
  serve,
  serviceClient,
} from "../_shared/http.ts";

const statuses = new Set([
  "new",
  "contacted",
  "qualified",
  "converted",
  "archived",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  if (body.action !== "update") throw new Error("Ação inválida");

  const leadId = String(body.lead_id ?? "").trim();
  const status = String(body.status ?? "").trim();
  const internalNote = String(body.internal_note ?? "").trim();
  if (!uuidPattern.test(leadId)) throw new Error("Lead inválido");
  if (!statuses.has(status)) throw new Error("Status inválido");
  if (internalNote.length > 2000) throw new Error("Observação muito longa");

  const client = serviceClient();
  const existing = await client
    .from("oliveira_commercial_leads")
    .select("id,status")
    .eq("id", leadId)
    .single();
  if (existing.error || !existing.data) {
    throw existing.error ?? new Error("Lead não encontrado");
  }

  const updated = await client
    .from("oliveira_commercial_leads")
    .update({
      status,
      internal_note: internalNote,
      status_changed_at: new Date().toISOString(),
      status_changed_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select(
      "id,full_name,email,phone_digits,status,source_path,utm_source,utm_medium,utm_campaign,consent_at,internal_note,status_changed_at,status_changed_by,created_at,updated_at",
    )
    .single();
  if (updated.error || !updated.data) {
    throw updated.error ?? new Error("Lead não atualizado");
  }

  await audit(
    admin.id,
    "commercial_lead.updated",
    "commercial_lead",
    leadId,
    { previous_status: existing.data.status, status },
    request,
  );
  return json({ lead: updated.data });
});
