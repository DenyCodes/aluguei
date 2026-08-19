import {
  audit,
  isOliveiraAdmin,
  json,
  requireUser,
  serve,
  serviceClient,
} from "../_shared/http.ts";

serve(async (request) => {
  const user = await requireUser(request);
  const body = await request.json();
  const client = serviceClient();
  const admin = await isOliveiraAdmin(user);
  let path: string;
  let owner: string;
  if (body.entity_type === "payment_receipt") {
    const row = await client
      .from("oliveira_payment_receipts")
      .select("file_path,tenant_id")
      .eq("id", body.entity_id)
      .single();
    if (row.error) throw row.error;
    path = row.data.file_path;
    owner = row.data.tenant_id;
  } else if (body.entity_type === "rent_receipt") {
    const row = await client
      .from("oliveira_rent_receipts")
      .select("pdf_path,tenant_id")
      .eq("id", body.entity_id)
      .single();
    if (row.error) throw row.error;
    path = row.data.pdf_path;
    owner = row.data.tenant_id;
  } else if (body.entity_type === "maintenance_attachment") {
    const row = await client
      .from("oliveira_maintenance_attachments")
      .select("storage_path,tenant_id")
      .eq("id", body.entity_id)
      .single();
    if (row.error) throw row.error;
    path = row.data.storage_path;
    owner = row.data.tenant_id;
  } else throw new Error("Tipo de arquivo inválido");
  if (!admin && owner !== user.id) throw new Error("Acesso negado");
  if (!path) throw new Error("Arquivo indisponível");
  const bucket =
    body.entity_type === "maintenance_attachment"
      ? "oliveira-tenant-files"
      : "oliveira-private-documents";
  const signed = await client.storage.from(bucket).createSignedUrl(path, 120);
  if (signed.error) throw signed.error;
  await audit(
    user.id,
    "private_file.opened",
    String(body.entity_type),
    String(body.entity_id),
    {},
    request,
  );
  return json({ url: signed.data.signedUrl, expires_in: 120 });
});
