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
  const tenantId = String(body.tenant_id ?? "");
  const client = serviceClient();
  const tenant = await client
    .from("oliveira_profiles")
    .select("*")
    .eq("id", tenantId)
    .eq("role", "tenant")
    .single();
  if (tenant.error || !tenant.data)
    throw tenant.error ?? new Error("Inquilino não encontrado");
  if (body.action === "update") {
    const fullName = String(body.full_name ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const requestedEmail = String(body.email ?? tenant.data.email)
      .trim()
      .toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const cpfDigits = String(body.cpf ?? "").replace(/\D/g, "");
    if (fullName.split(" ").length < 2)
      throw new Error("Informe o nome completo");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail))
      throw new Error("Informe um e-mail válido");
    if (requestedEmail !== String(tenant.data.email).toLowerCase())
      throw new Error(
        "A alteração de e-mail exige confirmação pelo próprio inquilino",
      );
    const cpfMasked =
      cpfDigits.length === 11
        ? `***.***.***-${cpfDigits.slice(-2)}`
        : tenant.data.cpf_masked;

    const authUser = await client.auth.admin.getUserById(tenantId);
    if (authUser.error || !authUser.data.user)
      throw authUser.error ?? new Error("Conta de acesso não encontrada");
    const currentMetadata = authUser.data.user.user_metadata ?? {};
    const authUpdate = await client.auth.admin.updateUserById(tenantId, {
      user_metadata: {
        ...currentMetadata,
        full_name: fullName,
        phone,
        cpf_masked: cpfMasked,
        app_scope: "oliveira",
      },
    });
    if (authUpdate.error) throw authUpdate.error;

    const updated = await client
      .from("oliveira_profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        cpf_masked: cpfMasked,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
    if (updated.error) {
      await client.auth.admin.updateUserById(tenantId, {
        user_metadata: currentMetadata,
      });
      throw updated.error;
    }
    await audit(
      admin.id,
      "tenant_profile.updated",
      "profile",
      tenantId,
      {
        fields: ["full_name", "phone", "cpf_masked"],
      },
      request,
    );
    return json({ updated: true });
  }
  if (body.action === "delete") {
    const activeTenancy = await client
      .from("oliveira_tenancies")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(1);
    if (activeTenancy.error) throw activeTenancy.error;
    if (activeTenancy.data?.length)
      throw new Error(
        "Encerre ou cancele a locação ativa antes de excluir o inquilino",
      );
    const authUser = await client.auth.admin.getUserById(tenantId);
    if (authUser.error || !authUser.data.user)
      throw authUser.error ?? new Error("Conta de acesso não encontrada");
    const blocked = await client.auth.admin.updateUserById(tenantId, {
      ban_duration: "876000h",
      user_metadata: {
        ...(authUser.data.user.user_metadata ?? {}),
        account_status: "deleted",
        deleted_from_oliveira_at: new Date().toISOString(),
      },
    });
    if (blocked.error) throw blocked.error;
    const archived = await client
      .from("oliveira_profiles")
      .update({
        account_status: "deleted",
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
    if (archived.error) throw archived.error;
    await audit(
      admin.id,
      "tenant_access.deleted",
      "profile",
      tenantId,
      { history_preserved: true },
      request,
    );
    return json({ deleted: true, history_preserved: true });
  }
  if (body.action === "restore") {
    const authUser = await client.auth.admin.getUserById(tenantId);
    if (authUser.error || !authUser.data.user)
      throw authUser.error ?? new Error("Conta de acesso não encontrada");
    const restored = await client.auth.admin.updateUserById(tenantId, {
      ban_duration: "none",
      user_metadata: {
        ...(authUser.data.user.user_metadata ?? {}),
        account_status: "active",
        restored_to_oliveira_at: new Date().toISOString(),
      },
    });
    if (restored.error) throw restored.error;
    const profile = await client
      .from("oliveira_profiles")
      .update({
        account_status: "active",
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
    if (profile.error) throw profile.error;
    await audit(
      admin.id,
      "tenant_access.restored",
      "profile",
      tenantId,
      {},
      request,
    );
    return json({ restored: true });
  }
  throw new Error("Ação inválida");
});
