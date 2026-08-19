import {
  audit,
  json,
  requireAdmin,
  serve,
  serviceClient,
} from "../_shared/http.ts";

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  const amount = body.amount == null ? null : Number(body.amount);
  const client = serviceClient();
  if (body.action === "create") {
    const tenancyId = String(body.tenancy_id ?? "");
    const title = String(body.title ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const description = String(body.description ?? "").trim();
    if (!tenancyId || title.length < 4 || description.length < 10)
      throw new Error("Informe a locação, o título e uma descrição detalhada");
    const tenancy = await client
      .from("oliveira_tenancies")
      .select("id,tenant_id,property_id,status")
      .eq("id", tenancyId)
      .single();
    if (tenancy.error || !tenancy.data)
      throw tenancy.error ?? new Error("Locação não encontrada");
    if (tenancy.data.status !== "active")
      throw new Error("A solicitação deve estar vinculada a uma locação ativa");
    const created = await client
      .from("oliveira_maintenance_requests")
      .insert({
        tenancy_id: tenancyId,
        tenant_id: tenancy.data.tenant_id,
        title,
        description,
        status: "requested",
        owner_note: String(body.owner_note ?? "").trim() || null,
        created_by: admin.id,
        source: "admin",
      })
      .select("id")
      .single();
    if (created.error || !created.data)
      throw created.error ?? new Error("Solicitação não criada");
    await client.from("oliveira_notifications").insert({
      recipient_id: tenancy.data.tenant_id,
      event_type: "maintenance_created",
      title: "Nova solicitação de manutenção",
      body: `O proprietário registrou: ${title}`,
      entity_type: "maintenance",
      entity_id: created.data.id,
      action_url: "/inquilino/manutencoes",
    });
    await audit(
      admin.id,
      "maintenance.created_by_admin",
      "maintenance",
      created.data.id,
      { tenancy_id: tenancyId, property_id: tenancy.data.property_id },
      request,
    );
    return json({ created: true, id: created.data.id });
  }
  if (!["authorize", "reject", "credit"].includes(body.action))
    throw new Error("Ação inválida");
  const { data, error } = await client.rpc(
    "oliveira_admin_maintenance_action",
    {
      p_request_id: body.request_id,
      p_action: body.action,
      p_amount: amount,
      p_admin_id: admin.id,
      p_note: body.note ?? null,
    },
  );
  if (error) throw error;
  const requestRow = await client
    .from("oliveira_maintenance_requests")
    .select("tenant_id,title")
    .eq("id", body.request_id)
    .single();
  if (requestRow.data)
    await client
      .from("oliveira_notifications")
      .insert({
        recipient_id: requestRow.data.tenant_id,
        event_type: `maintenance_${body.action}`,
        title:
          body.action === "authorize"
            ? "Manutenção autorizada"
            : body.action === "credit"
              ? "Crédito de manutenção aprovado"
              : "Solicitação de manutenção rejeitada",
        body: String(body.note ?? requestRow.data.title),
        entity_type: "maintenance",
        entity_id: body.request_id,
        action_url: "/inquilino/manutencoes",
      });
  await audit(
    admin.id,
    `maintenance.${body.action}`,
    "maintenance",
    body.request_id,
    { amount, note: body.note ?? null, result: data },
    request,
  );
  return json({ updated: true });
});
