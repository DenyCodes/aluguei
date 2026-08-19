export type ContractFieldValues = Record<string, string | number>;

export type ContractSection = {
  title: string;
  body: string;
};

export type ContractTemplatePayload = {
  title: string;
  sections: ContractSection[];
};

const FIELD_KEYS = new Set([
  "landlord_name", "landlord_tax_id", "tenant_name", "tenant_tax_id", "tenant_email",
  "property_title", "property_address", "starts_on", "ends_on", "monthly_rent", "due_day",
  "late_fee_percent", "monthly_interest_percent", "adjustment_index", "guarantee_type",
  "water_policy", "electricity_policy", "jurisdiction", "notice_days", "issue_city", "issue_date",
]);

function cleanText(value: unknown, maximum: number) {
  return String(value ?? "").split("\0").join("").trim().slice(0, maximum);
}

export function validateTemplatePayload(value: unknown): ContractTemplatePayload {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  if (rawSections.length < 1 || rawSections.length > 30) throw new Error("O modelo deve possuir entre 1 e 30 cláusulas");
  const sections = rawSections.map((item, index) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const title = cleanText(row.title, 180);
    const body = cleanText(row.body, 8000);
    if (!title || !body) throw new Error(`Preencha o título e o texto da cláusula ${index + 1}`);
    return { title, body };
  });
  return { title: cleanText(source.title, 180) || "CONTRATO PARTICULAR DE LOCAÇÃO RESIDENCIAL", sections };
}

export function validateFieldValues(value: unknown): ContractFieldValues {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const result: ContractFieldValues = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!FIELD_KEYS.has(key)) continue;
    result[key] = cleanText(raw, 1000);
  }
  for (const required of ["landlord_name", "tenant_name", "tenant_email", "property_address", "monthly_rent", "starts_on", "ends_on"]) {
    if (!result[required]) throw new Error(`Campo contratual obrigatório não preenchido: ${required}`);
  }
  return result;
}

export function resolveTemplateText(text: string, fields: ContractFieldValues) {
  return text.replace(/{{\s*([a-z_]+)\s*}}/g, (_match, key: string) => String(fields[key] ?? ""));
}

export function resolveContract(template: ContractTemplatePayload, fields: ContractFieldValues) {
  return {
    ...fields,
    title: resolveTemplateText(template.title, fields),
    sections: template.sections.map((section) => ({
      title: resolveTemplateText(section.title, fields),
      body: resolveTemplateText(section.body, fields),
    })),
  };
}
