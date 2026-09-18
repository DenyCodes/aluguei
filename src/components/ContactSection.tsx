import { FormEvent, useMemo, useState } from "react";
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

type LeadResponse = {
  accepted?: boolean;
  duplicate?: boolean;
  confirmation_sent?: boolean;
};

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

const createSubmissionId = () => crypto.randomUUID();

const ContactSection = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [submissionId, setSubmissionId] = useState(createSubmissionId);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    consent: false,
    website: "",
  });

  const attribution = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    };
  }, []);

  const updateField = <K extends keyof typeof form>(
    field: K,
    value: (typeof form)[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const result = await invokeSecure<LeadResponse>("oliveira-commercial-lead", {
        submission_id: submissionId,
        full_name: form.fullName,
        email: form.email,
        phone: form.phone,
        consent: form.consent,
        website: form.website,
        started_at: startedAt,
        ...attribution,
      });

      const message = result?.duplicate
        ? "Sua solicitação já tinha sido registrada. Não é necessário enviar novamente."
        : "Pedido recebido. Enviamos uma confirmação por e-mail e entraremos em contato para entender sua operação.";

      setFeedback({ type: "success", message });
      toast({
        title: result?.duplicate ? "Solicitação já registrada" : "Diagnóstico solicitado",
        description: message,
      });

      if (!result?.duplicate) {
        setForm({
          fullName: "",
          email: "",
          phone: "",
          consent: false,
          website: "",
        });
        setSubmissionId(createSubmissionId());
        setStartedAt(Date.now());
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível enviar agora. Tente novamente ou fale conosco pelo WhatsApp.";

      console.error("Commercial lead error", error);
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
        <div className="system-contact-copy">
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

          <div className="system-contact-channels">
            <a href="mailto:playtecno@outlook.com.br">
              <span className="system-contact-channel-icon">
                <Mail aria-hidden="true" />
              </span>
              <span>
                <small>E-mail</small>
                <strong>playtecno@outlook.com.br</strong>
              </span>
            </a>
            <a
              href="https://wa.me/5521993450137"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="system-contact-channel-icon">
                <MessageCircle aria-hidden="true" />
              </span>
              <span>
                <small>WhatsApp</small>
                <strong>(21) 99345-0137</strong>
              </span>
            </a>
          </div>
        </div>

        <form className="system-lead-form" onSubmit={handleSubmit}>
          <div className="system-form-heading">
            <span>Orçamento identificado</span>
            <strong>Vamos desenhar a implantação certa?</strong>
            <p>
              Preencha os dados abaixo. O pedido é registrado com segurança e a
              confirmação é enviada automaticamente por e-mail.
            </p>
          </div>

          <div className="system-form-grid">
            <div className="system-form-field system-form-field-full">
              <label htmlFor="commercial-full-name">Nome completo *</label>
              <input
                id="commercial-full-name"
                className="system-field"
                autoComplete="name"
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                placeholder="Seu nome e sobrenome"
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
                maxLength={254}
                required
              />
            </div>

            <div className="system-form-field">
              <label htmlFor="commercial-phone">WhatsApp / telefone *</label>
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
            className="system-button primary system-form-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="system-form-spinner" aria-hidden="true" />
                Registrando solicitação
              </>
            ) : (
              <>
                Solicitar diagnóstico
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </button>

          <div className="system-form-assurance" aria-label="Segurança do envio">
            <span>
              <ShieldCheck aria-hidden="true" />
              Envio protegido
            </span>
            <span>
              <CheckCircle2 aria-hidden="true" />
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
