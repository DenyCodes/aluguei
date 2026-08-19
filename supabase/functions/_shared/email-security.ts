const SENSITIVE_EMAIL_EVENTS = new Set([
  "tenant_invite",
  "password_recovery",
  "signature_otp",
]);

type PersistedTemplate = {
  preheader?: string;
  heading?: string;
  greeting?: string;
  paragraphs?: string[];
  fields?: Array<{ label: string; value: string }>;
  notice?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
};

export function isSensitiveEmailEvent(eventType: string) {
  return SENSITIVE_EMAIL_EVENTS.has(eventType);
}

export function canRetryStoredEmail(eventType: string) {
  return !isSensitiveEmailEvent(eventType);
}

export function shouldSendAdminCopy(eventType: string, requested = false) {
  return requested && !isSensitiveEmailEvent(eventType);
}

export function sanitizeEmailTemplateForStorage(
  eventType: string,
  template: PersistedTemplate,
): PersistedTemplate {
  if (!isSensitiveEmailEvent(eventType)) {
    return {
      ...template,
      paragraphs: template.paragraphs ? [...template.paragraphs] : undefined,
      fields: template.fields?.map((field) => ({ ...field })),
    };
  }

  return {
    preheader: template.preheader,
    heading: template.heading,
    notice: "Conteudo de autenticacao removido do registro operacional.",
    footer: template.footer,
  };
}
