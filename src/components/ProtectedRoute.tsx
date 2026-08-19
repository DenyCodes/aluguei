import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import type { UserRole } from "../lib/types";

export function ProtectedRoute({ role }: { role: UserRole }) {
  const { configured, loading, session, profile, mustChangePassword } =
    useAuth();
  const location = useLocation();

  if (!configured) {
    return (
      <main className="centered-page">
        <section className="setup-card">
          <span className="eyebrow">Configuração necessária</span>
          <h1>Conecte o Supabase para ativar esta área</h1>
          <p>
            O catálogo permanece público, mas contas, contratos e pagamentos não
            são simulados. Configure as variáveis descritas no arquivo de
            exemplo.
          </p>
          <a className="primary-button" href="/">
            Voltar aos imóveis
          </a>
        </section>
      </main>
    );
  }
  if (loading)
    return <div className="loading-screen">Carregando acesso seguro...</div>;
  if (!session)
    return <Navigate to="/entrar" state={{ from: location }} replace />;
  if (mustChangePassword && location.pathname !== "/alterar-senha")
    return <Navigate to="/alterar-senha" replace />;
  if (!profile || profile.role !== role) {
    return (
      <Navigate
        to={profile?.role === "admin" ? "/admin" : "/inquilino"}
        replace
      />
    );
  }
  if (profile.account_status !== "active") {
    return (
      <main className="centered-page">
        <section className="setup-card">
          <span className="eyebrow">Acesso desativado</span>
          <h1>Este cadastro não está ativo</h1>
          <p>
            Entre em contato com a Imobiliária Oliveira para revisar seu acesso.
          </p>
        </section>
      </main>
    );
  }
  return <Outlet />;
}
