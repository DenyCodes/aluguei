import { useMemo, useState } from "react";
import { invokeSecure } from "../lib/supabase";
import type {
  ContractSection,
  ContractTemplate,
  OliveiraSettings,
  Profile,
  Property,
  Tenancy,
} from "../lib/types";
import { PdfViewerModal } from "./PdfViewerModal";

type EditorProps = {
  tenancies: Tenancy[];
  tenants: Profile[];
  properties: Property[];
  templates: ContractTemplate[];
  settings: OliveiraSettings;
  onReload: () => Promise<void>;
};
type Fields = Record<string, string>;
type Step = "data" | "clauses" | "review";

const fieldGroups: Array<{
  title: string;
  description: string;
  fields: Array<[string, string, string]>;
}> = [
  {
    title: "Partes",
    description: "Identificação do proprietário e da pessoa que assinará.",
    fields: [
      ["landlord_name", "Nome do locador", "text"],
      ["landlord_tax_id", "CPF do locador", "text"],
      ["tenant_name", "Nome do inquilino", "text"],
      ["tenant_tax_id", "CPF do inquilino", "text"],
      ["tenant_email", "E-mail do inquilino", "email"],
    ],
  },
  {
    title: "Imóvel e vigência",
    description: "Dados que definem o objeto e o período da locação.",
    fields: [
      ["property_title", "Identificação do imóvel", "text"],
      ["property_address", "Endereço completo", "text"],
      ["starts_on", "Início", "date"],
      ["ends_on", "Término", "date"],
      ["issue_city", "Cidade da emissão", "text"],
      ["issue_date", "Data por extenso", "text"],
    ],
  },
  {
    title: "Valores e regras",
    description: "Condições financeiras e responsabilidades mensais.",
    fields: [
      ["monthly_rent", "Aluguel", "text"],
      ["due_day", "Dia de vencimento", "number"],
      ["late_fee_percent", "Multa %", "number"],
      ["monthly_interest_percent", "Juros ao mês %", "number"],
      ["adjustment_index", "Reajuste", "text"],
      ["guarantee_type", "Garantia", "text"],
      ["water_policy", "Regra da água", "text"],
      ["electricity_policy", "Regra da luz", "text"],
      ["notice_days", "Aviso prévio (dias)", "number"],
      ["jurisdiction", "Foro", "text"],
    ],
  },
];
const policyLabel = {
  included: "inclusa no aluguel",
  individual: "de responsabilidade direta do locatário",
  shared: "rateada conforme regra registrada",
} as Record<string, string>;
const guaranteeLabel = {
  none: "sem garantia",
  deposit: "caução",
  guarantor: "fiador",
  insurance: "seguro-fiança",
} as Record<string, string>;

function tenancyFields(
  tenancy: Tenancy | undefined,
  tenants: Profile[],
  properties: Property[],
  settings: OliveiraSettings,
  previous: Fields = {},
) {
  if (!tenancy) return previous;
  const tenant = tenants.find((item) => item.id === tenancy.tenant_id);
  const property = properties.find((item) => item.id === tenancy.property_id);
  return {
    ...previous,
    landlord_name: previous.landlord_name || settings.landlord_name,
    landlord_tax_id: previous.landlord_tax_id || settings.landlord_tax_id,
    tenant_name: tenant?.full_name ?? "",
    tenant_tax_id: tenant?.cpf_masked ?? "não informado",
    tenant_email: tenant?.email ?? "",
    property_title: property?.title ?? "",
    property_address: property?.address ?? "",
    starts_on: tenancy.starts_on,
    ends_on: tenancy.ends_on,
    monthly_rent: Number(tenancy.monthly_rent).toFixed(2).replace(".", ","),
    due_day: String(tenancy.due_day),
    late_fee_percent: String(tenancy.late_fee_percent),
    monthly_interest_percent: String(tenancy.monthly_interest_percent),
    adjustment_index: tenancy.adjustment_index,
    guarantee_type:
      guaranteeLabel[tenancy.guarantee_type] ?? tenancy.guarantee_type,
    water_policy: property ? policyLabel[property.water_policy] : "",
    electricity_policy: property
      ? policyLabel[property.electricity_policy]
      : "",
    notice_days: previous.notice_days || "30",
    jurisdiction: previous.jurisdiction || settings.jurisdiction,
    issue_city:
      previous.issue_city || settings.jurisdiction.split("-")[0].trim(),
    issue_date: new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
      new Date(),
    ),
  };
}

