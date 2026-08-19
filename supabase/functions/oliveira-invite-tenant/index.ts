import type { User } from "npm:@supabase/supabase-js@2";
import { sendOliveiraEmail } from "../_shared/email.ts";
import { audit, json, requireAdmin, serve, serviceClient } from "../_shared/http.ts";

const maskCpf = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : null;
};

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  if (!email || fullName.split(/\s+/).length < 2) throw new Error("Informe nome completo e e-mail válido");
  const redirectTo = `${Deno.env.get("SITE_URL") ?? "http://localhost:5173"}/convite`;
  const client = serviceClient();
  const metadata = { app_scope: "oliveira", full_name: fullName, phone: String(body.phone ?? ""), cpf_masked: maskCpf(String(body.cpf ?? "")) };
  const profileResult = await client.from("oliveira_profiles").select("id,email,role").eq("email", email).maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (profileResult.data && profileResult.data.role !== "tenant")
    throw new Error("Esta conta não pode ser convertida em inquilino");

  const existingUser: User | null = await (async () => {
    if (profileResult.data?.id) {
      const lookup = await client.auth.admin.getUserById(profileResult.data.id);
      if (lookup.error) throw lookup.error;
      return lookup.data.user;
    }
    const listed = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listed.error) throw listed.error;
    return listed.data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
  })();
  if (!profileResult.data && existingUser && existingUser.user_metadata?.app_scope !== "oliveira") {
    throw new Error("Este e-mail já pertence a outro sistema e não pode ser convertido automaticamente em inquilino");
  }

  const generated = existingUser
    ? await client.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } })
    : await client.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: metadata } });
  const { data, error } = generated;
  if (error) throw error;
  if (!data.user || !data.properties?.action_link) throw new Error("Convite não criado");

  const profile = await client.from("oliveira_profiles").upsert({ id: data.user.id, email, full_name: fullName, phone: metadata.phone, cpf_masked: metadata.cpf_masked, role: "tenant" }, { onConflict: "id" });
  if (profile.error) throw profile.error;
  const updated = await client.auth.admin.updateUserById(data.user.id, { user_metadata: { ...data.user.user_metadata, ...metadata } });
  if (updated.error) throw updated.error;
  const delivery = await sendOliveiraEmail({
    eventType: "tenant_invite",
    recipientEmail: email,
    subject: "Convite para sua área de locação — Imobiliária Oliveira",
    entityType: "profile",
    entityId: data.user.id,
    idempotencyKey: `oliveira:invite:${data.user.id}:${crypto.randomUUID()}`,
    template: {
      preheader: "Defina sua senha para acessar contrato, aluguéis e comprovantes.",
      heading: existingUser ? "Seu acesso está disponível" : "Você recebeu um convite",
      greeting: `Olá, ${fullName}.`,
      paragraphs: [existingUser ? "Seu acesso à Imobiliária Oliveira já existia. Use este novo link seguro para entrar e definir uma nova senha." : "A Imobiliária Oliveira criou seu acesso privado para acompanhar a locação, revisar o contrato e enviar comprovantes."],
      notice: "Este convite é pessoal. Não encaminhe o link para outras pessoas.",
      ctaLabel: "Concluir cadastro",
      ctaUrl: data.properties.action_link,
    },
  });
  await audit(admin.id, existingUser ? "tenant.invite_resent" : "tenant.invited", "profile", data.user.id, { email, email_delivery_id: delivery.deliveryId, email_status: delivery.status }, request);
  return json({ id: data.user.id, invited: true, resent: Boolean(existingUser), email_status: delivery.status });
});
