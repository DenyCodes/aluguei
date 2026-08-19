import type { FormEvent } from "react";

export function PropertyCreateForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="dashboard-card property-create-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Novo cadastro</span>
          <h2>Novo imóvel</h2>
          <p>Cadastre os dados principais e depois organize as fotos.</p>
        </div>
      </div>
      <form className="stack-form compact" onSubmit={onSubmit}>
        <div className="form-grid">
          <label>
            Título
            <input name="title" required />
          </label>
          <label>
            Bairro
            <input name="neighborhood" required />
          </label>
        </div>
        <label>
          Endereço
          <input name="address" required />
        </label>
        <div className="form-grid">
          <label>
            Aluguel
            <input name="price" type="number" min="0" required />
          </label>
          <label>
            Área m²
            <input name="area" type="number" min="0" required />
          </label>
          <label>
            Quartos
            <input name="bedrooms" type="number" min="0" required />
          </label>
          <label>
            Banheiros
            <input name="bathrooms" type="number" min="0" required />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Situação inicial
            <select name="availability_status" defaultValue="available">
              <option value="available">Disponível</option>
              <option value="rented">Alugado</option>
              <option value="maintenance">Em manutenção</option>
              <option value="archived">Arquivado</option>
            </select>
          </label>
          <label>
            Água
            <select name="water_policy" defaultValue="individual">
              <option value="included">Inclusa</option>
              <option value="individual">Individual</option>
              <option value="shared">Rateada</option>
            </select>
          </label>
          <label>
            Luz
            <select name="electricity_policy" defaultValue="individual">
              <option value="included">Inclusa</option>
              <option value="individual">Individual</option>
              <option value="shared">Rateada</option>
            </select>
          </label>
        </div>
        <label>
          Contato
          <input name="contact" defaultValue="(21) 99345-0137" required />
        </label>
        <button className="primary-button" disabled={busy}>
          {busy ? "Cadastrando..." : "Cadastrar imóvel"}
        </button>
      </form>
    </section>
  );
}
