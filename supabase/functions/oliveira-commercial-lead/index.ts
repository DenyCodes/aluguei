import {
  sendOliveiraEmail,
  type EmailTemplateData,
  type OliveiraEmailEvent,
} from "../_shared/email.ts";
import { audit, serviceClient } from "../_shared/http.ts";

type LeadPayload = {
  submission_id?: unknown;
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  consent?: unknown;
  website?: unknown;
  started_at?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
};

type RateLimitResult = {
  allowed?: boolean;
  attempts?: number;
  retry_after?: number;
};

type AdminRecipient = { id: string; email: string };

const encoder = new TextEncoder();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'\u2019-]{1,99}$/u;

function normalizedOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isAllowedOrigin(origin: string) {
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  const configured = [
    Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app",
    ...(Deno.env.get("OLIVEIRA_ALLOWED_ORIGINS") ?? "").split(","),
  ]
    .map((item) => normalizedOrigin(item.trim()))
    .filter(Boolean);
  return configured.includes(normalizedOrigin(origin));
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function response(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cleanText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text.slice(0, maxLength);
}

function cleanOptional(value: unknown) {
  const text = cleanText(value, 100);
  return text || null;
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(value: string, pepper: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

async function notifyAdmins(leadId: string): Promise<AdminRecipient[]> {
  const client = serviceClient();
  const accounts = await client
    .from("oliveira_admin_accounts")
    .select("email")
    .eq("active", true);
  if (accounts.error) throw accounts.error;
  const emails = (accounts.data ?? []).map((item) => String(item.email));
  if (!emails.length) return [];
  const profiles = await client
    .from("oliveira_profiles")
    .select("id,email")
    .eq("role", "admin")
    .eq("account_status", "active")
    .in("email", emails);
  if (profiles.error) throw profiles.error;
  if (!profiles.data?.length) return [];
  const notifications = profiles.data.map((profile) => ({
    recipient_id: profile.id,
    event_type: "commercial_lead_created",
    title: "Novo pedido de implantação",
    body: "Um novo contato chegou pela página comercial do sistema.",
    entity_type: "commercial_lead",
    entity_id: leadId,
    action_url: `/admin/leads?lead=${leadId}`,
  }));
  const inserted = await client.from("oliveira_notifications").insert(notifications);
  if (inserted.error) throw inserted.error;
  return profiles.data.map((profile) => ({
    id: String(profile.id),
    email: String(profile.email),
  }));
}

async function sendAdminLeadEmail(
  admin: AdminRecipient,
  lead: { id: string; fullName: string; email: string; phoneDigits: string },
) {
  const siteUrl =
    Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app";
  const idempotencyKey =
    `oliveira:commercial-lead:${lead.id}:admin:${admin.id}:v1`;
  const template: EmailTemplateData = {
    preheader: "Um novo pedido de implantação chegou pela página do sistema.",
    heading: "Novo pedido de implantação",
    greeting: "Olá, administrador.",
    paragraphs: [
      "Um contato autorizou o atendimento comercial e pediu uma proposta sob orçamento.",
      "Acesse o painel para registrar o andamento e manter o histórico do atendimento.",
    ],
    fields: [
      { label: "Nome", value: lead.fullName },
      { label: "E-mail", value: lead.email },
      { label: "Telefone", value: lead.phoneDigits },
    ],
    ctaLabel: "Abrir lead no painel",
    ctaUrl: `${siteUrl}/admin/leads?lead=${lead.id}`,
    footer:
      "Mensagem administrativa da Imobiliária Oliveira. Trate os dados somente para responder à solicitação.",
  };

  return sendOliveiraEmail({
    eventType: "commercial_lead_admin" as OliveiraEmailEvent,
    recipientEmail: admin.email,
    subject: "Novo pedido de implantação — Imobiliária Oliveira",
    entityType: "commercial_lead",
    entityId: lead.id,
    idempotencyKey,
    template,
    adminCopy: false,
  });
}

function sendLeadConfirmationEmail(lead: {
  id: string;
  fullName: string;
  email: string;
  phoneDigits: string;
}) {
  const siteUrl =
    Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app";
  const template: EmailTemplateData = {
    preheader: "Seu pedido de proposta foi recebido pela Imobiliária Oliveira.",
    heading: "Vamos conversar sobre a sua operação",
    greeting: `Olá, ${lead.fullName}.`,
    paragraphs: [
      "Recebemos seu pedido de implantação. Um responsável poderá usar os dados informados para entender sua rotina e preparar uma proposta sob orçamento.",
      "O sistema reúne catálogo de imóveis, galeria e disponibilidade; convites, perfis e documentos de inquilinos; locações, parcelas e histórico; contratos em PDF com assinatura eletrônica interna; cobrança configurável, comprovantes, recibos e manutenções; além de notificações, e-mails e auditoria administrativa.",
      "A implantação é dedicada e o escopo final considera quantidade de imóveis, regras da operação, identidade visual e integrações necessárias.",
    ],
    fields: [
      { label: "Nome", value: lead.fullName },
      { label: "E-mail", value: lead.email },
      { label: "Telefone", value: lead.phoneDigits },
    ],
    notice:
      "A implantação pode incluir cobrança por Pix Automático e cartão via Asaas, conforme elegibilidade, configuração e adesão expressa; Pix comum e comprovante manual permanecem como contingência. A ativação nunca é retroativa e encargos são lançados separadamente. A assinatura disponível é eletrônica interna e não equivale a um certificado ICP-Brasil.",
    ctaLabel: "Rever funcionalidades",
    ctaUrl: `${siteUrl}/sistema`,
    footer:
      "Esta confirmação foi enviada somente porque você solicitou contato. Ela não cadastra você em uma lista de marketing.",
  };
  return sendOliveiraEmail({
    eventType: "commercial_lead_confirmation" as OliveiraEmailEvent,
    recipientEmail: lead.email,
    subject: "Recebemos seu pedido de implantação — Imobiliária Oliveira",
    entityType: "commercial_lead",
    entityId: lead.id,
    idempotencyKey: `oliveira:commercial-lead:${lead.id}:confirmation:v1`,
    template,
    adminCopy: false,
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") ?? "";
  if (!origin || !isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origem não autorizada" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return response(origin, { error: "Método não permitido" }, 405);
  }

  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 4096) {
      return response(origin, { error: "Conteúdo muito grande" }, 413);
    }
    const rawBody = await request.text();
    if (rawBody.length > 4096) {
      return response(origin, { error: "Conteúdo muito grande" }, 413);
    }
    let body: LeadPayload;
    try {
      body = JSON.parse(rawBody) as LeadPayload;
    } catch {
      return response(origin, { error: "Conteúdo inválido" }, 400);
    }

    // Honeypot e tempo mínimo são sinais auxiliares. A resposta genérica evita
    // ensinar ao robô qual regra bloqueou a submissão.
    const honeypot = String(body.website ?? "").trim();
    const startedAt = Number(body.started_at ?? 0);
    if (
      honeypot ||
      (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 700)
    ) {
      return response(origin, { accepted: true }, 202);
    }

    const submissionId = cleanText(body.submission_id, 36);
    const fullName = cleanText(body.full_name, 100);
    const email = cleanText(body.email, 254).toLowerCase();
    const phoneDigits = String(body.phone ?? "").replace(/\D/g, "");

    if (!UUID_PATTERN.test(submissionId)) {
      return response(origin, { error: "Identificador de envio inválido" }, 422);
    }
    if (!NAME_PATTERN.test(fullName)) {
      return response(origin, { error: "Informe seu nome completo" }, 422);
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return response(origin, { error: "Informe um e-mail válido" }, 422);
    }
    if (!/^\d{10,15}$/.test(phoneDigits)) {
      return response(origin, { error: "Informe um telefone válido" }, 422);
    }
    if (body.consent !== true) {
      return response(
        origin,
        { error: "Autorize o contato para enviar a solicitação" },
        422,
      );
    }

    const client = serviceClient();
    const existingSubmission = await client
      .from("oliveira_commercial_leads")
      .select("id")
      .eq("submission_id", submissionId)
      .maybeSingle();
    if (existingSubmission.error) throw existingSubmission.error;
    if (existingSubmission.data) {
      return response(origin, { accepted: true, duplicate: true }, 200);
    }

    const pepper = Deno.env.get("OLIVEIRA_LEAD_HASH_PEPPER");
    if (!pepper) throw new Error("Configuração antispam ausente");
    const forwardedFor =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("cf-connecting-ip")?.trim() ??
      "unknown";
    const userAgent = cleanText(request.headers.get("user-agent"), 240);
    const rateKey = await hmac(`${forwardedFor}|${userAgent}`, pepper);
    const contactHash = await hmac(`${email}|${phoneDigits}`, pepper);

    const rate = await client.rpc("oliveira_consume_commercial_lead_rate_limit", {
      p_key_hash: rateKey,
      p_limit: 5,
      p_window_seconds: 1800,
    });
    if (rate.error) throw rate.error;
    const rateData = (rate.data ?? {}) as RateLimitResult;
    if (rateData.allowed !== true) {
      return response(
        origin,
        {
          error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
          retry_after: rateData.retry_after ?? 1800,
        },
        429,
      );
    }

    const recentDuplicate = await client
      .from("oliveira_commercial_leads")
      .select("id")
      .eq("contact_hash", contactHash)
      .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentDuplicate.error) throw recentDuplicate.error;
    if (recentDuplicate.data) {
      return response(origin, { accepted: true, duplicate: true }, 200);
    }

    const inserted = await client
      .from("oliveira_commercial_leads")
      .insert({
        submission_id: submissionId,
        contact_hash: contactHash,
        full_name: fullName,
        email,
        phone_digits: phoneDigits,
        source_path: "/sistema",
        utm_source: cleanOptional(body.utm_source),
        utm_medium: cleanOptional(body.utm_medium),
        utm_campaign: cleanOptional(body.utm_campaign),
        consent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") {
        return response(origin, { accepted: true, duplicate: true }, 200);
      }
      throw inserted.error ?? new Error("Pedido não registrado");
    }
    const leadId = inserted.data.id;

    let admins: AdminRecipient[] = [];
    try {
      admins = await notifyAdmins(leadId);
    } catch (error) {
      console.error("commercial lead notification failed", error);
    }
    try {
      await audit(null, "commercial_lead.created", "commercial_lead", leadId, {
        source_path: "/sistema",
        has_utm: Boolean(body.utm_source || body.utm_medium || body.utm_campaign),
      });
    } catch (error) {
      console.error("commercial lead audit failed", error);
    }

    let confirmationSent = false;
    try {
      const delivery = await sendLeadConfirmationEmail({
        id: leadId,
        fullName,
        email,
        phoneDigits,
      });
      confirmationSent = delivery.status === "sent";
      await audit(
        null,
        confirmationSent
          ? "email.commercial_lead.sent"
          : "email.commercial_lead.failed",
        "commercial_lead",
        leadId,
        { delivery_id: delivery.deliveryId ?? null },
      ).catch((error) => console.error("commercial lead email audit failed", error));
    } catch (error) {
      console.error("commercial lead confirmation failed", error);
    }

    const adminDeliveries = await Promise.allSettled(
      admins.map((admin) =>
        sendAdminLeadEmail(admin, {
          id: leadId,
          fullName,
          email,
          phoneDigits,
        }),
      ),
    );
    for (const delivery of adminDeliveries) {
      if (delivery.status === "rejected") {
        console.error("commercial lead admin email failed", delivery.reason);
      }
    }

    return response(
      origin,
      { accepted: true, confirmation_sent: confirmationSent },
      202,
    );
  } catch (error) {
    console.error("commercial lead request failed", error);
    return response(
      origin,
      { error: "Não foi possível registrar agora. Tente novamente em instantes." },
      500,
    );
  }
});
