import { useState, type FormEvent } from "react";
import { downloadPrivateFile } from "../lib/download";
import { invokeSecure } from "../lib/supabase";
import type {
  Contract,
  ContractTemplate,
  OliveiraSettings,
  Profile,
  Property,
  Tenancy,
} from "../lib/types";
import { ContractEditor } from "./ContractEditor";
import { PdfViewerModal } from "./PdfViewerModal";
import { TenancyCreateForm } from "./TenancyCreateForm";

type ContractsPanelProps = {
  busy: boolean;
  tenants: Profile[];
  properties: Property[];
  tenancies: Tenancy[];
  contracts: Contract[];
  templates: ContractTemplate[];
  settings: OliveiraSettings | null;
  onCreateTenancy: (event: FormEvent<HTMLFormElement>) => void;
  onReload: () => Promise<void>;
};

const contractStatus = {
  draft: "Rascunho",
  pending_signature: "Aguardando assinatura",
  signed: "Assinado",
  cancelled: "Cancelado",
} as Record<string, string>;

export function ContractsPanel({
  busy,
  tenants,
  properties,
  tenancies,
  contracts,
  templates,
  settings,
  onCreateTenancy,
  onReload,
}: ContractsPanelProps) {
  const [documentUrl, setDocumentUrl] = useState("");
  const [selectedContract, setSelectedContract] = useState<Contract | null>(
    null,
  );
  const [documentBusy, setDocumentBusy] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const activeContracts = contracts.filter(
    (item) => item.status !== "cancelled",
  );
  const pending = activeContracts.filter(
    (item) => item.status === "pending_signature",
  ).length;
  const signed = activeContracts.filter(
    (item) => item.status === "signed",
  ).length;
  const getDocumentUrl = async (contract: Contract) => {
    const result = await invokeSecure<{ url: string }>(
      "oliveira-contract-download",
      { contract_id: contract.id },
    );
    if (!result?.url) throw new Error("Link do contrato não retornado.");
    return result.url;
  };
  const openDocument = async (contract: Contract) => {
    setDocumentBusy(contract.id);
    setDocumentMessage("");
    try {
      setSelectedContract(contract);
      setDocumentUrl(await getDocumentUrl(contract));
    } catch (error) {
      setDocumentMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o contrato.",
      );
    } finally {
      setDocumentBusy("");
    }
  };
  const downloadDocument = async (contract: Contract) => {
    setDocumentBusy(contract.id);
    setDocumentMessage("");
    try {
      await downloadPrivateFile(
        await getDocumentUrl(contract),
        `contrato-imobiliaria-oliveira-v${contract.version}.pdf`,
      );
      setDocumentMessage("Cópia do contrato baixada com sucesso.");
    } catch (error) {
      setDocumentMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível baixar o contrato.",
      );
    } finally {
      setDocumentBusy("");
    }
  };
  return (
    <div className="contracts-page">
      <section className="contracts-hero">
        <div>
          <span className="eyebrow">Gestão documental</span>
          <h2>Contratos de locação</h2>
          <p>
            Crie a locação, personalize o documento, confira o PDF e acompanhe a
            assinatura em um único lugar.
          </p>
        </div>
        <div className="contracts-hero-stats">
          <div>
            <span>Locações</span>
            <strong>{tenancies.length}</strong>
          </div>
          <div>
            <span>Aguardando</span>
            <strong>{pending}</strong>
          </div>
          <div>
            <span>Assinados</span>
            <strong>{signed}</strong>
          </div>
        </div>
      </section>
      <div className="contracts-setup-grid">
        <TenancyCreateForm
          tenants={tenants}
          properties={properties}
          busy={busy}
          onSubmit={onCreateTenancy}
          title="Criar locação para o contrato"
          description="Se o vínculo ainda não existir, crie-o aqui e siga para o editor logo abaixo."
          submitLabel="Criar locação e continuar"
        />
        <section className="dashboard-card contract-list-panel">
          <div className="card-heading">
            <div>
              <h3>Locações e documentos</h3>
              <p>Últimos contratos vinculados.</p>
            </div>
            <span className="soft-badge">{tenancies.length} registros</span>
          </div>
          {documentMessage && (
            <div className="notice" role="status">
              {documentMessage}
            </div>
          )}
          <div className="contract-record-list">
            {tenancies.slice(0, 6).map((tenancy) => {
              const contract = contracts.find(
                (item) =>
                  item.tenancy_id === tenancy.id && item.status !== "cancelled",
              );
              const tenant = tenants.find(
                (item) => item.id === tenancy.tenant_id,
              );
              return (
                <article key={tenancy.id}>
                  <div className="record-icon" aria-hidden="true">
                    DOC
                  </div>
                  <div>
                    <strong>{tenancy.property?.title ?? "Imóvel"}</strong>
                    <span>{tenant?.full_name ?? "Inquilino"}</span>
                    <small>
                      {new Date(
                        `${tenancy.starts_on}T12:00:00`,
                      ).toLocaleDateString("pt-BR")}{" "}
                      a{" "}
                      {new Date(
                        `${tenancy.ends_on}T12:00:00`,
                      ).toLocaleDateString("pt-BR")}
                    </small>
                  </div>
                  <div className="record-document-actions">
                    <span className={`status ${contract?.status ?? "draft"}`}>
                      {contract
                        ? contractStatus[contract.status]
                        : "Não emitido"}
                    </span>
                    {contract && (
                      <div>
                        <button
                          type="button"
                          disabled={Boolean(documentBusy)}
                          onClick={() => void openDocument(contract)}
                        >
                          Visualizar
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(documentBusy)}
                          onClick={() => void downloadDocument(contract)}
                        >
                          {documentBusy === contract.id
                            ? "Aguarde..."
                            : "Baixar cópia"}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {tenancies.length === 0 && (
            <div className="empty-contract-list">
              <strong>Nenhuma locação criada</strong>
              <span>Use o formulário ao lado para começar.</span>
            </div>
          )}
        </section>
      </div>
      {templates.length > 0 && settings ? (
        <ContractEditor
          key={tenancies.map((item) => item.id).join(":")}
          tenancies={tenancies}
          tenants={tenants}
          properties={properties}
          templates={templates}
          settings={settings}
          onReload={onReload}
        />
      ) : (
        <section className="dashboard-card">
          <p>Carregando o modelo contratual...</p>
        </section>
      )}
      {documentUrl && selectedContract && (
        <PdfViewerModal
          url={documentUrl}
          title={
            selectedContract.status === "signed"
              ? "Contrato assinado"
              : "Contrato emitido"
          }
          subtitle={`Versão ${selectedContract.version}`}
          fileName={`contrato-imobiliaria-oliveira-v${selectedContract.version}.pdf`}
          onClose={() => {
            setDocumentUrl("");
            setSelectedContract(null);
          }}
        />
      )}
    </div>
  );
}
