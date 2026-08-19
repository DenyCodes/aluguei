import { audit, json, requireAdmin, serve, serviceClient } from "../_shared/http.ts";
import { buildRentReceiptPdf } from "../_shared/receipt-pdf.ts";

async function issueReceipt(client: ReturnType<typeof serviceClient>, admin: { id:string; email?:string }, installmentId:string, amount:number) {
  const installment = await client.from("oliveira_rent_installments").select("*, tenancy:oliveira_tenancies(id,tenant_id,property:oliveira_properties(title),tenant:oliveira_profiles(full_name))").eq("id",installmentId).single();
  if (installment.error || !installment.data) throw installment.error ?? new Error("Parcela não encontrada");
  const existing = await client.from("oliveira_rent_receipts").select("*").eq("installment_id",installmentId).maybeSingle();
  if (existing.data) return existing.data;
  const paidAt = installment.data.paid_at ?? new Date().toISOString();
  const receiptNumber = `IO-${new Date().getFullYear()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
  const inserted = await client.from("oliveira_rent_receipts").insert({ installment_id:installmentId, tenancy_id:installment.data.tenancy.id, tenant_id:installment.data.tenancy.tenant_id, receipt_number:receiptNumber, amount, paid_at:paidAt, issued_by:admin.id }).select().single();
  if (inserted.error) throw inserted.error;
  const bytes = await buildRentReceiptPdf({ receiptNumber, tenantName:installment.data.tenancy.tenant.full_name, propertyTitle:installment.data.tenancy.property.title, referenceMonth:installment.data.reference_month, amount, paidAt, issuedBy:admin.email ?? "Administrador" });
  const path = `receipts/${installment.data.tenancy.tenant_id}/${inserted.data.id}.pdf`;
  const upload = await client.storage.from("oliveira-private-documents").upload(path,bytes,{ contentType:"application/pdf",upsert:false });
  if (upload.error) throw upload.error;
  await client.from("oliveira_rent_receipts").update({ pdf_path:path }).eq("id",inserted.data.id);
  await client.from("oliveira_notifications").insert({ recipient_id:installment.data.tenancy.tenant_id,event_type:"payment_paid",title:"Pagamento confirmado",body:`O recibo da competência ${installment.data.reference_month} está disponível.`,entity_type:"rent_receipt",entity_id:inserted.data.id,action_url:"/inquilino/comprovantes" });
  return { ...inserted.data,pdf_path:path };
}

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  const client = serviceClient();

  if (body.action === "manual") {
    const amount = Number(body.amount);
    if (!body.installment_id || amount <= 0) throw new Error("Parcela e valor são obrigatórios");
    const { error } = await client.rpc("oliveira_admin_manual_payment", { p_installment_id: body.installment_id, p_amount: amount });
    if (error) throw error;
    const receipt = await issueReceipt(client,admin,body.installment_id,amount);
    await audit(admin.id, "payment.manual", "installment", body.installment_id, { amount }, request);
    return json({ paid: true, receipt_id:receipt.id });
  }

  const approved = body.action === "approve";
  if (!approved && body.action !== "reject") throw new Error("Ação inválida");
  const { data: decision, error } = await client.rpc("oliveira_admin_decide_receipt", { p_receipt_id: body.receipt_id, p_approved: approved, p_admin_id: admin.id, p_note: body.note ?? null });
  if (error) throw error;
  const receipt = approved ? await issueReceipt(client,admin,decision.installment_id,Number(decision.amount)) : null;
  if (!approved) {
    const rejected = await client.from("oliveira_payment_receipts").select("tenant_id").eq("id",body.receipt_id).single();
    if (rejected.data) await client.from("oliveira_notifications").insert({ recipient_id:rejected.data.tenant_id,event_type:"payment_rejected",title:"Comprovante precisa de correção",body:String(body.note ?? "Entre em contato com o proprietário."),entity_type:"payment_receipt",entity_id:body.receipt_id,action_url:"/inquilino/comprovantes" });
  }
  await audit(admin.id, approved ? "payment.approved" : "payment.rejected", "receipt", body.receipt_id, decision ?? {}, request);
  return json({ approved, receipt_id:receipt?.id ?? null });
});
