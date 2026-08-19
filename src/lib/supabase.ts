import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const requireSupabase = () => {
  if (!supabase) {
    throw new Error(
      "Supabase ainda não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
};

export async function invokeSecure<T>(name: string, body?: Record<string, unknown>) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<T>(name, { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response) {
      let payload: { error?: string; message?: string } | null = null;
      try {
        payload = await response.clone().json() as { error?: string; message?: string };
      } catch { /* respostas sem JSON usam a mensagem padrão do SDK */ }
      if (payload) throw new Error(payload.error ?? payload.message ?? error.message);
    }
    throw error;
  }
  return data;
}

export async function invokeSecureForm<T>(name: string, body: FormData) {
  const client = requireSupabase();
  const { data: sessionData } = await client.auth.getSession();
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method:"POST",
    headers:{ Authorization:`Bearer ${sessionData.session?.access_token ?? ""}`, apikey:String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "") },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.error ?? payload.message ?? "Operação não concluída"));
  return payload as T;
}
