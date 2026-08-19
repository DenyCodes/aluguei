import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

const adminItems = [["/admin","IN","Início"],["/admin/leads","LE","Leads"],["/admin/inquilinos","IQ","Inquilinos"],["/admin/imoveis","IM","Imóveis"],["/admin/locacoes","LO","Locações"],["/admin/contratos","CO","Contratos"],["/admin/financeiro","FI","Financeiro"],["/admin/manutencoes","MA","Manutenções"],["/admin/emails","EM","E-mails"],["/admin/auditoria","AU","Auditoria"],["/admin/configuracoes","CF","Configurações"]];
const tenantItems = [["/inquilino","IN","Início"],["/inquilino/contrato","CO","Contrato"],["/inquilino/alugueis","AL","Aluguéis"],["/inquilino/comprovantes","CP","Comprovantes"],["/inquilino/manutencoes","MA","Manutenções"],["/inquilino/perfil","PF","Meu perfil"]];

export function DashboardShell({ title, subtitle, children, unread = 0 }: { title:string; subtitle:string; children:ReactNode; unread?:number }) {
  const { profile, signOut } = useAuth();
  const [open,setOpen] = useState(false);
  const items = profile?.role === "admin" ? adminItems : tenantItems;
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow="hidden";
    const close = (event:KeyboardEvent) => { if(event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown",close);
    return () => { document.body.style.overflow=previous; window.removeEventListener("keydown",close); };
  },[open]);
  return <div className="dashboard-layout">
    <header className="mobile-dashboard-bar"><Link to="/" className="mobile-brand"><span className="brand-mark">IO</span><strong>Imobiliária Oliveira</strong></Link><button type="button" className="mobile-menu-button" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}><span /><span /><span /></button></header>
    {open && <button className="sidebar-backdrop" type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
    <aside className={`dashboard-sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-top"><Link to="/" className="brand dashboard-brand"><span className="brand-mark">IO</span><span><strong>Imobiliária Oliveira</strong><small>Gestão de locações</small></span></Link><button type="button" className="sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu">×</button></div>
      <div className="user-chip"><span>{profile?.full_name?.slice(0,1).toUpperCase() ?? "U"}</span><div><strong>{profile?.full_name}</strong><small>{profile?.role === "admin" ? "Administrador" : "Inquilino"}{unread > 0 ? ` • ${unread} novas` : ""}</small></div></div>
      <nav aria-label="Navegação principal">{items.map(([path,icon,label]) => <NavLink key={path} to={path} end={path === "/admin" || path === "/inquilino"} onClick={() => setOpen(false)} className={({isActive}) => isActive ? "active" : ""}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</nav>
      <div className="sidebar-footer"><Link to="/">Ver site público</Link><button className="sidebar-logout" type="button" onClick={() => void signOut()}>Sair da conta</button></div>
    </aside>
    <main className="dashboard-main"><header className="dashboard-heading"><div><span className="eyebrow">Ambiente protegido</span><h1>{title}</h1><p>{subtitle}</p></div><span className="secure-pill">Acesso auditado</span></header>{children}</main>
  </div>;
}
