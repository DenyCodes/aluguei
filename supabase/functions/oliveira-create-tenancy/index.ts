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
  const payload = {
    p_admin_id: admin.id,
    p_tenant_id: String(body.tenant_id ?? ""),
    p_property_id: String(body.property_id ?? ""),
    p_starts_on: String(body.starts_on ?? ""),
    p_ends_on: String(body.ends_on ?? ""),
    p_monthly_rent: Number(body.monthly_rent),
    p_due_day: Number(body.due_day),
    p_late_fee_percent: Number(body.late_fee_percent),
    p_monthly_interest_percent: Number(body.monthly_interest_percent),
    p_adjustment_index: String(body.adjustment_index ?? "").trim(),
    p_guarantee_type: String(body.guarantee_type ?? "none").trim(),
  };
  if (
    !payload.p_tenant_id ||
    !payload.p_property_id ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.p_starts_on) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.p_ends_on)
  )
    throw new Error("Preencha inquilino, imóvel e período da locação");
  if (!Number.isFinite(payload.p_monthly_rent) || payload.p_monthly_rent <= 0)
    throw new Error("Informe um aluguel mensal maior que zero");
  if (
    !Number.isInteger(payload.p_due_day) ||
    payload.p_due_day < 1 ||
    payload.p_due_day > 28
  )
    throw new Error("O vencimento deve estar entre os dias 1 e 28");
  if (
    !Number.isFinite(payload.p_late_fee_percent) ||
    payload.p_late_fee_percent < 0 ||
    !Number.isFinite(payload.p_monthly_interest_percent) ||
    payload.p_monthly_interest_percent < 0
  )
    throw new Error("Multa e juros não podem ser negativos");
  if (!payload.p_adjustment_index)
    throw new Error("Informe o índice de reajuste");
  const client = serviceClient();
  const tenant = await client
    .from("oliveira_profiles")
    .select("account_status")
    .eq("id", payload.p_tenant_id)
    .eq("role", "tenant")
    .single();
  if (tenant.error || tenant.data?.account_status !== "active")
    throw new Error("O inquilino precisa estar ativo para criar uma locação");
  const property = await client
    .from("oliveira_properties")
    .select("availability_status,active")
    .eq("id", payload.p_property_id)
    .single();
  if (
    property.error ||
    !property.data?.active ||
    ["maintenance", "archived"].includes(property.data.availability_status)
  )
    throw new Error("O imóvel não está disponível para uma nova locação");
  const { data, error } = await client.rpc(
    "oliveira_admin_create_tenancy_v2",
    payload,
  );
  if (error) throw error;
  const occupied = await client
    .from("oliveira_properties")
    .update({
      availability_status: "rented",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.p_property_id);
  if (occupied.error) throw occupied.error;
  if (body.require_document_approval && data?.tenancy_id) {
    const documents =
      Array.isArray(body.required_document_types) &&
      body.required_document_types.length
        ? body.required_document_types
        : ["profile_photo", "rg_front", "rg_back"];
    const update = await client
      .from("oliveira_tenancies")
      .update({
        require_document_approval: true,
        required_document_types: documents,
      })
      .eq("id", data.tenancy_id);
    if (update.error) throw update.error;
  }
  await audit(
    admin.id,
    "tenancy.edge_completed",
    "tenancy",
    String(data?.tenancy_id ?? ""),
    { installments_created: data?.installments_created },
    request,
  );
  return json(data);
});