function partyFields(
  tenantId: string,
  propertyId: string,
  tenants: Profile[],
  properties: Property[],
  settings: OliveiraSettings,
  previous: Fields,
) {
  const tenant = tenants.find((item) => item.id === tenantId);
  const property = properties.find((item) => item.id === propertyId);
  return {
    ...previous,
    landlord_name: previous.landlord_name || settings.landlord_name,
    landlord_tax_id: previous.landlord_tax_id || settings.landlord_tax_id,
    tenant_name: tenant?.full_name ?? "",
    tenant_tax_id: tenant?.cpf_masked ?? "não informado",
    tenant_email: tenant?.email ?? "",
    property_title: property?.title ?? "",
    property_address: property?.address ?? "",
    water_policy: property ? policyLabel[property.water_policy] : "",
    electricity_policy: property
      ? policyLabel[property.electricity_policy]
      : "",
  };
}

export function ContractEditor({
  tenancies,
  tenants,
  properties,
  templates,
  settings,
  onReload,
}: EditorProps) {
  const defaultTemplate =
    templates.find((item) => item.is_default) ?? templates[0];
  const [step, setStep] = useState<Step>("data");
  const [tenancyId, setTenancyId] = useState(tenancies[0]?.id ?? "");
  const [tenantId, setTenantId] = useState(tenancies[0]?.tenant_id ?? "");
  const [propertyId, setPropertyId] = useState(tenancies[0]?.property_id ?? "");
  const [templateId, setTemplateId] = useState(defaultTemplate?.id ?? "");
  const [modelName, setModelName] = useState(
    defaultTemplate?.name ?? "Contrato residencial Oliveira",
  );
  const [modelDescription, setModelDescription] = useState(
    defaultTemplate?.description ?? "",
  );
  const [title, setTitle] = useState(
    defaultTemplate?.content.title ??
      "CONTRATO PARTICULAR DE LOCAÇÃO RESIDENCIAL",
  );
  const [sections, setSections] = useState<ContractSection[]>(
    defaultTemplate?.content.sections ?? [],
  );
  const [fields, setFields] = useState<Fields>(() =>
    tenancyFields(tenancies[0], tenants, properties, settings),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const selectedTenant = tenants.find((item) => item.id === tenantId);
  const selectedProperty = properties.find((item) => item.id === propertyId);
  const matchingTenancies = useMemo(
    () =>
      tenancies.filter(
        (item) =>
          (!tenantId || item.tenant_id === tenantId) &&
          (!propertyId || item.property_id === propertyId),
      ),
    [tenancies, tenantId, propertyId],
  );

  const selectTemplate = (id: string) => {
    setTemplateId(id);
    const selected = templates.find((item) => item.id === id);
    if (!selected) return;
    setModelName(selected.name);
    setModelDescription(selected.description);
    setTitle(selected.content.title);
    setSections(selected.content.sections.map((item) => ({ ...item })));
  };
  const selectTenancy = (id: string) => {
    setTenancyId(id);
    const tenancy = tenancies.find((item) => item.id === id);
    if (tenancy) {
      setTenantId(tenancy.tenant_id);
      setPropertyId(tenancy.property_id);
    }
    setFields((current) =>
      tenancyFields(tenancy, tenants, properties, settings, current),
    );
  };
  const selectParties = (nextTenantId: string, nextPropertyId: string) => {
    setTenantId(nextTenantId);
    setPropertyId(nextPropertyId);
    const match =
      tenancies.find(
        (item) =>
          item.tenant_id === nextTenantId &&
          item.property_id === nextPropertyId &&
          item.status === "active",
      ) ??
      tenancies.find(
        (item) =>
          item.tenant_id === nextTenantId &&
          item.property_id === nextPropertyId,
      );
    setTenancyId(match?.id ?? "");
    setFields((current) =>
      match
        ? tenancyFields(match, tenants, properties, settings, current)
        : partyFields(
            nextTenantId,
            nextPropertyId,
            tenants,
            properties,
            settings,
            current,
          ),
    );
  };
  const content = { title, sections };
  const payload = {
    tenancy_id: tenancyId,
    template_id: templateId,
    template_content: content,
    fields,
  };
  const execute = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setBusy(false);
    }
  };
  const saveModel = (newCopy = false) =>
    execute(async () => {
      const result = await invokeSecure("oliveira-contract-template-admin", {
        action: "save",
        ...(newCopy ? {} : { template_id: templateId }),
        name: newCopy ? `${modelName} - cópia` : modelName,
        description: modelDescription,
        content,
      });
      const saved = (result as { template?: ContractTemplate }).template;
      if (saved?.id) setTemplateId(saved.id);
      setMessage(newCopy ? "Novo modelo criado." : "Modelo salvo com sucesso.");
      await onReload();
    });
  const preview = () =>
    execute(async () => {
      if (!tenancyId)
        throw new Error("Selecione uma locação antes de visualizar.");
      const result = (await invokeSecure("oliveira-contract-issue", {
        ...payload,
        action: "preview",
      })) as { preview_url?: string };
      if (!result.preview_url)
        throw new Error("Pré-visualização indisponível.");
      setPreviewUrl(result.preview_url);
      setMessage("PDF atualizado. O acesso privado expira em 10 minutos.");
    });
  const issue = () =>
    execute(async () => {
      if (!tenancyId) throw new Error("Selecione uma locação.");
      if (
        !window.confirm(
          "Salvar esta versão em PDF e enviá-la ao inquilino para assinatura?",
        )
      )
        return;
      const result = (await invokeSecure("oliveira-contract-issue", {
        ...payload,
        action: "issue",
      })) as { email_status?: string };
      setMessage(
        result.email_status === "sent"
          ? "Contrato salvo e enviado ao inquilino."
          : "Contrato salvo. O e-mail ficou registrado para nova tentativa.",
      );
      await onReload();
    });
  const updateSection = (
    index: number,
    key: keyof ContractSection,
    value: string,
  ) =>
    setSections((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );

  return (
    <section className="contract-editor-workspace">
      <header className="contract-editor-header">
        <div>
          <span className="eyebrow">Preparação do documento</span>
          <h2>Editor de contrato</h2>
          <p>
            Revise os dados, personalize as cláusulas e confira o PDF antes do
            envio.
          </p>
        </div>
        <div className="contract-draft-badge">
          <span>Rascunho atual</span>
          <strong>{sections.length} cláusulas</strong>
        </div>
      </header>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="contract-context-bar">
        <label>
          <span>Inquilino cadastrado</span>
          <select
            value={tenantId}
            onChange={(event) => selectParties(event.target.value, propertyId)}
            required
          >
            <option value="">Selecione o inquilino</option>
            {tenants.map((tenant) => (
              <option
                key={tenant.id}
                value={tenant.id}
                disabled={tenant.account_status !== "active"}
              >
                {tenant.full_name} — {tenant.email}
                {tenant.account_status !== "active" ? " (inativo)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Imóvel cadastrado</span>
          <select
            value={propertyId}
            onChange={(event) => selectParties(tenantId, event.target.value)}
            required
          >
            <option value="">Selecione o imóvel</option>
            {properties.map((property) => (
              <option
                key={property.id}
                value={property.id}
                disabled={property.availability_status === "archived"}
              >
                {property.title} — {property.address} (
                {property.availability_status === "rented"
                  ? "alugado"
                  : property.availability_status === "available"
                    ? "disponível"
                    : property.availability_status === "maintenance"
                      ? "em manutenção"
                      : "arquivado"}
                )
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Locação vinculada</span>
          {matchingTenancies.length > 1 ? (
            <select
              value={tenancyId}
              onChange={(event) => selectTenancy(event.target.value)}
              required
            >
              <option value="">Selecione o período</option>
              {matchingTenancies.map((item) => (
                <option key={item.id} value={item.id}>
                  {new Date(`${item.starts_on}T12:00:00`).toLocaleDateString(
                    "pt-BR",
                  )}{" "}
                  a{" "}
                  {new Date(`${item.ends_on}T12:00:00`).toLocaleDateString(
                    "pt-BR",
                  )}{" "}
                  — {item.status}
                </option>
              ))}
            </select>
          ) : matchingTenancies.length === 1 ? (
            <div className="linked-tenancy-summary">
              <strong>Vinculada automaticamente</strong>
              <small>
                {new Date(
                  `${matchingTenancies[0].starts_on}T12:00:00`,
                ).toLocaleDateString("pt-BR")}{" "}
                a{" "}
                {new Date(
                  `${matchingTenancies[0].ends_on}T12:00:00`,
                ).toLocaleDateString("pt-BR")}
              </small>
            </div>
          ) : (
            <div className="linked-tenancy-summary missing">
              <strong>Ainda não criada</strong>
              <small>Crie a locação para liberar o contrato.</small>
            </div>
          )}
        </label>
        <label>
          <span>Modelo</span>
          <select
            value={templateId}
            onChange={(event) => selectTemplate(event.target.value)}
          >
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.is_default ? " (padrão)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tenantId && propertyId && !tenancyId && (
        <div className="notice warning contract-link-warning">
          <strong>Falta apenas criar a locação.</strong>
          <span>
            O contrato usa a locação para definir período, aluguel, vencimento e
            parcelas.
          </span>
          <a className="secondary-button" href="#nova-locacao">
            Ir para criação da locação
          </a>
        </div>
      )}
      <div className="contract-editor-layout">
        <aside className="contract-editor-sidepanel">
          <div className="contract-editor-summary">
            <span className="eyebrow">Contrato em preparação</span>
            <h3>{selectedTenant?.full_name || "Escolha o inquilino"}</h3>
            <p>{selectedProperty?.title || "Escolha o imóvel"}</p>
            <dl>
              <div>
                <dt>Vínculo</dt>
                <dd>{tenancyId ? "Locação pronta" : "Pendente"}</dd>
              </div>
              <div>
                <dt>Modelo</dt>
                <dd>{modelName}</dd>
              </div>
              <div>
                <dt>Cláusulas</dt>
                <dd>{sections.length}</dd>
              </div>
            </dl>
          </div>
          <nav className="contract-stepper" aria-label="Etapas do contrato">
            {(
              [
                ["data", "1", "Dados"],
                ["clauses", "2", "Cláusulas"],
                ["review", "3", "Revisão"],
              ] as Array<[Step, string, string]>
            ).map(([id, number, label]) => (
              <button
                key={id}
                type="button"
                className={step === id ? "active" : ""}
                onClick={() => setStep(id)}
              >
                <span>{number}</span>
                <strong>{label}</strong>
              </button>
            ))}
          </nav>
        </aside>
        <main className="contract-editor-main">
          {step === "data" && (
            <div className="contract-step-content">
              <section className="contract-model-card">
                <div>
                  <h3>Identificação do modelo</h3>
                  <p>
                    Este nome aparece apenas para organização administrativa.
                  </p>
                </div>
                <div className="contract-model-grid">
                  <label>
                    Nome do modelo
                    <input
                      value={modelName}
                      onChange={(event) => setModelName(event.target.value)}
                    />
                  </label>
                  <label>
                    Descrição
                    <textarea
                      rows={2}
                      value={modelDescription}
                      onChange={(event) =>
                        setModelDescription(event.target.value)
                      }
                    />
                  </label>
                  <label className="wide-field">
                    Título no PDF
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                </div>
              </section>
              {fieldGroups.map((group) => (
                <section className="contract-field-group" key={group.title}>
                  <header>
                    <div>
                      <h3>{group.title}</h3>
                      <p>{group.description}</p>
                    </div>
                    <span>{group.fields.length} campos</span>
                  </header>
                  <div className="contract-field-grid">
                    {group.fields.map(([key, label, type]) => (
                      <label key={key}>
                        {label}
                        <input
                          type={type}
                          value={fields[key] ?? ""}
                          onChange={(event) =>
                            setFields((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              <div className="contract-step-navigation">
                <span />
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setStep("clauses")}
                >
                  Continuar para cláusulas
                </button>
              </div>
            </div>
          )}

          {step === "clauses" && (
            <div className="contract-step-content">
              <div className="contract-help-card">
                <strong>Campos automáticos</strong>
                <p>
                  Use variáveis como {"{{tenant_name}}"},{" "}
                  {"{{property_address}}"} e {"{{monthly_rent}}"}. Elas serão
                  substituídas pelos dados revisados.
                </p>
              </div>
              <div className="contract-sections">
                {sections.map((section, index) => (
                  <article key={index}>
                    <div className="contract-section-number">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="contract-section-editor">
                      <div className="contract-section-heading">
                        <strong>Cláusula {index + 1}</strong>
                        <button
                          type="button"
                          onClick={() =>
                            setSections((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          Remover
                        </button>
                      </div>
                      <input
                        aria-label={`Título da cláusula ${index + 1}`}
                        value={section.title}
                        onChange={(event) =>
                          updateSection(index, "title", event.target.value)
                        }
                      />
                      <textarea
                        aria-label={`Texto da cláusula ${index + 1}`}
                        rows={5}
                        value={section.body}
                        onChange={(event) =>
                          updateSection(index, "body", event.target.value)
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>
              <button
                className="secondary-button add-clause-button"
                type="button"
                onClick={() =>
                  setSections((current) => [
                    ...current,
                    {
                      title: `${current.length + 1}. NOVA CLÁUSULA`,
                      body: "Digite o texto desta cláusula.",
                    },
                  ])
                }
              >
                + Adicionar cláusula
              </button>
              <div className="contract-step-navigation">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setStep("data")}
                >
                  Voltar aos dados
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setStep("review")}
                >
                  Revisar contrato
                </button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="contract-review-layout">
              <section className="contract-review-document">
                <div className="document-sheet">
                  <div className="document-sheet-brand">
                    IMOBILIÁRIA OLIVEIRA
                  </div>
                  <span className="eyebrow">Resumo antes da emissão</span>
                  <h3>{title}</h3>
                  <dl>
                    <div>
                      <dt>Inquilino</dt>
                      <dd>{fields.tenant_name || "Não informado"}</dd>
                    </div>
                    <div>
                      <dt>Imóvel</dt>
                      <dd>{fields.property_title || "Não informado"}</dd>
                    </div>
                    <div>
                      <dt>Vigência</dt>
                      <dd>
                        {fields.starts_on} a {fields.ends_on}
                      </dd>
                    </div>
                    <div>
                      <dt>Aluguel</dt>
                      <dd>
                        R$ {fields.monthly_rent} - dia {fields.due_day}
                      </dd>
                    </div>
                    <div>
                      <dt>Modelo</dt>
                      <dd>{modelName}</dd>
                    </div>
                    <div>
                      <dt>Conteúdo</dt>
                      <dd>{sections.length} cláusulas</dd>
                    </div>
                  </dl>
                  <div className="document-sheet-footer">
                    A versão emitida será congelada e receberá hash SHA-256.
                  </div>
                </div>
              </section>
              <aside className="contract-review-actions">
                <span className="eyebrow">Pronto para conferir</span>
                <h3>Visualize antes de enviar</h3>
                <p>
                  O PDF de pré-visualização é privado e mostra o documento
                  exatamente como será recebido pelo inquilino.
                </p>
                <button
                  className="primary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void preview()}
                >
                  {busy ? "Gerando..." : "Visualizar PDF"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void saveModel(false)}
                >
                  Salvar alterações no modelo
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void saveModel(true)}
                >
                  Salvar como novo modelo
                </button>
                <hr />
                <div className="contract-recipient">
                  <span>Será enviado para</span>
                  <strong>
                    {selectedTenant?.email ??
                      fields.tenant_email ??
                      "Selecione uma locação"}
                  </strong>
                </div>
                <button
                  className="send-contract-button"
                  type="button"
                  disabled={busy || !tenancyId}
                  onClick={() => void issue()}
                >
                  Salvar e enviar para assinatura
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setStep("clauses")}
                >
                  Voltar e editar cláusulas
                </button>
              </aside>
            </div>
          )}
        </main>
      </div>
      {previewUrl && (
        <PdfViewerModal
          url={previewUrl}
          title="Pré-visualização do contrato"
          subtitle={`${fields.tenant_name} - ${fields.property_title}`}
          fileName="contrato-pre-visualizacao.pdf"
          onClose={() => setPreviewUrl("")}
        />
      )}
    </section>
  );
}
