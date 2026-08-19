import { Link } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { usePageMeta } from "../lib/pageMeta";
import "./SystemSalesPage.css";
import ContactSection from "../components/ContactSection";

const featureGroups = [
  {
    number: "01",
    title: "Imóveis e divulgação",
    text: "Cadastro completo, fotos ordenáveis, galeria pública, filtros, disponibilidade e histórico de cada imóvel.",
    tags: ["Galeria", "Filtros", "Disponibilidade"],
  },
  {
    number: "02",
    title: "Inquilinos e documentos",
    text: "Convite individual, área protegida, dados cadastrais, arquivos privados e aprovação documental antes da assinatura.",
    tags: ["Convites", "Perfis", "Documentos"],
  },
  {
    number: "03",
    title: "Locações organizadas",
    text: "Vínculo entre imóvel e inquilino, vigência, vencimento, multa, juros, garantia, parcelas e histórico operacional.",
    tags: ["Parcelas", "Regras", "Histórico"],
  },
  {
    number: "04",
    title: "Contratos digitais",
    text: "Modelos editáveis, PDF versionado, emissão, leitura privada e assinatura eletrônica interna com OTP e evidências técnicas.",
    tags: ["PDF", "Versões", "OTP interno"],
  },
  {
    number: "05",
    title: "Controle financeiro",
    text: "Pix Automático e cartão via Asaas conforme elegibilidade e adesão, com Pix comum e comprovante manual como contingência.",
    tags: ["Asaas", "Comprovantes", "Recibos"],
  },
  {
    number: "06",
    title: "Manutenções acordadas",
    text: "Solicitações, anexos, orientação do proprietário, limite autorizado e crédito aprovado aplicado à locação.",
    tags: ["Anexos", "Autorização", "Créditos"],
  },
  {
    number: "07",
    title: "E-mails e notificações",
    text: "Convites, emissão e assinatura de contrato, códigos, lembretes de vencimento, histórico de entrega e reenvio de falhas.",
    tags: ["Automação", "Status", "Reenvio"],
  },
  {
    number: "08",
    title: "Gestão e auditoria",
    text: "Central de pendências, múltiplos administradores, configurações da operação e registro pesquisável com exportação CSV.",
    tags: ["Painel", "Auditoria", "CSV"],
  },
];

const workflow = [
  ["Imóvel", "Cadastre condições, fotos e disponibilidade."],
  ["Inquilino", "Convide e revise a documentação necessária."],
  ["Locação", "Defina vigência, vencimentos e regras."],
  ["Contrato", "Emita, acompanhe e registre a assinatura interna."],
  ["Rotina", "Controle pagamentos, recibos, e-mails e manutenção."],
];

