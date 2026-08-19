import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient } from "./http.ts";
import {
  canRetryStoredEmail,
  sanitizeEmailTemplateForStorage,
  shouldSendAdminCopy,
} from "./email-security.ts";

export type OliveiraEmailEvent =
  | "rent_due"
  | "contract_issued"
  | "contract_signed"
  | "tenant_invite"
  | "password_recovery"
  | "signature_otp"
  | "test";

export type EmailTemplateData = {
  preheader: string;
  heading: string;
  greeting?: string;
  paragraphs?: string[];
  fields?: Array<{ label: string; value: string }>;
  notice?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
};

export type SendEmailInput = {
  eventType: OliveiraEmailEvent;
  recipientEmail: string;
  subject: string;
  entityType: string;
  entityId?: string | null;
  tenancyId?: string | null;
  contractId?: string | null;
  installmentId?: string | null;
  idempotencyKey: string;
  template: EmailTemplateData;
  forceRetry?: boolean;
  adminCopy?: boolean;
};

type Settings = {
  email_enabled: boolean;
  email_from_name: string;
  email_from_address: string;
  email_reply_to: string;
  email_admin_copy: string;
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const plainText = (template: EmailTemplateData) => [
  template.heading,
  template.greeting,
  ...(template.paragraphs ?? []),
  ...(template.fields ?? []).map((field) => `${field.label}: ${field.value}`),
  template.notice,
  template.ctaUrl ? `${template.ctaLabel ?? "Acessar"}: ${template.ctaUrl}` : undefined,
  template.footer ?? "Imobiliária Oliveira",
].filter(Boolean).join("\n\n");

export function renderOliveiraEmail(template: EmailTemplateData) {
  const fields = (template.fields ?? []).map((field) => `
    <tr><td style="padding:10px 0;color:#65736b;font-size:13px;vertical-align:top">${escapeHtml(field.label)}</td>
    <td style="padding:10px 0;color:#183126;font-size:14px;font-weight:700;text-align:right;vertical-align:top">${escapeHtml(field.value)}</td></tr>`).join("");
  const paragraphs = (template.paragraphs ?? []).map((paragraph) => `<p style="margin:0 0 16px;color:#46564d;font-size:15px;line-height:1.7">${escapeHtml(paragraph)}</p>`).join("");
  const cta = template.ctaUrl ? `<div style="margin:28px 0;text-align:center"><a href="${escapeHtml(template.ctaUrl)}" style="display:inline-block;background:#1f6a45;color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">${escapeHtml(template.ctaLabel ?? "Acessar portal")}</a></div>` : "";
  const notice = template.notice ? `<div style="margin:22px 0;padding:16px;border-left:4px solid #c58c32;background:#fff8e9;border-radius:0 10px 10px 0;color:#664b1f;font-size:14px;line-height:1.6">${escapeHtml(template.notice)}</div>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(template.heading)}</title></head>
  <body style="margin:0;background:#f1f4f1;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">${escapeHtml(template.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #dfe6e1;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(24,49,38,.08)">
        <tr><td style="padding:30px;background:linear-gradient(135deg,#173d2b,#2f7b54)"><div style="color:#d9eadf;font-size:12px;letter-spacing:2px;text-transform:uppercase">Imobiliária Oliveira</div><h1 style="margin:10px 0 0;color:#fff;font-size:27px;line-height:1.2">${escapeHtml(template.heading)}</h1></td></tr>
        <tr><td style="padding:30px">${template.greeting ? `<p style="margin:0 0 18px;color:#183126;font-size:17px;font-weight:700">${escapeHtml(template.greeting)}</p>` : ""}${paragraphs}${fields ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-top:1px solid #e5ebe7;border-bottom:1px solid #e5ebe7">${fields}</table>` : ""}${notice}${cta}<p style="margin:24px 0 0;color:#738078;font-size:12px;line-height:1.6">${escapeHtml(template.footer ?? "Mensagem automática da Imobiliária Oliveira. Para responder, utilize playtecno@outlook.com.br.")}</p></td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

async function getSettings(client: SupabaseClient): Promise<Settings> {
  const { data, error } = await client.from("oliveira_settings").select("email_enabled,email_from_name,email_from_address,email_reply_to,email_admin_copy").eq("id", 1).single();
  if (error) throw error;
  return data as Settings;
}

export async function sendOliveiraEmail(input: SendEmailInput) {
  const client = serviceClient();
  const settings = await getSettings(client);
  if (!settings.email_enabled && input.eventType !== "test") return { status: "disabled" as const };

  let { data: delivery } = await client.from("oliveira_email_deliveries").select("*").eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (delivery?.status === "sent" && !input.forceRetry) return { status: "sent" as const, deliveryId: delivery.id, skipped: true };
  if (!delivery) {
    const inserted = await client.from("oliveira_email_deliveries").insert({
      event_type: input.eventType,
      recipient_email: input.recipientEmail,
      subject: input.subject,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      tenancy_id: input.tenancyId ?? null,
      contract_id: input.contractId ?? null,
      installment_id: input.installmentId ?? null,
      idempotency_key: input.idempotencyKey,
      operational_status: "queued",
      template_data: sanitizeEmailTemplateForStorage(input.eventType, input.template),
    }).select().single();
    if (inserted.error) {
      const existing = await client.from("oliveira_email_deliveries").select("*").eq("idempotency_key", input.idempotencyKey).single();
      if (existing.error) throw inserted.error;
      delivery = existing.data;
    } else delivery = inserted.data;
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada");
  await client.from("oliveira_email_deliveries").update({ status: "sending", operational_status: "sending", attempts: Number(delivery.attempts ?? 0) + 1, last_attempt_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("id", delivery.id);

  try {
    const recipient = input.recipientEmail.trim().toLowerCase();
    const adminCopy = settings.email_admin_copy.trim().toLowerCase();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey.slice(0, 256) },
      body: JSON.stringify({
        from: `${settings.email_from_name} <${settings.email_from_address}>`,
        to: [recipient],
        ...(shouldSendAdminCopy(input.eventType, input.adminCopy) &&
        adminCopy &&
        adminCopy !== recipient
          ? { bcc: [adminCopy] }
          : {}),
        reply_to: settings.email_reply_to,
        subject: input.subject,
        html: renderOliveiraEmail(input.template),
        text: plainText(input.template),
        tags: [{ name: "system", value: "oliveira" }, { name: "event", value: input.eventType }],
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(body?.message ?? body?.error ?? `Resend HTTP ${response.status}`));
    await client.from("oliveira_email_deliveries").update({ status: "sent", operational_status: "sent", provider_message_id: String(body.id ?? ""), sent_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("id", delivery.id);
    return { status: "sent" as const, deliveryId: delivery.id, providerMessageId: body.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no envio";
    await client.from("oliveira_email_deliveries").update({ status: "failed", operational_status: "failed", error_message: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", delivery.id);
    return {
      status: "failed" as const,
      deliveryId: delivery.id,
      error: "Falha no envio pelo provedor",
    };
  }
}

export async function retryOliveiraEmail(deliveryId: string) {
  const client = serviceClient();
  const { data, error } = await client.from("oliveira_email_deliveries").select("*").eq("id", deliveryId).single();
  if (error || !data) throw error ?? new Error("E-mail não encontrado");
  if (!canRetryStoredEmail(data.event_type)) {
    throw new Error(
      "E-mails de autenticação exigem a geração de um novo link ou código",
    );
  }
  return sendOliveiraEmail({
    eventType: data.event_type,
    recipientEmail: data.recipient_email,
    subject: data.subject,
    entityType: data.entity_type,
    entityId: data.entity_id,
    tenancyId: data.tenancy_id,
    contractId: data.contract_id,
    installmentId: data.installment_id,
    idempotencyKey: data.idempotency_key,
    template: data.template_data,
    forceRetry: true,
  });
}

export const formatMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(`${value}T12:00:00-03:00`));
