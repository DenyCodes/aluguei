import {
  audit,
  isOliveiraAdmin,
  json,
  requireUser,
  serve,
  serviceClient,
} from "../_shared/http.ts";

const allowedTypes = new Set([
  "profile_photo",
  "rg_front",
  "rg_back",
  "cpf",
  "proof_of_address",
  "other",
]);
const allowedMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const safeName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-120) || "arquivo";

function validSignature(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png")
    return bytes
      .slice(0, 8)
      .every(
        (value, index) =>
          value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index],
      );
  if (mime === "image/webp")
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  if (mime === "application/pdf")
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  return false;
}

serve(async (request) => {
  const user = await requireUser(request);
  const admin = await isOliveiraAdmin(user);
  const client = serviceClient();
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const documentType = String(form.get("document_type") ?? "");
    const requestedTenant = String(form.get("tenant_id") ?? "");
    const tenantId = admin && requestedTenant ? requestedTenant : user.id;
    if (!(file instanceof File) || !file.size)
      throw new Error("Escolha um arquivo válido");
    if (!allowedTypes.has(documentType))
      throw new Error("Tipo de documento inválido");
    if (!allowedMimes.has(file.type))
      throw new Error("Envie JPG, PNG, WebP ou PDF");
    const limit =
      documentType === "profile_photo" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > limit)
      throw new Error(
        documentType === "profile_photo"
          ? "A foto deve ter até 5 MB"
          : "O documento deve ter até 10 MB",
      );
    if (documentType === "profile_photo" && file.type === "application/pdf")
      throw new Error("A foto deve ser uma imagem");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validSignature(bytes, file.type))
      throw new Error(
        "O conteúdo do arquivo não corresponde ao formato informado",
      );
    const profile = await client
      .from("oliveira_profiles")
      .select("id")
      .eq("id", tenantId)
      .eq("role", "tenant")
      .maybeSingle();
    if (profile.error || !profile.data)
      throw profile.error ?? new Error("Inquilino não encontrado");
    const path = `${tenantId}/documents/${documentType}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const upload = await client.storage
      .from("oliveira-tenant-files")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const inserted = await client
      .from("oliveira_tenant_documents")
      .insert({
        tenant_id: tenantId,
        document_type: documentType,
        display_name: file.name.slice(0, 180),
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        status: admin ? "approved" : "pending",
        uploaded_by: user.id,
        ...(admin
          ? {
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
              review_note: "Enviado e aprovado pelo administrador",
            }
          : {}),
      })
      .select()
      .single();
    if (inserted.error) {
      await client.storage.from("oliveira-tenant-files").remove([path]);
      throw inserted.error;
    }
    if (admin) {
      await client
        .from("oliveira_tenant_documents")
        .update({
          status: "replaced",
          replaced_by: inserted.data.id,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("document_type", documentType)
        .eq("status", "approved")
        .neq("id", inserted.data.id);
      await client
        .from("oliveira_profiles")
        .update({
          ...(documentType === "profile_photo" ? { avatar_path: path } : {}),
          document_status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);
    } else
      await client
        .from("oliveira_profiles")
        .update({
          document_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);
    await client
      .from("oliveira_notifications")
      .insert({
        recipient_id: admin
          ? tenantId
          : (
              await client
                .from("oliveira_profiles")
                .select("id")
                .eq("email", "playtecno@outlook.com.br")
                .single()
            ).data?.id,
        event_type: admin ? "document_approved" : "document_uploaded",
        title: admin ? "Documento adicionado" : "Documento aguardando revisão",
        body: admin
          ? `${file.name} foi incluído pelo administrador.`
          : `${file.name} foi enviado por ${user.email}.`,
        entity_type: "tenant_document",
        entity_id: inserted.data.id,
        action_url: admin
          ? "/inquilino/perfil"
          : `/admin/inquilinos/${tenantId}`,
      });
    await audit(
      user.id,
      "tenant_document.uploaded",
      "tenant_document",
      inserted.data.id,
      {
        tenant_id: tenantId,
        document_type: documentType,
        status: inserted.data.status,
      },
      request,
    );
    return json({ document: inserted.data });
  }

  const body = await request.json();
  const action = String(body.action ?? "");
  const documentId = String(body.document_id ?? "");
  const document = await client
    .from("oliveira_tenant_documents")
    .select("*")
    .eq("id", documentId)
    .single();
  if (document.error || !document.data)
    throw document.error ?? new Error("Documento não encontrado");
  if (!admin && document.data.tenant_id !== user.id)
    throw new Error("Acesso negado");

  if (action === "download") {
    const signed = await client.storage
      .from("oliveira-tenant-files")
      .createSignedUrl(document.data.storage_path, 120);
    if (signed.error) throw signed.error;
    await audit(
      user.id,
      "tenant_document.downloaded",
      "tenant_document",
      documentId,
      { tenant_id: document.data.tenant_id },
      request,
    );
    return json({ url: signed.data.signedUrl, expires_in: 120 });
  }
  if (!admin) throw new Error("Apenas o administrador pode revisar documentos");
  if (action === "approve") {
    await client
      .from("oliveira_tenant_documents")
      .update({
        status: "replaced",
        replaced_by: documentId,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", document.data.tenant_id)
      .eq("document_type", document.data.document_type)
      .eq("status", "approved")
      .neq("id", documentId);
    const updated = await client
      .from("oliveira_tenant_documents")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: String(body.note ?? "").slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (updated.error) throw updated.error;
    await client
      .from("oliveira_profiles")
      .update({
        ...(document.data.document_type === "profile_photo"
          ? { avatar_path: document.data.storage_path }
          : {}),
        document_status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", document.data.tenant_id);
  } else if (action === "reject") {
    const note = String(body.note ?? "").trim();
    if (!note) throw new Error("Informe o motivo da rejeição");
    const updated = await client
      .from("oliveira_tenant_documents")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: note.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId)
      .eq("status", "pending");
    if (updated.error) throw updated.error;
    await client
      .from("oliveira_profiles")
      .update({
        document_status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", document.data.tenant_id);
  } else if (action === "delete") {
    const removed = await client.storage
      .from("oliveira-tenant-files")
      .remove([document.data.storage_path]);
    if (removed.error) throw removed.error;
    await client
      .from("oliveira_tenant_documents")
      .update({
        status: "deleted",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: String(body.note ?? "Excluído pelo administrador").slice(
          0,
          500,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (document.data.document_type === "profile_photo")
      await client
        .from("oliveira_profiles")
        .update({
          avatar_path: null,
          document_status: "incomplete",
          updated_at: new Date().toISOString(),
        })
        .eq("id", document.data.tenant_id)
        .eq("avatar_path", document.data.storage_path);
  } else throw new Error("Ação inválida");
  await client
    .from("oliveira_notifications")
    .insert({
      recipient_id: document.data.tenant_id,
      event_type: `document_${action}`,
      title:
        action === "approve"
          ? "Documento aprovado"
          : action === "reject"
            ? "Documento precisa de correção"
            : "Documento removido",
      body:
        action === "reject" ? String(body.note) : document.data.display_name,
      entity_type: "tenant_document",
      entity_id: documentId,
      action_url: "/inquilino/perfil",
    });
  await audit(
    user.id,
    `tenant_document.${action}`,
    "tenant_document",
    documentId,
    { tenant_id: document.data.tenant_id, note: body.note ?? null },
    request,
  );
  return json({ updated: true });
});
