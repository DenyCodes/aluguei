import type { User } from "npm:@supabase/supabase-js@2";
import { sendOliveiraEmail } from "../_shared/email.ts";
import {
  audit,
  json,
  requireAdmin,
  serve,
  serviceClient,
} from "../_shared/http.ts";

const setupAuthorized = (request: Request) => {
  const expected = Deno.env.get("ADMIN_INVITE_SETUP_SECRET") ?? "";
  const supplied = request.headers.get("x-admin-setup-secret") ?? "";
  return Boolean(expected && supplied && expected === supplied);
};

serve(async (request) => {
  let actorId: string | null = null;
  if (!setupAuthorized(request))
    actorId = (await requireAdmin(request, { elevated: true })).id;

  const body = await request.json();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(body.full_name ?? "Administrador Oliveira").trim();
  if (!email || !email.includes("@"))
    throw new Error("Informe um e-mail válido");

  const client = serviceClient();
  const allowed = await client
    .from("oliveira_admin_accounts")
    .select("email,active")
    .eq("email", email)
    .maybeSingle();
  if (allowed.error) throw allowed.error;
  if (!allowed.data?.active)
    throw new Error("E-mail não autorizado para administração");

  const listed = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const existingUser: User | null =
    listed.data.users.find((user) => user.email?.toLowerCase() === email) ??
    null;
  const redirectTo = `${Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app"}/convite`;
  const metadata = {
    ...(existingUser?.user_metadata ?? {}),
    app_scope: "oliveira_admin",
    full_name: fullName,
  };

  const generated = existingUser
    ? await client.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      })
    : await client.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: metadata },
      });
  if (generated.error) throw generated.error;
  if (!generated.data.user || !generated.data.properties?.action_link) {
    throw new Error("Convite administrativo não criado");
  }

  const userId = generated.data.user.id;
  const authUpdate = await client.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
  });
  if (authUpdate.error) throw authUpdate.error;
  const profile = await client.from("oliveira_profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: "admin",
      account_status: "active",
    },
    { onConflict: "id" },
  );
  if (profile.error) throw profile.error;

  const delivery = await sendOliveiraEmail({
    eventType: "tenant_invite",
    recipientEmail: email,
    subject: "Confirme seu acesso administrativo — Imobiliária Oliveira",
    entityType: "admin_profile",
    entityId: userId,
    idempotencyKey: `oliveira:admin-invite:${userId}:${crypto.randomUUID()}`,
    template: {
      preheader:
        "Confirme seu e-mail e defina a senha do painel administrativo.",
      heading: "Convite para administrar a Imobiliária Oliveira",
      greeting: `Olá, ${fullName}.`,
      paragraphs: [
        "Seu e-mail foi autorizado para acessar o painel administrativo da Imobiliária Oliveira.",
        "Use o botão abaixo para confirmar o acesso e definir sua senha pessoal.",
      ],
      notice:
        "Este link é pessoal e concede acesso a dados de imóveis, locações, contratos e pagamentos. Não encaminhe a terceiros.",
      ctaLabel: "Confirmar acesso administrativo",
      ctaUrl: generated.data.properties.action_link,
    },
  });

  await audit(
    actorId,
    "admin.invited",
    "profile",
    userId,
    {
      email,
      email_status: delivery.status,
      setup_authorized: actorId === null,
    },
    request,
  );
  return json(
    {
      id: userId,
      invited: true,
      existing_user: Boolean(existingUser),
      email_status: delivery.status,
      ...(delivery.status === "failed" ? { email_error: delivery.error } : {}),
    },
    delivery.status === "failed" ? 502 : 200,
  );
});
