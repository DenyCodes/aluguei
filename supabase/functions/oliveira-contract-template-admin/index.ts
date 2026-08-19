import { validateTemplatePayload } from "../_shared/contract-template.ts";
import { audit, json, requireAdmin, serve, serviceClient } from "../_shared/http.ts";

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  if (body.action !== "save") throw new Error("Ação de modelo inválida");
  const name = String(body.name ?? "").trim().slice(0, 160);
  if (!name) throw new Error("Informe o nome do modelo");
  const content = validateTemplatePayload(body.content);
  const client = serviceClient();
  const templateId = String(body.template_id ?? "").trim();
  const values = { name, description: String(body.description ?? "").trim().slice(0, 1000), content, active: true, created_by: admin.id, updated_at: new Date().toISOString() };
  const query = templateId
    ? client.from("oliveira_contract_templates").update(values).eq("id", templateId).select().single()
    : client.from("oliveira_contract_templates").insert(values).select().single();
  const { data, error } = await query;
  if (error || !data) throw error ?? new Error("Modelo não salvo");
  await audit(admin.id, templateId ? "contract_template.updated" : "contract_template.created", "contract_template", data.id, { name }, request);
  return json({ template: data });
});
