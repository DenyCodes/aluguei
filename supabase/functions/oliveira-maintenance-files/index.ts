import {
  audit,
  isOliveiraAdmin,
  json,
  requireUser,
  serve,
  serviceClient,
} from "../_shared/http.ts";

const allowed = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const safeName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-120) || "anexo";
serve(async (request) => {
  const user = await requireUser(request);
  const client = serviceClient();
  const admin = await isOliveiraAdmin(user);
  const form = await request.formData();
  const requestId = String(form.get("request_id") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    throw new Error("Escolha um anexo");
  if (!allowed.has(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error("Envie JPG, PNG, WebP ou PDF com até 10 MB");
  const maintenance = await client
    .from("oliveira_maintenance_requests")
    .select("id,tenant_id")
    .eq("id", requestId)
    .single();
  if (maintenance.error || !maintenance.data)
    throw maintenance.error ?? new Error("Solicitação não encontrada");
  if (!admin && maintenance.data.tenant_id !== user.id)
    throw new Error("Acesso negado");
  const path = `${maintenance.data.tenant_id}/maintenance/${requestId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const upload = await client.storage
    .from("oliveira-tenant-files")
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (upload.error) throw upload.error;
  const inserted = await client
    .from("oliveira_maintenance_attachments")
    .insert({
      request_id: requestId,
      tenant_id: maintenance.data.tenant_id,
      storage_path: path,
      display_name: file.name.slice(0, 180),
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single();
  if (inserted.error) {
    await client.storage.from("oliveira-tenant-files").remove([path]);
    throw inserted.error;
  }
  await audit(
    user.id,
    "maintenance.attachment_uploaded",
    "maintenance_attachment",
    inserted.data.id,
    { request_id: requestId },
    request,
  );
  return json({ attachment: inserted.data });
});
