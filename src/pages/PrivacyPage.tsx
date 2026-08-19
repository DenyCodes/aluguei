import { Link } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { usePageMeta } from "../lib/pageMeta";
import "./SystemSalesPage.css";

export function PrivacyPage() {
  usePageMeta(
    "Privacidade | Imobiliária Oliveira",
    "Como a Imobiliária Oliveira trata os dados enviados no pedido de proposta do sistema.",
  );
  return (
    <>
      <AppHeader />
      <main className="privacy-page">
        <div className="shell privacy-shell">
          <Link className="privacy-back" to="/sistema#orcamento">← Voltar ao sistema</Link>
          <span className="eyebrow">Aviso de privacidade</span>
          <h1>Seus dados no pedido de proposta.</h1>
          <p className="privacy-intro">
            Este aviso explica o tratamento do nome, e-mail e telefone enviados
            voluntariamente na página comercial do sistema.
          </p>
          <div className="privacy-grid">
            <section><h2>Dados coletados</h2><p>Nome, e-mail, telefone, data do consentimento, origem da página e, quando presentes, parâmetros UTM da campanha.</p></section>
            <section><h2>Prevenção de abuso</h2><p>Usamos um identificador técnico temporário derivado por HMAC para limitar envios automatizados. O endereço IP bruto não é armazenado no cadastro do lead.</p></section>
            <section><h2>Finalidade</h2><p>Responder ao pedido, entender a necessidade, preparar uma proposta sob orçamento e manter o histórico do atendimento comercial solicitado.</p></section>
            <section><h2>Quem acessa</h2><p>Administradores autorizados da Imobiliária Oliveira. Supabase hospeda o registro e Resend processa a confirmação transacional por e-mail.</p></section>
            <section><h2>Comunicação</h2><p>A confirmação não inscreve você em newsletter nem autoriza campanhas recorrentes. Novos usos exigem informação compatível e base adequada.</p></section>
            <section><h2>Conservação e direitos</h2><p>Leads não convertidos são conservados por até 24 meses após o último contato, salvo obrigação legal que exija prazo diferente. Se houver contratação, os dados passam a seguir os prazos da documentação contratual, fiscal e demais obrigações aplicáveis. Você pode pedir acesso, correção ou exclusão quando cabível.</p></section>
          </div>
          <section className="privacy-contact">
            <h2>Contato sobre privacidade</h2>
            <p>Para solicitar acesso, correção ou exclusão, escreva para <a href="mailto:playtecno@outlook.com.br?subject=Privacidade%20-%20pedido%20comercial">playtecno@outlook.com.br</a>, informando o e-mail usado no formulário para validação do pedido.</p>
          </section>
          <small>Última atualização: 18 de agosto de 2026.</small>
        </div>
      </main>
    </>
  );
}
