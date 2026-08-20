import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export function AppHeader() {
  const { profile, signOut } = useAuth();
  return (
    <header className="site-header">
      <div className="shell header-row">
        <Link to="/" className="brand" aria-label="Imobiliária Oliveira - início">
          <span className="brand-mark">IO</span>
          <span>
            <strong>Imobiliária Oliveira</strong>
            <small>Locação com cuidado e transparência</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Navegação principal">
          <NavLink to="/" end>Imóveis</NavLink>
          <NavLink to="/sistema">Sistema</NavLink>
          {profile?.role === "admin" && (
            <NavLink to="/admin">Painel do proprietário</NavLink>
          )}
          {profile?.role === "tenant" && (
            <NavLink to="/inquilino">Minha locação</NavLink>
          )}
          {profile ? (
            <button className="link-button" type="button" onClick={() => void signOut()}>
              Sair
            </button>
          ) : (
            <>
              <NavLink to="/proprietario/entrar">Proprietários</NavLink>
              <NavLink to="/entrar" className="nav-cta">
                Área do inquilino
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
