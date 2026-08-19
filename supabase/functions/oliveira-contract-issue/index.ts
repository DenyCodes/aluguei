import { buildContractPdf, sha256 } from "../_shared/contract-pdf.ts";
import { resolveContract, validateFieldValues, validateTemplatePayload } from "../_shared/contract-template.ts";
import { formatDate, formatMoney, sendOliveiraEmail } from "../_shared/email.ts";
import { audit, json, requireAdmin, serve, serviceClient } from "../_shared/http.ts";

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  const tenancyId = String(body.tenancy_id ?? "");
  const action = body.action === "preview" ? "preview" : "issue";
  if (!tenancyId) throw new Error("Locação obrigatória");
  const client = serviceClient();
  const { data: tenancy, error } = await client.from("oliveira_tenancies").select("*, property:oliveira_properties(*), tenant:oliveira_profiles(*)").eq("id", tenancyId).single();
  if (error || !tenancy) throw error ?? new Error("Locação não encontrada");
  const { data: settings } = await client.from("oliveira_settings").select("*").eq("id", 1).single();
  if (!settings?.landlord_name || !settings?.landlord_tax_id) throw new Error("Preencha os dados do emissor nas configurações");

  const templateId = String(body.template_id ?? "");
  const templateQuery = templateId
    ? client.from("oliveira_contract_templates").select("*").eq("id", templateId).eq("active", true).single()
    : client.from("oliveira_contract_templates").select("*").eq("is_default", true).eq("active", true).limit(1).single();
  const { data: savedTemplate, error: templateError } = await templateQuery;
  if (templateError || !savedTemplate) throw templateError ?? new Error("Modelo contratual não encontrado");
  const template = validateTemplatePayload(body.template_content ?? savedTemplate.content);
  const utility = { included: "inclusa no aluguel", individual: "de responsabilidade direta do locatário", shared: "rateada conforme regra registrada" } as Record<string, string>;
  const guarantee = { none: "sem garantia", deposit: "caução", guarantor: "fiador", insurance: "seguro-fiança" } as Record<string, string>;
  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const defaults = {
    landlord_name: settings.landlord_name,
    landlord_tax_id: settings.landlord_tax_id,
    tenant_name: tenancy.tenant.full_name,
    tenant_tax_id: tenancy.tenant.cpf_masked || "não informado",
    tenant_email: tenancy.tenant.email,
    property_title: tenancy.property.title,
    property_address: tenancy.property.address,
    starts_on: tenancy.starts_on,
    ends_on: tenancy.ends_on,
    monthly_rent: Number(tenancy.monthly_rent).toFixed(2).replace(".", ","),
    due_day: tenancy.due_day,
    late_fee_percent: tenancy.late_fee_percent,
    monthly_interest_percent: tenancy.monthly_interest_percent,
    adjustment_index: tenancy.adjustment_index,
    guarantee_type: guarantee[tenancy.guarantee_type] ?? tenancy.guarantee_type,
    water_policy: utility[tenancy.property.water_policy],
    electricity_policy: utility[tenancy.property.electricity_policy],
    jurisdiction: settings.jurisdiction,
    notice_days: "30",
    issue_city: String(settings.jurisdiction).split("-")[0].trim(),
    issue_date: today,
    ...(body.fields && typeof body.fields === "object" ? body.fields : {}),
  };
  const fields = validateFieldValues(defaults);
  const content = {
    ...resolveContract(template, fields),
    renderer_version: "oliveira-pdf-v3",
    template_id: savedTemplate.id,
    template_name: savedTemplate.name,
    template_version: String(new Date(savedTemplate.updated_at).getTime()),
  };
  const pdfBytes = await buildContractPdf(content);

  if (action === "preview") {
    const previewPath = `previews/${admin.id}/${crypto.randomUUID()}.pdf`;
    const upload = await client.storage.from("oliveira-private-documents").upload(previewPath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw upload.error;
    const signed = await client.storage.from("oliveira-private-documents").createSignedUrl(previewPath, 600);
    if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Não foi possível abrir a pré-visualização");
    await audit(admin.id, "contract.previewed", "tenancy", tenancyId, { template_id: savedTemplate.id }, request);
    return json({ preview_url: signed.data.signedUrl, expires_in: 600 });
  }

  const { data: latest } = await client.from("oliveira_contracts").select("version").eq("tenancy_id", tenancyId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = Number(latest?.version ?? 0) + 1;
  await client.from("oliveira_contracts").update({ status: "cancelled" }).eq("tenancy_id", tenancyId).eq("status", "pending_signature");
  const { data: contract, error: insertError } = await client.from("oliveira_contracts").insert({ tenancy_id: tenancyId, version, status: "draft", content }).select().single();
  if (insertError || !contract) throw insertError ?? new Error("Contrato não criado");
  const hash = await sha256(pdfBytes);
  const path = `contracts/${tenancy.tenant_id}/${contract.id}/v${version}-unsigned.pdf`;
  const upload = await client.storage.from("oliveira-private-documents").upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw upload.error;
  const { error: updateError } = await client.from("oliveira_contracts").update({ status: "pending_signature", document_hash: hash, unsigned_document_hash: hash, pdf_path: path, issued_at: new Date().toISOString() }).eq("id", contract.id);
  if (updateError) throw updateError;
  await audit(admin.id, "contract.issued", "contract", contract.id, { tenancy_id: tenancyId, version, template_id: savedTemplate.id, document_hash: hash }, request);
  await client.from("oliveira_notifications").insert({ recipient_id:tenancy.tenant_id, event_type:"contract_issued", title:"Novo contrato disponível", body:`A versão ${version} está pronta para revisão e assinatura.`, entity_type:"contract", entity_id:contract.id, action_url:`/inquilino/contrato?contrato=${contract.id}` });
  const delivery = await sendOliveiraEmail({
    eventType: "contract_issued",
    recipientEmail: tenancy.tenant.email,
    subject: `Contrato disponível para assinatura - versão ${version}`,
    entityType: "contract",
    entityId: contract.id,
    tenancyId,
    contractId: contract.id,
    idempotencyKey: `oliveira:contract_issued:${contract.id}:v${version}`,
    template: {
      preheader: "Seu contrato de locação está disponível no portal seguro.",
      heading: "Contrato disponível para revisão",
      greeting: `Olá, ${tenancy.tenant.full_name}.`,
      paragraphs: ["O proprietário preparou uma nova versão do contrato. Leia o PDF completo no portal antes de solicitar o código de assinatura."],
      fields: [
        { label: "Imóvel", value: String(fields.property_title) },
        { label: "Endereço", value: String(fields.property_address) },
        { label: "Versão", value: String(version) },
        { label: "Vigência", value: `${formatDate(String(fields.starts_on))} a ${formatDate(String(fields.ends_on))}` },
        { label: "Aluguel", value: formatMoney(Number(String(fields.monthly_rent).replace(",", "."))) },
      ],
      notice: "O documento permanece privado. Será necessário entrar com sua conta para visualizar e assinar.",
      ctaLabel: "Revisar contrato",
      ctaUrl: `${Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app"}/inquilino?contrato=${contract.id}`,
    },
  });
  await audit(admin.id, delivery.status === "sent" ? "email.contract_issued.sent" : "email.contract_issued.failed", "contract", contract.id, { delivery_id: delivery.deliveryId }, request);
  return json({ contract_id: contract.id, version, document_hash: hash, email_status: delivery.status });
});
