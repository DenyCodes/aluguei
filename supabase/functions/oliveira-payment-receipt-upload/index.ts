import {
  allowedPrivateFileMimes,
  fileSha256,
  hasExpectedFileSignature,
  safeStorageFileName,
} from "../_shared/file-validation.ts";
import { audit, json, requireUser, serve, serviceClient } from "../_shared/http.ts";

serve(async (request) => {
  const user = await requireUser(request);
  const form = await request.formData();
  const installmentId = String(form.get("installment_id") ?? "");
  const file = form.get("file");
  if (!installmentId || !(file instanceof File) || !file.size)
    throw new Error("Selecione a parcela e o comprovante");
  if (!allowedPrivateFileMimes.has(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error("Envie JPG, PNG, WebP ou PDF com até 10 MB");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasExpectedFileSignature(bytes, file.type))
    throw new Error("O conteúdo do arquivo não corresponde ao formato informado");

  const client = serviceClient();
  const installment = await client
    .from("oliveira_rent_installments")
    .select("id,status,base_amount,fine_amount,interest_amount,credit_amount,tenancy:oliveira_tenancies(id,tenant_id,status,deleted_at)")
    .eq("id", installmentId)
    .single();
  if (installment.error || !installment.data)
    throw installment.error ?? new Error("Parcela não encontrada");

  const tenancy = installment.data.tenancy as {
    id: string;
    tenant_id: string;
    status: string;
    deleted_at: string | null;
  };
  if (
    tenancy.tenant_id !== user.id ||
    tenancy.status !== "active" ||
    tenancy.deleted_at ||
    !["pending", "late", "rejected"].includes(installment.data.status)
  )
    throw new Error("Parcela indisponível para envio de comprovante");

  const pending = await client
    .from("oliveira_payment_receipts")
    .select("id")
    .eq("installment_id", installmentId)
    .eq("tenant_id", user.id)
    .eq("status", "under_review")
    .limit(1);
  if (pending.error) throw pending.error;
  if (pending.data?.length)
    throw new Error("Já existe um comprovante em análise para esta parcela");

  const amount = Math.max(
    0,
    Number(installment.data.base_amount) +
      Number(installment.data.fine_amount) +
      Number(installment.data.interest_amount) -
      Number(installment.data.credit_amount),
  );
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("A parcela não possui saldo válido para pagamento");

  const path = `${user.id}/payment-receipts/${installmentId}/${crypto.randomUUID()}-${safeStorageFileName(file.name)}`;
  const hash = await fileSha256(bytes);
  const upload = await client.storage
    .from("oliveira-private-documents")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error) throw upload.error;

  const inserted = await client
    .from("oliveira_payment_receipts")
    .insert({
      installment_id: installmentId,
      tenant_id: user.id,
      file_path: path,
      file_sha256: hash,
      mime_type: file.type,
      size_bytes: file.size,
      amount,
      status: "under_review",
    })
    .select("id,status,amount,created_at")
    .single();
  if (inserted.error || !inserted.data) {
    await client.storage.from("oliveira-private-documents").remove([path]);
    throw inserted.error ?? new Error("Comprovante não registrado");
  }

  await audit(
    user.id,
    "payment_receipt.uploaded",
    "payment_receipt",
    inserted.data.id,
    { installment_id: installmentId, amount, mime_type: file.type, size_bytes: file.size, file_sha256: hash },
    request,
  );
  return json({ receipt: inserted.data });
});
