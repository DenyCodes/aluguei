import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import {
  invokeSecure,
  isSupabaseConfigured,
  requireSupabase,
} from "../lib/supabase";
import { useAuth } from "../state/AuthContext";

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader />
      <main className="auth-page">
        <section className="auth-panel">
          <span className="eyebrow">Acesso protegido</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {!isSupabaseConfigured && (
            <div className="notice warning">
              O Supabase ainda não foi conectado. O login será habilitado quando
              as variáveis de ambiente forem configuradas.
            </div>
          )}
          {children}
        </section>
        <aside className="auth-aside">
          <span>Imobiliária Oliveira</span>
          <h2>Seus documentos e aluguéis em um ambiente privado.</h2>
          <ul>
            <li>Acesso somente por convite</li>
            <li>Contrato com histórico de assinatura</li>
            <li>Comprovantes e manutenções organizados</li>
          </ul>
        </aside>
      </main>
    </>
  );
}

export function LoginPage({
  portal = "tenant",
}: {
  portal?: "tenant" | "owner";
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { profile, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isOwnerPortal = portal === "owner";
  if (profile)
    return (
      <Navigate
        to={
          mustChangePassword
            ? "/alterar-senha"
            : profile.role === "admin"
              ? "/admin"
              : isOwnerPortal
                ? "/entrar"
                : "/inquilino"
        }
        replace
      />
    );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const { data: authData, error } =
        await requireSupabase().auth.signInWithPassword({
          email: String(data.get("email")),
          password: String(data.get("password")),
        });
      if (error) throw error;
      const client = requireSupabase();
      const { data: signedProfile, error: profileError } = await client
        .from("oliveira_profiles")
        .select("role,account_status")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!signedProfile || signedProfile.account_status !== "active") {
        await client.auth.signOut();
        throw new Error("Este cadastro não possui acesso ativo.");
      }
      if (isOwnerPortal && signedProfile.role !== "admin") {
        await client.auth.signOut();
        throw new Error(
          "Este acesso é exclusivo para proprietários. Use a área do inquilino.",
        );
      }
      if (authData.user.user_metadata?.must_change_password === true) {
        navigate("/alterar-senha", { replace: true });
        return;
      }
      const from = (
        location.state as {
          from?: { pathname?: string; search?: string };
        } | null
      )?.from;
      navigate(
        from?.pathname
          ? `${from.pathname}${from.search ?? ""}`
          : signedProfile.role === "admin"
            ? "/admin"
            : "/inquilino",
        { replace: true },
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout
      title={isOwnerPortal ? "Acesso do proprietário" : "Área do inquilino"}
      subtitle={
        isOwnerPortal
          ? "Entre com sua conta autorizada para administrar imóveis, locações e recebimentos."
          : "Use o e-mail que recebeu o convite da Imobiliária Oliveira."
      }
    >
      <form className="stack-form" onSubmit={submit}>
        <label>
          E-mail
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
        {message && <div className="notice error">{message}</div>}
        <button
          className="primary-button"
          type="submit"
          disabled={busy || !isSupabaseConfigured}
        >
          {busy ? "Entrando..." : "Entrar com segurança"}
        </button>
        <Link to="/recuperar-senha">Esqueci minha senha</Link>
        <Link to={isOwnerPortal ? "/entrar" : "/proprietario/entrar"}>
          {isOwnerPortal
            ? "Ir para a área do inquilino"
            : "Sou proprietário"}
        </Link>
      </form>
    </AuthLayout>
  );
}

export function RecoverPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await invokeSecure("oliveira-auth-email", {
        action: "recovery",
        email: String(data.get("email")),
      });
    } catch (error) {
      console.error("Solicitação de recuperação não concluída", error);
    } finally {
      setMessage(
        "Se o e-mail estiver cadastrado, você receberá as instruções.",
      );
      setBusy(false);
    }
  };
  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Enviaremos um link seguro e personalizado para o e-mail cadastrado."
    >
      <form className="stack-form" onSubmit={(event) => void submit(event)}>
        <label>
          E-mail
          <input type="email" name="email" required />
        </label>
        {message && <div className="notice">{message}</div>}
        <button
          className="primary-button"
          disabled={busy || !isSupabaseConfigured}
        >
          {busy ? "Enviando..." : "Enviar instruções"}
        </button>
        <Link to="/entrar">Voltar ao login</Link>
      </form>
    </AuthLayout>
  );
}

export function InvitePage() {
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password.length < 8) {
      setMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    const client = requireSupabase();
    const { data: current } = await client.auth.getUser();
    const { error } = await client.auth.updateUser({
      password,
      data: {
        ...(current.user?.user_metadata ?? {}),
        must_change_password: false,
      },
    });
    if (error) setMessage(error.message);
    else navigate("/inquilino", { replace: true });
  };
  return (
    <AuthLayout
      title="Concluir cadastro"
      subtitle="Defina uma senha forte para acessar sua locação."
    >
      <form className="stack-form" onSubmit={(event) => void submit(event)}>
        <label>
          Nova senha
          <input
            type="password"
            name="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>
        {message && <div className="notice error">{message}</div>}
        <button className="primary-button" disabled={!isSupabaseConfigured}>
          Salvar senha e entrar
        </button>
      </form>
    </AuthLayout>
  );
}

export function ChangePasswordPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, profile } = useAuth();
  const navigate = useNavigate();

  if (!session) return <Navigate to="/entrar" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("password_confirmation") ?? "");
    if (
      password.length < 10 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      setMessage(
        "Use pelo menos 10 caracteres, com letra maiúscula, minúscula e número.",
      );
      setBusy(false);
      return;
    }
    if (password !== confirmation) {
      setMessage("A confirmação da senha não corresponde.");
      setBusy(false);
      return;
    }
    try {
      const { error } = await requireSupabase().auth.updateUser({
        password,
        data: {
          ...(session.user.user_metadata ?? {}),
          must_change_password: false,
          password_changed_by_tenant_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      navigate(profile?.role === "admin" ? "/admin" : "/inquilino", {
        replace: true,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível trocar a senha.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Crie sua senha particular"
      subtitle="Você entrou com uma senha temporária. Escolha agora uma senha que somente você conheça."
    >
      <form className="stack-form" onSubmit={(event) => void submit(event)}>
        <label>
          Nova senha
          <input
            type="password"
            name="password"
            minLength={10}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            type="password"
            name="password_confirmation"
            minLength={10}
            autoComplete="new-password"
            required
          />
        </label>
        <small>
          Use letra maiúscula, minúscula, número e pelo menos 10 caracteres.
        </small>
        {message && <div className="notice error">{message}</div>}
        <button className="primary-button" disabled={busy}>
          {busy ? "Salvando..." : "Salvar minha nova senha"}
        </button>
      </form>
    </AuthLayout>
  );
}