export function SystemSalesPage() {
  usePageMeta(
    "Sistema para gestão de locações | Imobiliária Oliveira",
    "Implantação sob orçamento para organizar imóveis, inquilinos, contratos, pagamentos registrados, manutenções e e-mails.",
  );

  return (
    <>
      <a className="system-skip-link" href="#conteudo-sistema">
        Ir para o conteúdo
      </a>
      <AppHeader />
      <main id="conteudo-sistema" className="system-page">
        <section className="system-hero" aria-labelledby="system-title">
          <div className="shell system-hero-grid">
            <div className="system-hero-copy">
              <span className="eyebrow light">
                Gestão imobiliária sob medida
              </span>
              <h1 id="system-title">
                Administre locações com menos planilhas e mais clareza.
              </h1>
              <p>
                Imóveis, inquilinos, contratos, pagamentos registrados,
                manutenções e e-mails automáticos em uma implantação dedicada à
                sua operação.
              </p>
              <div className="system-hero-actions">
                <a className="system-button primary" href="#orcamento">
                  Solicitar proposta
                </a>
                <a className="system-button ghost" href="#funcionalidades">
                  Explorar funcionalidades
                </a>
              </div>
              <small className="system-commercial-note">
                Implantação personalizada <span aria-hidden="true">•</span> Sob
                orçamento <span aria-hidden="true">•</span> Sem checkout nesta
                etapa
              </small>
            </div>

            <div
              className="system-dashboard-preview"
              aria-label="Prévia ilustrativa do painel administrativo"
            >
              <div className="system-preview-topbar">
                <div>
                  <span className="system-preview-logo">IO</span>
                  <strong>Painel administrativo</strong>
                </div>
                <span className="system-preview-seal">
                  Demonstração · dados fictícios
                </span>
              </div>
              <div className="system-preview-content">
                <div className="system-preview-heading">
                  <div>
                    <span>Visão da operação</span>
                    <strong>Bom dia, Gestor</strong>
                  </div>
                  <span className="system-preview-dot">Online</span>
                </div>
                <div className="system-preview-metrics">
                  <article>
                    <span>Locações ativas</span>
                    <strong>12</strong>
                  </article>
                  <article>
                    <span>Pagamentos a revisar</span>
                    <strong>03</strong>
                  </article>
                  <article>
                    <span>Contratos aguardando</span>
                    <strong>02</strong>
                  </article>
                  <article>
                    <span>Manutenções abertas</span>
                    <strong>01</strong>
                  </article>
                </div>
                <div className="system-preview-list">
                  <div>
                    <span className="system-preview-icon">PG</span>
                    <p>
                      <strong>Comprovante recebido</strong>
                      <small>Cliente A. · Imóvel 02</small>
                    </p>
                    <em>Agora</em>
                  </div>
                  <div>
                    <span className="system-preview-icon blue">CT</span>
                    <p>
                      <strong>Contrato disponível</strong>
                      <small>Cliente B. · versão 2</small>
                    </p>
                    <em>10:42</em>
                  </div>
                  <div>
                    <span className="system-preview-icon gold">MA</span>
                    <p>
                      <strong>Manutenção solicitada</strong>
                      <small>Imóvel 07 · análise</small>
                    </p>
                    <em>Ontem</em>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="system-trust-strip"
          aria-label="Características da implantação"
        >
          <div className="shell">
            <span>Implantação dedicada</span>
            <span>Acesso por perfil</span>
            <span>Histórico auditável</span>
            <span>Operação centralizada</span>
          </div>
        </section>

        <section
          className="shell system-workflow"
          aria-labelledby="workflow-title"
        >
          <div className="system-section-heading centered">
            <span className="eyebrow">Uma jornada conectada</span>
            <h2 id="workflow-title">Do imóvel à rotina mensal.</h2>
            <p>
              Cada etapa alimenta a próxima, reduzindo controles paralelos e
              deixando as pendências visíveis.
            </p>
          </div>
          <ol className="system-workflow-list">
            {workflow.map(([title, text], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{title}</strong>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="funcionalidades"
          className="system-feature-section"
          aria-labelledby="features-title"
        >
          <div className="shell">
            <div className="system-section-heading">
              <div>
                <span className="eyebrow">Visão completa</span>
                <h2 id="features-title">Tudo o que sustenta a locação.</h2>
              </div>
              <p>
                Recursos públicos, área do inquilino e gestão administrativa
                reunidos na mesma experiência.
              </p>
            </div>
            <div className="system-feature-grid">
              {featureGroups.map((feature) => (
                <article key={feature.number}>
                  <span className="system-feature-number">
                    {feature.number}
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                  <div className="system-feature-tags">
                    {feature.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="shell system-evidence"
          aria-labelledby="evidence-title"
        >
          <div className="system-section-heading centered">
            <span className="eyebrow">Controle visível</span>
            <h2 id="evidence-title">Pagamentos e e-mails com histórico.</h2>
            <p>
              As prévias abaixo são apenas ilustrativas. Nenhuma pessoa,
              cobrança ou entrega real é exibida.
            </p>
          </div>
          <div className="system-evidence-grid">
            <article className="system-demo-card">
              <header>
                <div>
                  <span>Financeiro</span>
                  <h3>Competências da locação</h3>
                </div>
                <strong>Dados fictícios</strong>
              </header>
              <div className="system-table-wrap">
                <table>
                  <caption className="sr-only">
                    Exemplo fictício de parcelas de aluguel
                  </caption>
                  <thead>
                    <tr>
                      <th>Competência</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Método fictício</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td data-label="Competência">AGO/2026</td>
                      <td data-label="Valor">R$ 1.850,00</td>
                      <td data-label="Status">
                        <span className="system-status paid">Pago</span>
                      </td>
                      <td data-label="Método fictício">
                        Pix Automático · recibo demo
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Competência">SET/2026</td>
                      <td data-label="Valor">R$ 1.850,00</td>
                      <td data-label="Status">
                        <span className="system-status review">Em análise</span>
                      </td>
                      <td data-label="Método fictício">
                        Pix comum · comprovante
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Competência">OUT/2026</td>
                      <td data-label="Valor">R$ 1.850,00</td>
                      <td data-label="Status">
                        <span className="system-status upcoming">A vencer</span>
                      </td>
                      <td data-label="Método fictício">
                        Cartão · autorização pendente
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="system-demo-disclaimer">
                A implantação pode ativar cobranças futuras por Pix Automático
                ou cartão após configuração, elegibilidade e adesão expressa. O
                comprovante manual permanece como contingência.
              </p>
            </article>

            <article className="system-demo-card email-demo">
              <header>
                <div>
                  <span>Comunicação</span>
                  <h3>Entregas automáticas</h3>
                </div>
                <strong>Dados fictícios</strong>
              </header>
              <div className="system-email-list">
                <div>
                  <span className="system-mail-mark">EM</span>
                  <p>
                    <strong>Lembrete de vencimento</strong>
                    <small>ma***@exemplo.com · 08:00</small>
                  </p>
                  <span className="system-status paid">Entregue</span>
                </div>
                <div>
                  <span className="system-mail-mark">EM</span>
                  <p>
                    <strong>Contrato disponível</strong>
                    <small>jo***@exemplo.com · 10:42</small>
                  </p>
                  <span className="system-status paid">Entregue</span>
                </div>
                <div>
                  <span className="system-mail-mark">EM</span>
                  <p>
                    <strong>Confirmação de assinatura</strong>
                    <small>an***@exemplo.com · 11:16</small>
                  </p>
                  <span className="system-status failed">
                    Falhou · reenviar
                  </span>
                </div>
              </div>
              <p className="system-demo-disclaimer">
                O painel registra tentativas e permite repetir entregas com
                falha. O envio depende de remetente e provedor configurados.
              </p>
            </article>
          </div>
        </section>

        <section className="system-boundary" aria-labelledby="boundary-title">
          <div className="shell system-boundary-grid">
            <div>
              <span className="eyebrow light">Transparência operacional</span>
              <h2 id="boundary-title">
                Tecnologia com limites bem explicados.
              </h2>
            </div>
            <div className="system-boundary-items">
              <article>
                <span>Pagamento</span>
                <p>
                  A cobrança Asaas só é ativada para competências futuras,
                  depois de configuração, elegibilidade e consentimento. Nunca é
                  retroativa; encargos são lançados separadamente.
                </p>
              </article>
              <article>
                <span>Assinatura</span>
                <p>
                  A confirmação eletrônica é interna, com OTP, hash e
                  evidências. Não é certificado ICP-Brasil.
                </p>
              </article>
              <article>
                <span>Contrato</span>
                <p>
                  Modelos e regras devem ser revisados juridicamente antes do
                  uso em uma locação real.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          className="shell system-implementation"
          aria-labelledby="implementation-title"
        >
          <div className="system-section-heading">
            <div>
              <span className="eyebrow">Projeto dedicado</span>
              <h2 id="implementation-title">
                Uma implantação para a sua operação.
              </h2>
            </div>
            <p>
              O valor depende do volume, das regras e das integrações que
              realmente fizerem sentido para o negócio.
            </p>
          </div>
          <div className="system-implementation-grid">
            <article>
              <span>1</span>
              <h3>Diagnóstico</h3>
              <p>
                Mapeamos imóveis, rotina, perfis, documentos e pontos de
                controle.
              </p>
            </article>
            <article>
              <span>2</span>
              <h3>Configuração</h3>
              <p>
                Ajustamos identidade, domínio, regras contratuais, comunicação e
                acessos.
              </p>
            </article>
            <article>
              <span>3</span>
              <h3>Entrega acompanhada</h3>
              <p>
                O escopo e o valor são apresentados antes do início da
                implantação.
              </p>
            </article>
          </div>
        </section>

        <section className="system-faq" aria-labelledby="faq-title">
          <div className="shell system-faq-grid">
            <div>
              <span className="eyebrow">Perguntas frequentes</span>
              <h2 id="faq-title">Antes de pedir uma proposta.</h2>
            </div>
            <div>
              <details>
                <summary>Existe um preço único?</summary>
                <p>
                  Não. A implantação é sob orçamento, considerando volume de
                  imóveis, personalizações e integrações.
                </p>
              </details>
              <details>
                <summary>O sistema pode cobrar o aluguel?</summary>
                <p>
                  A implantação pode ativar Pix Automático e cartão via Asaas
                  após elegibilidade, configuração e consentimento. A ativação
                  nunca é retroativa, encargos ficam separados e Pix comum com
                  comprovante manual continua disponível como contingência.
                </p>
              </details>
              <details>
                <summary>A assinatura vale como ICP-Brasil?</summary>
                <p>
                  Não. O recurso atual é uma assinatura eletrônica interna com
                  confirmação por código e evidências técnicas.
                </p>
              </details>
              <details>
                <summary>Os e-mails são automáticos?</summary>
                <p>
                  Sim, quando o remetente e o provedor estão configurados. O
                  painel acompanha status, tentativas e falhas.
                </p>
              </details>
            </div>
          </div>
        </section>

        <ContactSection />
      </main>
      <footer className="site-footer system-footer">
        <div className="shell">
          <strong>Imobiliária Oliveira</strong>
          <span>Sistema sob orçamento</span>
          <Link to="/privacidade">Privacidade</Link>
          <span>© 2026 Denis Oliveira</span>
        </div>
      </footer>
    </>
  );
}
