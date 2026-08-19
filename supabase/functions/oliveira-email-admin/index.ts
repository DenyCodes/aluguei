import { retryOliveiraEmail, sendOliveiraEmail } from "../_shared/email.ts";
import { audit, json, requireAdmin, serve } from "../_shared/http.ts";

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  if (body.action === "retry") {
    const deliveryId = String(body.delivery_id ?? "");
    if (!deliveryId) throw new Error("E-mail obrigatório");
    const result = await retryOliveiraEmail(deliveryId);
    await audit(admin.id, "email.retried", "email_delivery", deliveryId, { status: result.status }, request);
    return json(result);
  }
  if (body.action === "test") {
    const idempotencyKey = `oliveira:test:${crypto.randomUUID()}`;
    const result = await sendOliveiraEmail({
      eventType: "test",
      recipientEmail: admin.email ?? "playtecno@outlook.com.br",
      subject: "Teste de e-mail — Imobiliária Oliveira",
      entityType: "settings",
      entityId: "1",
      idempotencyKey,
      template: {
        preheader: "A configuração de e-mail da Imobiliária Oliveira está funcionando.",
        heading: "Configuração validada",
        greeting: "Olá, administrador.",
        paragraphs: ["testesasasdasdasdas a comunicação entre as Edge Functions, o Resend e o domínio de envio."],
        fields: [{ label: "Remetente", value: "Imobiliária Oliveira" }, { label: "Ambiente", value: "Produção" }],
        ctaLabel: "Abrir painel administrativo",
        ctaUrl: `${Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app"}/admin`,
      },
    });
    await audit(admin.id, "email.test", "email_delivery", result.deliveryId ?? idempotencyKey, { status: result.status }, request);
    return json(result);
  }
  throw new Error("Ação inválida");
});
