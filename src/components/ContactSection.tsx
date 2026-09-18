import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { invokeSecure } from "../lib/supabase";

type ContactResponse = {
  success?: boolean;
  message?: string;
};

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

const initialForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  segment: "",
  message: "",
  website: "",
  consent: false,
};

const ContactSection = () => {
  const { toast } = useToast();
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const attribution = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      sourcePath: window.location.pathname,
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
    };
  }, []);

  const updateField = <K extends keyof typeof form,>(
    field: K,
    value: (typeof form)[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    // Honeypot: bots costumam preencher campos invisíveis.
    if (form.website.trim()) {
      setFeedback({
        type: "success",
        message: "Solicitação recebida. Entraremos em contato em breve.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const context = [
        form.message.trim(),
        "",
        `Empresa: ${form.company.trim() || "Não informada"}`,
        `Segmento: ${form.segment.trim() || "Não informado"}`,
        `Origem: ${attribution.sourcePath}`,
        attribution.utmSource ? `UTM source: ${attribution.utmSource}` : "",
        attribution.utmMedium ? `UTM medium: ${attribution.utmMedium}` : "",
        attribution.utmCampaign ? `UTM campaign: ${attribution.utmCampaign}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await invokeSecure<ContactResponse>("send-contact-email", {
        name: form.name,
        email: form.email,
        phone: form.phone,
        subject: "Sistema de gestão de locações — solicitação de diagnóstico",
        message: context,
        brand: "playtecno",
      });

      const successMessage =
        "Sua solicitação foi enviada. Você receberá uma confirmação por e-mail e entraremos em contato para entender sua operação.";

      setFeedback({ type: "success", message: successMessage });
      toast({
        title: "Diagnóstico solicitado",
        description: successMessage,
      });
      setForm(initialForm);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível enviar agora. Tente novamente ou fale conosco pelo WhatsApp.";

      console.error("Commercial contact error", error);
      setFeedback({ type: "error", message });
      toast({
        title: "Não foi possível enviar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      id="orcamento"
      className="system-contact"
      aria-labelledby="system-contact-title"
    >
      <div className="shell system-contact-grid">
        <div>
          <span className="eyebrow light">Solicite uma proposta</span>
          <h2 id="system-contact-title">
            Conte como sua operação funciona. A tecnologia entra depois.
          </h2>
          <p>
            A primeira conversa serve para entender quantidade de imóveis,
            rotina de cobrança, contratos, comunicação e acessos. A partir desse
            diagnóstico, o escopo e o orçamento ficam objetivos.
          </p>

          <ul aria-label="O que acontece depois do envio">
            <li>Diagnóstico inicial sem checkout ou contratação automática.</li>
            <li>Implantação ajustada às regras reais da sua operação.</li>
            <li>Confirmação automática enviada para o seu e-mail.</li>
            <li>Dados usados somente para responder à solicitação comercial.</li>
          </ul>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <a
              className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] p-4 text-white no-underline transition hover:bg-white/[0.1]"
              href="mailto:playtecno@outlook.com.br"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10">
                <Mail className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <small className="block text-[0.65rem] uppercase tracking-[0.08em] text-white/55">
                  E-mail
                </small>
                <strong className="block truncate text-sm">
                  playtecno@outlook.com.br
                </strong>
              </span>
            </a>
            <a
              className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] p-4 text-white no-underline transition hover:bg-white/[0.1]"
              href="https://wa.me/5521993450137"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <small className="block text-[0.65rem] uppercase tracking-[0.08em] text-white/55">
                  WhatsApp
                </small>
                <strong className="block text-sm">(21) 99345-0137</strong>
              </span>
            </a>
          </div>
        </div>

        <form className="system-lead-form" onSubmit={handleSubmit}>
          <div className="system-form-heading">
            <span>Orçamento identificado</span>
            <strong>Vamos desenhar a implantação certa?</strong>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Preencha os dados abaixo para receber um contato com os próximos
              passos e uma proposta adequada ao seu cenário.
            </p>
          </div>

          <div className="system-form-grid">
            <div className="system-form-field">
              <label htmlFor="commercial-name">Nome *</label>
              <input
                id="commercial-name"
                className="system-field"
                autoComplete="name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Seu nome"
                minLength={2}
                maxLength={100}
                required
              />
            </div>

            <div className="system-form-field">
              <label htmlFor="commercial-email">E-mail *</label>
              <input
                id="commercial-email"
                className="system-field"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="voce@empresa.com.br"
                maxLength={180}
                required
              />
            </div>

            <div className="system-form-field">
              <label htmlFor="commercial-phone">Telefone</label>
              <input
                id="commercial-phone"
                className="system-field"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="(21) 99999-9999"
                maxLength={30}
              />
            </div>

            <div className="system-form-field">
              <label htmlFor="commercial-company">Empresa / imobiliária</label>
              <input
                id="commercial-company"
                className="system-field"
                autoComplete="organization"
                value={form.company}
                onChange={(event) => updateField("company", event.target.value)}
                placeholder="Nome da operação"
                maxLength={120}
              />
            </div>

            <div className="system-form-field system-form-field-full">
              <label htmlFor="commercial-segment">Segmento</label>
              <input
                id="commercial-segment"
                className="system-field"
                value={form.segment}
                onChange={(event) => updateField("segment", event.target.value)}
                placeholder="Ex.: imobiliária, administradora, locador independente"
                maxLength={100}
              />
            </div>

            <div className="system-form-field system-form-field-full">
              <label htmlFor="commercial-message">Contexto do projeto *</label>
              <textarea
                id="commercial-message"
                className="system-field min-h-32 resize-y"
                value={form.message}
                onChange={(event) => updateField("message", event.target.value)}
                placeholder="Conte quantos imóveis administra, como funciona hoje e o que você gostaria de automatizar."
                minLength={10}
                maxLength={3000}
                required
              />
            </div>
          </div>

          <label className="system-consent" htmlFor="commercial-consent">
            <input
              id="commercial-consent"
              type="checkbox"
              checked={form.consent}
              onChange={(event) => updateField("consent", event.target.checked)}
              required
            />
            <span>
              Autorizo o contato para responder a esta solicitação comercial e
              concordo com o tratamento dos dados conforme a{" "}
              <a href="/privacidade">Política de Privacidade</a>.
            </span>
          </label>

          <label className="system-honeypot" aria-hidden="true">
            Não preencha este campo
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
            />
          </label>

          <button
            type="submit"
            className="system-button primary gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Enviando solicitação
              </>
            ) : (
              <>
                Solicitar diagnóstico
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>

          <div
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.68rem] font-semibold text-slate-500"
            aria-label="Segurança do envio"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Envio protegido
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Confirmação por e-mail
            </span>
          </div>

          {feedback ? (
            <p
              className={`system-form-feedback ${feedback.type}`}
              role={feedback.type === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {feedback.message}
            </p>
          ) : null}

          <p className="system-form-footnote">
            Uso exclusivamente transacional. O envio não cadastra seu e-mail em
            newsletter.
          </p>
        </form>
      </div>
    </section>
  );
};

export default ContactSection;
