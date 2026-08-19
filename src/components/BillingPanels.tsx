import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { invokeSecure } from "../lib/supabase";
import type {
  AsaasIntegration,
  AsaasWebhookEvent,
  BillingAgreement,
  BillingCharge,
  BillingOperation,
  Contract,
  Installment,
  Tenancy,
} from "../lib/types";

type BillingFlags = {
  billingEnabled: boolean;
  automaticCreationEnabled: boolean;
  billingStartedAt: string | null;
};

type TenantBillingStatus = {
  flags: BillingFlags;
  agreements: BillingAgreement[];
  charges: BillingCharge[];
};

type BillingSettings = {
  billing_enabled: boolean;
  automatic_creation_enabled: boolean;
  billing_started_at: string | null;
};

type ReconciliationRun = {
  id: string;
  status: "running" | "completed" | "failed";
  inspected_count: number;
  repaired_count: number;
  divergence_count: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type AdminBillingOverview = {
  settings: BillingSettings;
  integration: AsaasIntegration;
  agreements: BillingAgreement[];
  charges: BillingCharge[];
  operations: BillingOperation[];
  webhook_events: AsaasWebhookEvent[];
  reconciliation_runs: ReconciliationRun[];
};

type BillingActionResult = {
  status?: string;
  agreement_id?: string;
  charge_id?: string;
  qr_payload?: string | null;
  expires_at?: string | null;
  invoice_url?: string | null;
  checkout_url?: string | null;
  reused?: boolean;
};

const billingStatusLabels: Record<string, string> = {
  setup_pending: "Configuração iniciada",
  awaiting_authorization: "Aguardando autorização",
  active: "Ativo",
  fallback_required: "Alternativa necessária",
  cancelled: "Cancelado",
  expired: "Expirado",
  failed: "Falhou",
  draft: "Rascunho",
  creating: "Criando",
  pending: "Aguardando pagamento",
  scheduled: "Agendado",
  confirmed: "Confirmado",
  received: "Recebido",
  overdue: "Vencido",
  refused: "Recusado",
  refunded: "Estornado",
  chargeback: "Contestação",
  manual_review: "Revisão manual",
  processed: "Processado",
  ignored: "Ignorado",
  processing: "Processando",
};

const methodLabels: Record<string, string> = {
  pix_automatic: "Pix Automático",
  credit_card_subscription: "Cartão recorrente",
  credit_card: "Cartão recorrente",
  pix: "Pix",
  manual: "Manual",
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const date = (value: string | null | undefined) =>
  value ? new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`).toLocaleDateString("pt-BR") : "—";

function BillingState({ status }: { status: string }) {
  return <span className={`status billing-state-${status}`}>{billingStatusLabels[status] ?? status}</span>;
}

export function TenantBillingPanel({
  tenancy,
  contract,
  installments,
}: {
  tenancy: Tenancy | null;
  contract: Contract | null;
  installments: Installment[];
}) {
  const [status, setStatus] = useState<TenantBillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<BillingActionResult | null>(null);
  const [selectedInstallment, setSelectedInstallment] = useState("");
  const tenancyId = tenancy?.id ?? "";

  const load = useCallback(async () => {
    if (!tenancyId) {
      setStatus(null);
      return;
    }
    const next = await invokeSecure<TenantBillingStatus>("oliveira-asaas-start", {
      action: "get_status",
      tenancy_id: tenancyId,
    });
    setStatus(next ?? null);
  }, [tenancyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) =>
        setMessage(error instanceof Error ? error.message : "Não foi possível consultar as cobranças."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openInstallments = useMemo(
    () => installments.filter((item) => ["upcoming", "pending", "late"].includes(item.status)),
    [installments],
  );

  const submit = async (event: FormEvent<HTMLFormElement>, action: string) => {
    event.preventDefault();
    if (!tenancy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const response = await invokeSecure<BillingActionResult>("oliveira-asaas-start", {
        action,
        tenancy_id: tenancy.id,
        installment_id: form.get("installment_id") || undefined,
        cpf_cnpj: form.get("cpf_cnpj") || undefined,
        consent: form.get("consent") === "on",
      });
      const next = response ?? {};
      setResult(next);
      setMessage(
        action === "start_card_subscription"
          ? "Checkout criado. A adesão só será ativa após a confirmação do provedor."
          : action === "start_pix_automatic"
            ? "Solicitação criada. Autorize o Pix; isso ainda não significa pagamento."
            : "Pix criado. A parcela só será baixada após a confirmação financeira do provedor.",
      );
      const externalUrl = next.checkout_url ?? next.invoice_url;
      if (externalUrl) window.open(externalUrl, "_blank", "noopener,noreferrer");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  };

  const copyPix = async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload);
      setMessage("Código Pix copiado.");
    } catch {
      setMessage("Não foi possível copiar automaticamente. Selecione o código e copie.");
    }
  };

  if (!tenancy) return null;
  const billingEnabled = status?.flags.billingEnabled === true;
  const automaticEnabled = status?.flags.automaticCreationEnabled === true;
  const activeAgreement = status?.agreements.find((item) =>
    ["setup_pending", "awaiting_authorization", "active"].includes(item.status),
  );

  return (
    <section className="dashboard-card billing-panel" aria-labelledby="tenant-billing-title">
      <div className="card-heading billing-panel-heading">
        <div>
          <span className="eyebrow">Cobrança segura</span>
          <h2 id="tenant-billing-title">Formas de pagamento online</h2>
          <p>Disponíveis somente após configuração, elegibilidade e sua adesão expressa.</p>
        </div>
        <span className={`billing-gate ${billingEnabled ? "ready" : "off"}`}>
          {billingEnabled ? "Disponível" : "Em validação"}
        </span>
      </div>

      {message && <div className="notice" role="status" aria-live="polite">{message}</div>}

      {!billingEnabled ? (
        <div className="billing-disabled-state">
          <strong>A cobrança automática ainda está desligada.</strong>
          <p>Continue usando as instruções externas e o envio de comprovante. Nenhuma cobrança foi criada para a sua locação.</p>
        </div>
      ) : (
        <>
          {activeAgreement && (
            <div className="billing-agreement-summary">
              <div>
                <small>Adesão atual</small>
                <strong>{methodLabels[activeAgreement.method]}</strong>
                <span>Registrada em {date(activeAgreement.consent_at)}</span>
              </div>
              <BillingState status={activeAgreement.status} />
            </div>
          )}

          {!activeAgreement && contract?.status === "signed" && (
            <div className="billing-choice-grid">
              <form onSubmit={(event) => void submit(event, "start_pix_automatic")}>
                <span className="billing-choice-number">01</span>
                <h3>Pix Automático</h3>
                <p>Autorize uma vez. O sistema agenda apenas parcelas futuras elegíveis, sem cobrança retroativa.</p>
                <label>
                  CPF do titular
                  <input name="cpf_cnpj" inputMode="numeric" autoComplete="off" pattern="[0-9.\-]{11,14}" required />
                  <small>Enviado transitoriamente ao Asaas; o CPF completo não fica salvo aqui.</small>
                </label>
                <label className="check-label billing-consent">
                  <input name="consent" type="checkbox" required />
                  <span>Autorizo iniciar a adesão ao Pix Automático para parcelas futuras desta locação.</span>
                </label>
                <button className="primary-button" disabled={busy || !automaticEnabled}>
                  Iniciar adesão ao Pix Automático
                </button>
                {!automaticEnabled && <small className="billing-limit">Aguardando liberação administrativa.</small>}
              </form>

              <form onSubmit={(event) => void submit(event, "start_card_subscription")}>
                <span className="billing-choice-number">02</span>
                <h3>Cartão recorrente</h3>
                <p>O preenchimento do cartão acontece no checkout hospedado do Asaas, fora deste aplicativo.</p>
                <label className="check-label billing-consent">
                  <input name="consent" type="checkbox" required />
                  <span>Autorizo iniciar a adesão recorrente para parcelas futuras desta locação.</span>
                </label>
                <button className="secondary-button" disabled={busy || !automaticEnabled}>
                  Abrir checkout seguro
                </button>
                {!automaticEnabled && <small className="billing-limit">Aguardando liberação administrativa.</small>}
              </form>
            </div>
          )}

          {contract?.status !== "signed" && (
            <div className="notice warning">A adesão recorrente será liberada depois da assinatura do contrato.</div>
          )}

          <form className="billing-pix-fallback" onSubmit={(event) => void submit(event, "create_regular_pix")}>
            <div>
              <span className="eyebrow">Alternativa e contingência</span>
              <h3>Gerar Pix para uma parcela</h3>
              <p>Use quando o Pix Automático não estiver disponível. A confirmação vem exclusivamente pelo webhook financeiro.</p>
            </div>
            <label>
              Parcela
              <select
                name="installment_id"
                value={selectedInstallment || openInstallments[0]?.id || ""}
                onChange={(event) => setSelectedInstallment(event.target.value)}
                required
              >
                <option value="">Selecione</option>
                {openInstallments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.reference_month} • venc. {date(item.due_date)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              CPF do titular
              <input name="cpf_cnpj" inputMode="numeric" autoComplete="off" pattern="[0-9.\-]{11,14}" required />
            </label>
            <label className="check-label billing-consent">
              <input name="consent" type="checkbox" required />
              <span>Confirmo a criação deste Pix para a parcela selecionada.</span>
            </label>
            <button className="secondary-button" disabled={busy || !openInstallments.length}>Gerar Pix</button>
          </form>
        </>
      )}

      {result?.qr_payload && (
        <div className="billing-pix-result">
          <div>
            <strong>Pix copia e cola</strong>
            <small>Autorizar ou copiar não significa que a parcela foi paga.</small>
          </div>
          <textarea readOnly value={result.qr_payload} aria-label="Código Pix copia e cola" rows={3} />
          <button type="button" className="secondary-button" onClick={() => void copyPix(result.qr_payload ?? "")}>Copiar código</button>
        </div>
      )}

      {!!status?.charges.length && (
        <div className="billing-history">
          <h3>Histórico de cobranças</h3>
          {status.charges.slice(0, 8).map((charge) => (
            <article key={charge.id}>
              <div>
                <strong>{charge.kind === "late_adjustment" ? "Multa e juros autorizados" : "Aluguel"}</strong>
                <span>{methodLabels[charge.method]} • {money(charge.amount)} • venc. {date(charge.due_date)}</span>
              </div>
              <BillingState status={charge.status} />
              {charge.invoice_url && !["confirmed", "received"].includes(charge.status) && (
                <a href={charge.invoice_url} target="_blank" rel="noreferrer">Abrir no Asaas</a>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="billing-boundary">
        Multa e juros são tratados separadamente e só aparecem após autorização explícita. Retorno do navegador, checkout criado, QR Code ou autorização Pix não confirmam pagamento.
      </p>
    </section>
  );
}

export function AdminBillingPanel() {
  const [overview, setOverview] = useState<AdminBillingOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const next = await invokeSecure<AdminBillingOverview>("oliveira-asaas-admin", {
      action: "get_overview",
      limit: 100,
    });
    setOverview(next ?? null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) =>
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar a integração."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  };

  const configureWebhook = () => run(
    () => invokeSecure("oliveira-asaas-configure-webhook", {}),
    "Conta e webhook validados. As cobranças continuam desligadas até a ativação explícita.",
  );

  const reconcile = () => run(
    () => invokeSecure("oliveira-asaas-reconcile", { limit: 100 }),
    "Conciliação concluída. Revise as divergências antes de ativar ou baixar parcelas.",
  );

  const setFlags = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const billingEnabled = form.get("billing_enabled") === "on";
    const automaticEnabled = form.get("automatic_creation_enabled") === "on";
    if (billingEnabled && !overview?.settings.billing_enabled) {
      const confirmation = window.prompt(
        "Para confirmar que os gates operacionais foram validados, digite ATIVAR:",
        "",
      );
      if (confirmation !== "ATIVAR") {
        setMessage("Ativação cancelada.");
        return;
      }
    }
    await run(
      () => invokeSecure("oliveira-asaas-admin", {
        action: "set_flags",
        billing_enabled: billingEnabled,
        automatic_creation_enabled: automaticEnabled,
      }),
      billingEnabled
        ? "Configuração salva. Apenas novas adesões consentidas podem gerar cobranças."
        : "Cobranças online desligadas.",
    );
  };

  const integration = overview?.integration;
  const settings = overview?.settings;
  const needsReview = overview?.charges.filter((item) => item.status === "manual_review").length ?? 0;
  const failedEvents = overview?.webhook_events.filter((item) => item.status === "failed").length ?? 0;

  return (
    <section className="dashboard-card billing-admin-panel" aria-labelledby="admin-billing-title">
      <div className="card-heading billing-panel-heading">
        <div>
          <span className="eyebrow">Integração dedicada Oliveira</span>
          <h2 id="admin-billing-title">Cobranças Asaas</h2>
          <p>Ativação em etapas, sem retroatividade e somente para locações com adesão do inquilino.</p>
        </div>
        <span className={`billing-gate ${settings?.billing_enabled ? "ready" : "off"}`}>
          {settings?.billing_enabled ? "Cobrança habilitada" : "Cobrança desligada"}
        </span>
      </div>

      {message && <div className="notice" role="status" aria-live="polite">{message}</div>}

      <div className="billing-admin-metrics">
        <article>
          <span>Ambiente</span>
          <strong>{integration?.environment === "production" ? "Produção" : integration?.environment === "sandbox" ? "Sandbox" : "Não configurado"}</strong>
          <small>{integration?.account_id ? "Conta validada" : "Conta pendente"}</small>
        </article>
        <article>
          <span>Webhook</span>
          <strong>{integration?.webhook_configured_at ? "Configurado" : "Pendente"}</strong>
          <small>{integration?.last_webhook_at ? `Último evento ${date(integration.last_webhook_at)}` : "Sem evento recebido"}</small>
        </article>
        <article>
          <span>Revisão manual</span>
          <strong>{needsReview}</strong>
          <small>{failedEvents} eventos com falha</small>
        </article>
        <article>
          <span>Adesões ativas</span>
          <strong>{overview?.agreements.filter((item) => item.status === "active").length ?? 0}</strong>
          <small>Consentimento individual preservado</small>
        </article>
      </div>

      <div className="billing-admin-controls">
        <div>
          <h3>1. Validar conta e webhook</h3>
          <p>Confere a conta Oliveira e registra um webhook exclusivo. Esta etapa não cria cobranças.</p>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void configureWebhook()}>
            Validar integração
          </button>
        </div>
        <div>
          <h3>2. Conciliar estados</h3>
          <p>Compara cobranças e adesões locais com o provedor, sem assentar pagamento ausente de evento confirmado.</p>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void reconcile()}>
            Executar conciliação
          </button>
        </div>
        <form onSubmit={(event) => void setFlags(event)}>
          <h3>3. Ativação controlada</h3>
          <label className="check-label">
            <input name="billing_enabled" type="checkbox" defaultChecked={settings?.billing_enabled} key={`billing-${settings?.billing_enabled}`} />
            <span>Permitir criação manual de Pix e novas adesões</span>
          </label>
          <label className="check-label">
            <input name="automatic_creation_enabled" type="checkbox" defaultChecked={settings?.automatic_creation_enabled} key={`automatic-${settings?.automatic_creation_enabled}`} />
            <span>Permitir que o agendador crie parcelas futuras de adesões ativas</span>
          </label>
          <button className="primary-button" disabled={busy}>Salvar ativação</button>
        </form>
      </div>

      {!!overview?.charges.length && (
        <div className="billing-admin-list">
          <div className="card-heading">
            <div>
              <h3>Cobranças recentes</h3>
              <p>Estados financeiros normalizados; retorno de checkout não aparece como pagamento.</p>
            </div>
          </div>
          {overview.charges.slice(0, 12).map((charge) => (
            <article key={charge.id}>
              <div>
                <strong>{charge.kind === "late_adjustment" ? "Encargo separado" : "Aluguel"}</strong>
                <span>{methodLabels[charge.method]} • {money(charge.amount)} • {date(charge.due_date)}</span>
              </div>
              <BillingState status={charge.status} />
              <small>{charge.provider_status ?? "Sem estado do provedor"}</small>
            </article>
          ))}
        </div>
      )}

      <div className="billing-admin-footnote">
        <strong>Gate de produção</strong>
        <span>Webhook configurado, e-mails entregues, cobrança controlada e eventual cancelamento precisam ser validados antes de habilitar a criação automática.</span>
      </div>
    </section>
  );
}
