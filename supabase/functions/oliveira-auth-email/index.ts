import { sendOliveiraEmail } from "../_shared/email.ts";
import { audit, json, serve, serviceClient } from "../_shared/http.ts";

const genericResponse = () => json({ accepted: true, message: "Se o e-mail estiver cadastrado, você receberá as instruções." });

serve(async (request) => {
  try {
    const body = await request.json();
    if (body.action !== "recovery") return genericResponse();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || email.length > 254) return genericResponse();
    const client = serviceClient();
    const { data: profile } = await client.from("oliveira_profiles").select("id,email,full_name,role").eq("email", email).maybeSingle();
    if (!profile) return genericResponse();

    const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
    const link = await client.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app"}/convite?mode=recovery`, data: { app_scope: "oliveira" } },
    });
    if (link.error || !link.data.properties?.action_link) {
      console.error("Recovery link not generated", link.error);
      return genericResponse();
    }
    const delivery = await sendOliveiraEmail({
      eventType: "password_recovery",
      recipientEmail: email,
      subject: "Recupere sua senha — Imobiliária Oliveira",
      entityType: "profile",
      entityId: profile.id,
      idempotencyKey: `oliveira:recovery:${profile.id}:${bucket}`,
      template: {
        preheader: "Use o link seguro para definir uma nova senha.",
        heading: "Recuperação de senha",
        greeting: `Olá, ${profile.full_name}.`,
        paragraphs: ["Recebemos uma solicitação para redefinir a senha da sua área de locação."],
        notice: "Se você não fez esta solicitação, ignore esta mensagem. O link expira conforme as regras de segurança do Supabase.",
        ctaLabel: "Definir nova senha",
        ctaUrl: link.data.properties.action_link,
      },
    });
    await audit(null, delivery.status === "sent" ? "email.recovery.sent" : "email.recovery.failed", "profile", profile.id, { delivery_id: delivery.deliveryId }, request);
  } catch (error) {
    console.error("Oliveira recovery request failed", error);
  }
  return genericResponse();
});
