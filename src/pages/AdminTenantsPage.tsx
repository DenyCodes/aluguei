import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "../components/DashboardShell";
import { invokeSecure, requireSupabase } from "../lib/supabase";
import type { Installment, Profile, Tenancy } from "../lib/types";

type TenantTenancy = Tenancy & {
  property?: {
    title: string;
    address: string;
  };
};

type RentInfo = {
  tenancy: TenantTenancy;
  installment: Installment | null;
};

const formatDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const isOpenInstallment = (installment: Installment) =>
  !["paid", "cancelled"].includes(installment.status);

export function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Profile[]>([]);
  const [tenancies, setTenancies] = useState<TenantTenancy[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [search, setSearch] = useState("");
  const [tenantStatus, setTenantStatus] = useState<
    "all" | Profile["account_status"]
  >("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const client = requireSupabase();
      const [tenantResult, tenancyResult, installmentResult] = await Promise.all([
        client
          .from("oliveira_profiles")
          .select("*")
          .eq("role", "tenant")
          .order("full_name"),
        client
          .from("oliveira_tenancies")
          .select("*, property:oliveira_properties(title,address)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        client
          .from("oliveira_rent_installments")
          .select("*")
          .order("due_date", { ascending: true }),
      ]);

      if (tenantResult.error) throw tenantResult.error;

      setTenants((tenantResult.data ?? []) as Profile[]);
      setTenancies(
        tenancyResult.error ? [] : ((tenancyResult.data ?? []) as TenantTenancy[]),
      );
      setInstallments(
        installmentResult.error
          ? []
          : ((installmentResult.data ?? []) as Installment[]),
      );

      if (tenancyResult.error || installmentResult.error) {
        setMessage(
          "Os inquilinos foram carregados, mas não foi possível consultar todos os vencimentos agora.",
        );
      }
    } catch (error) {
      setTenants([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os inquilinos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rentByTenant = useMemo(() => {
    const result = new Map<string, RentInfo>();

    for (const tenancy of tenancies) {
      if (tenancy.deleted_at) continue;

      const current = result.get(tenancy.tenant_id);
      const shouldReplace =
        !current ||
        (tenancy.status === "active" && current.tenancy.status !== "active");

      if (!shouldReplace) continue;

      const installment =
        installments
          .filter(
            (item) =>
              item.tenancy_id === tenancy.id && isOpenInstallment(item),
          )
          .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;

      result.set(tenancy.tenant_id, { tenancy, installment });
    }

    return result;
  }, [installments, tenancies]);

  const filteredTenants = useMemo(
    () =>
      tenants.filter(
        (tenant) =>
          (tenantStatus === "all" || tenant.account_status === tenantStatus) &&
          `${tenant.full_name} ${tenant.email} ${tenant.phone ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [search, tenantStatus, tenants],
  );

  const inviteTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const payload = Object.fromEntries(new FormData(formElement));

    setBusy(true);
    setMessage("");
    try {
      await invokeSecure("oliveira-invite-tenant", payload);
      formElement.reset();
      setMessage("Convite enviado ao inquilino.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível enviar o convite.",
      );
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardShell
      title="Inquilinos"
      subtitle="Cadastros, locações ativas e vencimentos de aluguel."
    >
      {message && <div className="notice">{message}</div>}
      <div className="split-panel">
        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>Inquilinos</h2>
              <p>
                A lista é carregada de forma independente para não ser afetada
                por falhas em outros módulos do painel.
              </p>
            </div>
            <span className="soft-badge">
              {loading ? "Carregando..." : `${filteredTenants.length} registros`}
            </span>
          </div>

          <div className="directory-filters">
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, e-mail ou telefone"
              aria-label="Buscar inquilinos"
            />
            <select
              aria-label="Filtrar situação do cadastro"
              value={tenantStatus}
              onChange={(event) =>
                setTenantStatus(event.target.value as typeof tenantStatus)
              }
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="disabled">Desativados</option>
              <option value="deleted">Excluídos</option>
            </select>
          </div>

          <div className="tenant-directory">
            {filteredTenants.map((tenant) => {
              const rentInfo = rentByTenant.get(tenant.id);
              const isOverdue =
                Boolean(rentInfo?.installment) &&
                rentInfo!.installment!.due_date < today;

              return (
                <Link to={`/admin/inquilinos/${tenant.id}`} key={tenant.id}>
                  <div className="profile-avatar">
                    {tenant.full_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{tenant.full_name}</strong>
                    <small>
                      {tenant.email} • {tenant.phone || "sem telefone"}
                    </small>
                    {rentInfo ? (
                      <small>
                        {rentInfo.tenancy.property?.title ?? "Locação"} •{" "}
                        {formatCurrency(rentInfo.tenancy.monthly_rent)} •{" "}
                        {rentInfo.installment
                          ? `${isOverdue ? "Vencido em" : "Próximo vencimento"}: ${formatDate(rentInfo.installment.due_date)}`
                          : `Vencimento mensal: dia ${rentInfo.tenancy.due_day}`}
                      </small>
                    ) : (
                      <small>Sem locação vinculada</small>
                    )}
                  </div>
                  <span className={`status ${tenant.account_status}`}>
                    {tenant.account_status === "active"
                      ? "Ativo"
                      : tenant.account_status === "disabled"
                        ? "Desativado"
                        : "Excluído"}
                  </span>
                </Link>
              );
            })}
          </div>

          {!loading && !filteredTenants.length && (
            <div className="empty-state compact">
              Nenhum inquilino corresponde aos filtros selecionados.
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <h2>Convidar inquilino</h2>
          <form
            className="stack-form"
            onSubmit={(event) => void inviteTenant(event)}
          >
            <label>
              Nome completo
              <input name="full_name" required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required />
            </label>
            <label>
              Telefone
              <input name="phone" />
            </label>
            <label>
              CPF
              <input name="cpf" inputMode="numeric" />
            </label>
            <button className="primary-button" disabled={busy}>
              {busy ? "Enviando..." : "Cadastrar e enviar convite"}
            </button>
          </form>
        </section>
      </div>
    </DashboardShell>
  );
}
