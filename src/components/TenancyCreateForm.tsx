import type { FormEvent } from "react";
import type { Profile, Property } from "../lib/types";

type Props = {
  tenants: Profile[];
  properties: Property[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  defaultTenantId?: string;
  defaultPropertyId?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
};

export function TenancyCreateForm({
  tenants,
  properties,
  busy,
  onSubmit,
  defaultTenantId = "",
  defaultPropertyId = "",
  title = "Criar nova locação",
  description = "Vincule o inquilino ao imóvel. As parcelas serão geradas automaticamente.",
  submitLabel = "Criar locação",
}: Props) {
  const availableTenants = tenants.filter(
    (tenant) => tenant.account_status === "active",
  );
  const usableProperties = properties.filter(
    (property) =>
      property.active &&
      !["maintenance", "archived"].includes(property.availability_status),
  );

  return (
    <section className="dashboard-card tenancy-simple-card" id="nova-locacao">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Primeira etapa</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <form className="stack-form" onSubmit={onSubmit}>
        <div className="form-grid">
          <label>
            Inquilino
            <select name="tenant_id" defaultValue={defaultTenantId} required>
              <option value="">Selecione o inquilino</option>
              {availableTenants.map((tenant) => (
                <option value={tenant.id} key={tenant.id}>
                  {tenant.full_name} — {tenant.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Imóvel
            <select
              name="property_id"
              defaultValue={defaultPropertyId}
              required
            >
              <option value="">Selecione o imóvel</option>
              {usableProperties.map((property) => (
                <option value={property.id} key={property.id}>
                  {property.title} —{" "}
                  {property.availability_status === "rented"
                    ? "alugado"
                    : "disponível"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Início
            <input name="starts_on" type="date" required />
          </label>
          <label>
            Término
            <input name="ends_on" type="date" required />
          </label>
          <label>
            Aluguel mensal
            <input
              name="monthly_rent"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label>
            Vencimento
            <input
              name="due_day"
              type="number"
              min="1"
              max="28"
              defaultValue="12"
              required
            />
          </label>
        </div>
        <details className="tenancy-advanced-fields">
          <summary>Multa, juros e outras regras</summary>
          <div className="form-grid">
            <label>
              Multa por atraso %
              <input
                name="late_fee_percent"
                type="number"
                min="0"
                step="0.01"
                defaultValue="2"
                required
              />
            </label>
            <label>
              Juros ao mês %
              <input
                name="monthly_interest_percent"
                type="number"
                min="0"
                step="0.01"
                defaultValue="1"
                required
              />
            </label>
            <label>
              Reajuste
              <input
                name="adjustment_index"
                defaultValue="IPCA anual"
                required
              />
            </label>
            <label>
              Garantia
              <select name="guarantee_type" defaultValue="none">
                <option value="none">Sem garantia</option>
                <option value="deposit">Caução</option>
                <option value="guarantor">Fiador</option>
                <option value="insurance">Seguro-fiança</option>
              </select>
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              name="require_document_approval"
              value="true"
            />
            <span>Exigir foto e RG aprovados antes da assinatura</span>
          </label>
        </details>
        <button className="primary-button" disabled={busy}>
          {busy ? "Criando locação..." : submitLabel}
        </button>
      </form>
    </section>
  );
}
