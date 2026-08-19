import {
  audit,
  json,
  requireAdmin,
  serve,
  serviceClient,
} from "../_shared/http.ts";

const documentTypes = new Set([
  "profile_photo",
  "rg_front",
  "rg_back",
  "cpf",
  "proof_of_address",
  "other",
]);
serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  const tenancyId = String(body.tenancy_id ?? "");
  const client = serviceClient();
  const tenancy = await client
    .from("oliveira_tenancies")
    .select("*")
    .eq("id", tenancyId)
    .single();
  if (tenancy.error || !tenancy.data)
    throw tenancy.error ?? new Error("Locação não encontrada");
  if (body.action === "documents") {
    const required = Array.isArray(body.required_document_types)
      ? body.required_document_types
          .map(String)
          .filter((item) => documentTypes.has(item))
      : [];
    const enabled = Boolean(body.require_document_approval);
    if (enabled && !required.length)
      throw new Error("Selecione ao menos um documento obrigatório");
    const updated = await client
      .from("oliveira_tenancies")
      .update({
        require_document_approval: enabled,
        required_document_types: enabled ? required : [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenancyId);
    if (updated.error) throw updated.error;
    await client.from("oliveira_notifications").insert({
      recipient_id: tenancy.data.tenant_id,
      event_type: "document_requirement",
      title: enabled
        ? "Documentação necessária"
        : "Exigência documental removida",
      body: enabled
        ? "Envie os documentos solicitados para liberar a assinatura."
        : "A assinatura não depende mais de aprovação documental.",
      entity_type: "tenancy",
      entity_id: tenancyId,
      action_url: "/inquilino/perfil",
    });
    await audit(
      admin.id,
      "tenancy.documents_configured",
      "tenancy",
      tenancyId,
      { enabled, required },
      request,
    );
    return json({ updated: true });
  }
  if (body.action === "delete") {
    if (tenancy.data.deleted_at)
      throw new Error("Esta locação já foi excluída");
    const deletedAt = new Date().toISOString();
    const updated = await client
      .from("oliveira_tenancies")
      .update({
        status: "cancelled",
        deleted_at: deletedAt,
        deleted_by: admin.id,
        updated_at: deletedAt,
      })
      .eq("id", tenancyId);
    if (updated.error) throw updated.error;
    const installments = await client
      .from("oliveira_rent_installments")
      .update({ status: "cancelled" })
      .eq("tenancy_id", tenancyId)
      .in("status", [
        "upcoming",
        "pending",
        "late",
        "rejected",
        "under_review",
      ]);
    if (installments.error) throw installments.error;
    const contracts = await client
      .from("oliveira_contracts")
      .update({ status: "cancelled" })
      .eq("tenancy_id", tenancyId)
      .in("status", ["draft", "pending_signature"]);
    if (contracts.error) throw contracts.error;
    await client.from("oliveira_notifications").insert({
      recipient_id: tenancy.data.tenant_id,
      event_type: "tenancy_deleted",
      title: "Locação removida do portal",
      body: "O proprietário encerrou e arquivou esta locação. O histórico permanece preservado.",
      entity_type: "tenancy",
      entity_id: tenancyId,
      action_url: "/inquilino",
    });
    await audit(
      admin.id,
      "tenancy.deleted",
      "tenancy",
      tenancyId,
      { previous_status: tenancy.data.status, history_preserved: true },
      request,
    );
    return json({ deleted: true, history_preserved: true });
  }
  if (body.action === "restore") {
    if (!tenancy.data.deleted_at)
      throw new Error("Esta locação não está excluída");
    const updated = await client
      .from("oliveira_tenancies")
      .update({
        status: "cancelled",
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenancyId);
    if (updated.error) throw updated.error;
    await audit(
      admin.id,
      "tenancy.restored",
      "tenancy",
      tenancyId,
      { status: "cancelled" },
      request,
    );
    return json({ restored: true, status: "cancelled" });
  }
  if (["end", "cancel", "reactivate"].includes(body.action)) {
    if (tenancy.data.deleted_at)
      throw new Error("Restaure a locação antes de alterar o status");
    const status =
      body.action === "end"
        ? "ended"
        : body.action === "cancel"
          ? "cancelled"
          : "active";
    if (status === "active") {
      const property = await client
        .from("oliveira_properties")
        .select("active,availability_status")
        .eq("id", tenancy.data.property_id)
        .single();
      if (
        property.error ||
        !property.data?.active ||
        ["maintenance", "archived"].includes(property.data.availability_status)
      )
        throw new Error(
          "O imóvel não está liberado para reativar esta locação",
        );
      const conflict = await client
        .from("oliveira_tenancies")
        .select("id")
        .eq("property_id", tenancy.data.property_id)
        .eq("status", "active")
        .neq("id", tenancyId)
        .lte("starts_on", tenancy.data.ends_on)
        .gte("ends_on", tenancy.data.starts_on)
        .limit(1);
      if (conflict.error) throw conflict.error;
      if (conflict.data?.length)
        throw new Error("O imóvel possui outra locação ativa no mesmo período");
    }
    const updated = await client
      .from("oliveira_tenancies")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", tenancyId);
    if (updated.error) throw updated.error;
    if (status !== "active")
      await client
        .from("oliveira_rent_installments")
        .update({ status: "cancelled" })
        .eq("tenancy_id", tenancyId)
        .in("status", ["upcoming", "pending", "late", "rejected"]);
    await audit(
      admin.id,
      `tenancy.${body.action}`,
      "tenancy",
      tenancyId,
      { status, note: body.note ?? null },
      request,
    );
    return json({ status });
  }
  throw new Error("Ação inválida");
});
