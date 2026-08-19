import { createClient, type User } from "npm:@supabase/supabase-js@2";
import { hasElevatedClaims, isAllowedOrigin } from "./http-security.ts";

export const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const corsResponse = (request: Request, response: Response) => {
  const origin = request.headers.get("origin");
  const headers = new Headers(response.headers);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.append("Vary", "Origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const publicError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const technical =
    /(postgres|postgrest|relation |column |sqlstate|jwt|service.role|api.key|stack|resend|fetch failed)/i.test(
      message,
    );
  if (!message || technical || message.length > 300)
    return "Não foi possível concluir a operação";
  return message;
};

const errorStatus = (message: string) => {
  if (/sessão|autenticad|token/i.test(message)) return 401;
  if (/acesso|administrador|pertence/i.test(message)) return 403;
  return 400;
};

export const serve = (handler: (request: Request) => Promise<Response>) =>
  Deno.serve(async (request) => {
    const origin = request.headers.get("origin");
    const allowed = isAllowedOrigin(
      origin,
      Deno.env.get("SITE_URL") ?? "",
      Deno.env.get("ALLOWED_ORIGINS") ?? "",
    );
    if (!allowed) return json({ error: "Origem não autorizada" }, 403);
    if (request.method === "OPTIONS") {
      return corsResponse(
        request,
        new Response("ok", { headers: corsHeaders }),
      );
    }
    if (request.method !== "POST") {
      return corsResponse(
        request,
        json({ error: "Método não permitido" }, 405),
      );
    }
    try {
      return corsResponse(request, await handler(request));
    } catch (error) {
      const message = publicError(error);
      console.error("Oliveira function failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code:
          typeof error === "object" && error && "code" in error
            ? String(error.code)
            : undefined,
      });
      return corsResponse(
        request,
        json({ error: message }, errorStatus(message)),
      );
    }
  });

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function requestClient(request: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: request.headers.get("Authorization") ?? "" },
      },
    },
  );
}

export async function requireUser(request: Request): Promise<User> {
  const token = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sessão obrigatória");
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão inválida");
  if (!data.user.email_confirmed_at)
    throw new Error("Confirme seu e-mail antes de continuar");
  const membership = await serviceClient()
    .from("oliveira_profiles")
    .select("account_status,deleted_at")
    .eq("id", data.user.id)
    .maybeSingle();
  if (
    membership.error ||
    membership.data?.account_status !== "active" ||
    membership.data?.deleted_at
  )
    throw new Error("Acesso Oliveira inativo");
  return data.user;
}

export async function requireAdmin(
  request: Request,
  options: { elevated?: boolean } = {},
): Promise<User> {
  const user = await requireUser(request);
  if (!(await isOliveiraAdmin(user)))
    throw new Error("Acesso administrativo negado");
  if (options.elevated) await requireElevatedAuth(request, user);
  return user;
}

export async function requireElevatedAuth(
  request: Request,
  verifiedUser?: User,
): Promise<User> {
  const user = verifiedUser ?? (await requireUser(request));
  const token = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sessão obrigatória");
  try {
    const encoded = token.split(".")[1] ?? "";
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded)) as {
      aal?: unknown;
      iat?: unknown;
    };
    if (hasElevatedClaims(claims)) return user;
  } catch {
    // O token ja foi validado por auth.getUser; payload ausente/invalido apenas nega elevacao.
  }
  throw new Error(
    "Acesso elevado necessário: entre novamente ou confirme o MFA para continuar",
  );
}

export async function isOliveiraAdmin(user: User): Promise<boolean> {
  if (!user.email_confirmed_at) return false;
  const { data, error } = await serviceClient().rpc("oliveira_is_admin_user", {
    p_user_id: user.id,
  });
  if (error) throw error;
  return data === true;
}

export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
  request?: Request,
) {
  const ip =
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { error } = await serviceClient().from("oliveira_audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    ip_address: ip,
  });
  if (error) throw error;
}
