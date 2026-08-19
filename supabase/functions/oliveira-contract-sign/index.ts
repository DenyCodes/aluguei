import { buildContractPdf, sha256 } from "../_shared/contract-pdf.ts";
import { sendOliveiraEmail } from "../_shared/email.ts";
import { audit, json, requireElevatedAuth, requireUser, serve, serviceClient } from "../_shared/http.ts";

const encoder = new TextEncoder();
const toHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, "0")).join("");
async function otpHash(contractId: string, signerId: string, code: string) {
  const pepper = Deno.env.get("OLIVEIRA_OTP_PEPPER");
  if (!pepper) throw new Error("Segredo de OTP não configurado");
  const key = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${contractId}:${signerId}:${code}`)));
}
function createOtp() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

serve(async (request) => {
  const caller = await requireUser(request);
  const body = await request.json();
  const contractId = String(body.contract_id ?? "");
  const client = serviceClient();
  const { data: contract, error } = await client.from("oliveira_contracts").select("*, tenancy:oliveira_tenancies(tenant_id,require_document_approval,required_document_types)").eq("id", contractId).single();
  if (error || !contract) throw error ?? new Error("Contrato não encontrado");
  if (contract.tenancy.tenant_id !== caller.id) throw new Error("Contrato não pertence ao usuário autenticado");
  if (contract.status !== "pending_signature") throw new Error("Contrato não está disponível para assinatura");
  if (contract.tenancy.require_document_approval) {
    const required = Array.isArray(contract.tenancy.required_document_types) ? contract.tenancy.required_document_types : [];
    const approved = await client.from("oliveira_tenant_documents").select("document_type").eq("tenant_id",caller.id).eq("status","approved").in("document_type",required);
    if (approved.error) throw approved.error;
    const present = new Set((approved.data ?? []).map((item) => item.document_type));
    const missing = required.filter((item: string) => !present.has(item));
    if (missing.length) throw new Error(`A assinatura aguarda aprovação documental: ${missing.join(", ")}`);
  }

  if (body.action === "request_otp") {
    if (!caller.email) throw new Error("Usuário sem e-mail confirmado");
    const recent = await client.from("oliveira_signature_otps").select("created_at").eq("contract_id", contractId).eq("signer_id", caller.id).is("consumed_at", null).gte("created_at", new Date(Date.now() - 60_000).toISOString()).maybeSingle();
    if (recent.data) throw new Error("Aguarde um minuto antes de solicitar outro código");
    await client.from("oliveira_signature_otps").update({ consumed_at: new Date().toISOString() }).eq("contract_id", contractId).is("consumed_at", null);
    const code = createOtp();
    const codeHash = await otpHash(contractId, caller.id, code);
    const inserted = await client.from("oliveira_signature_otps").insert({ contract_id: contractId, signer_id: caller.id, code_hash: codeHash, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }).select("id").single();
    if (inserted.error || !inserted.data) throw inserted.error ?? new Error("Código não criado");
    const { data: profile } = await client.from("oliveira_profiles").select("full_name,email").eq("id", caller.id).single();
    const delivery = await sendOliveiraEmail({
      eventType: "signature_otp",
      recipientEmail: caller.email,
      subject: "Código para assinatura do contrato — Imobiliária Oliveira",
      entityType: "contract",
      entityId: contractId,
      contractId,
      idempotencyKey: `oliveira:signature_otp:${contractId}:${inserted.data.id}`,
      template: {
        preheader: "Seu código de assinatura eletrônica interna.",
        heading: "Código de assinatura",
        greeting: `Olá, ${profile?.full_name ?? "inquilino"}.`,
        paragraphs: ["Use o código abaixo somente depois de revisar o contrato completo no portal."],
        fields: [{ label: "Código OTP", value: code }, { label: "Validade", value: "10 minutos" }],
        notice: "O código é pessoal e permite confirmar a assinatura. Não compartilhe esta mensagem com terceiros.",
        ctaLabel: "Voltar ao contrato",
        ctaUrl: `${Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app"}/inquilino?contrato=${contractId}`,
      },
    });
    if (delivery.status !== "sent") {
      await client.from("oliveira_signature_otps").update({ consumed_at: new Date().toISOString() }).eq("id", inserted.data.id);
      throw new Error("Não foi possível enviar o código. Tente novamente.");
    }
    await audit(caller.id, "contract.otp_requested", "contract", contractId, { otp_id: inserted.data.id, delivery_id: delivery.deliveryId }, request);
    return json({ sent: true, expires_in: 600 });
  }

  if (body.action !== "verify_and_sign") throw new Error("Ação inválida");
  await requireElevatedAuth(request, caller);
  if (!body.accepted) throw new Error("O aceite expresso é obrigatório");
  const fullName = String(body.full_name ?? "").trim().replace(/\s+/g, " ");
  const { data: profile } = await client.from("oliveira_profiles").select("full_name,email").eq("id", caller.id).single();
  if (!profile || fullName.localeCompare(profile.full_name.trim().replace(/\s+/g, " "), "pt-BR", { sensitivity: "base" }) !== 0) throw new Error("Digite o nome completo exatamente como cadastrado");
  const submittedOtp = String(body.otp ?? "").trim();
  if (!/^\d{6}$/.test(submittedOtp)) throw new Error("Código inválido ou expirado");
  const verification = await client.rpc("oliveira_consume_signature_otp", { p_contract_id: contractId, p_signer_id: caller.id, p_code_hash: await otpHash(contractId, caller.id, submittedOtp) });
  if (verification.error || verification.data?.valid !== true) throw new Error("Código inválido, expirado ou bloqueado");
  const signedAt = new Date().toISOString();
  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "";
  const unsignedHash = contract.unsigned_document_hash ?? contract.document_hash;
  const signedBytes = await buildContractPdf(contract.content, { name: fullName, email: profile.email, signedAt, ip, hash: unsignedHash });
  const finalHash = await sha256(signedBytes);
  const signedPath = contract.pdf_path.replace("-unsigned.pdf", "-signed.pdf");
  const upload = await client.storage.from("oliveira-private-documents").upload(signedPath, signedBytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw upload.error;
  const signature = await client.from("oliveira_contract_signatures").insert({ contract_id: contractId, signer_id: caller.id, signer_name: fullName, signer_email: profile.email, document_hash: finalHash, unsigned_document_hash: unsignedHash, signed_document_hash: finalHash, ip_address: ip || null, user_agent: String(request.headers.get("user-agent") ?? "").slice(0, 500), signed_at: signedAt }).select("id").single();
  if (signature.error || !signature.data) {
    await client.storage.from("oliveira-private-documents").remove([signedPath]);
    throw signature.error ?? new Error("Assinatura não registrada");
  }
  const updated = await client.from("oliveira_contracts").update({ status: "signed", document_hash: finalHash, unsigned_document_hash: unsignedHash, signed_document_hash: finalHash, pdf_path: signedPath, signed_at: signedAt }).eq("id", contractId).eq("status", "pending_signature").select("id").maybeSingle();
  if (updated.error || !updated.data) {
    await client.from("oliveira_contract_signatures").delete().eq("id", signature.data.id);
    await client.storage.from("oliveira-private-documents").remove([signedPath]);
    throw updated.error ?? new Error("O contrato mudou antes da conclusão da assinatura");
  }
  await audit(caller.id, "contract.signed", "contract", contractId, { version: contract.version, document_hash: finalHash }, request);
  await client.from("oliveira_notifications").insert({ recipient_id:caller.id, event_type:"contract_signed", title:"Contrato assinado", body:`A assinatura da versão ${contract.version} foi concluída.`, entity_type:"contract", entity_id:contractId, action_url:"/inquilino/contrato" });
  const delivery = await sendOliveiraEmail({
    eventType: "contract_signed",
    recipientEmail: profile.email,
    subject: `Contrato assinado — versão ${contract.version}`,
    entityType: "contract",
    entityId: contractId,
    contractId,
    idempotencyKey: `oliveira:contract_signed:${contractId}:v${contract.version}`,
    template: {
      preheader: "Sua assinatura foi registrada e o PDF final está disponível.",
      heading: "Contrato assinado com sucesso",
      greeting: `Olá, ${profile.full_name}.`,
      paragraphs: ["A assinatura eletrônica interna foi registrada. O PDF final e a página de evidências permanecem disponíveis no portal seguro."],
      fields: [{ label: "Versão", value: String(contract.version) }, { label: "Data UTC", value: signedAt }, { label: "Hash SHA-256", value: finalHash }],
      ctaLabel: "Acessar contrato assinado",
      ctaUrl: `${Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app"}/inquilino?contrato=${contractId}`,
    },
  });
  await audit(caller.id, delivery.status === "sent" ? "email.contract_signed.sent" : "email.contract_signed.failed", "contract", contractId, { delivery_id: delivery.deliveryId }, request);
  return json({ signed: true, signed_at: signedAt, document_hash: finalHash, email_status: delivery.status });
});
