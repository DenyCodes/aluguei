import { describe, expect, it } from "vitest";
import { resolveContract, validateFieldValues, validateTemplatePayload } from "../../supabase/functions/_shared/contract-template";

describe("modelo editável de contrato", () => {
  const fields = validateFieldValues({
    landlord_name: "Denis Oliveira",
    tenant_name: "Maria da Silva",
    tenant_email: "maria@example.com",
    property_address: "Rua das Flores, 10",
    monthly_rent: "850,00",
    starts_on: "2026-08-01",
    ends_on: "2027-07-31",
  });

  it("substitui campos editados no texto do PDF", () => {
    const template = validateTemplatePayload({ title: "Contrato de {{tenant_name}}", sections: [{ title: "1. DO ALUGUEL", body: "O aluguel de {{monthly_rent}} corresponde ao imóvel em {{property_address}}." }] });
    const result = resolveContract(template, fields);
    expect(result.title).toBe("Contrato de Maria da Silva");
    expect(result.sections[0].body).toContain("850,00");
    expect(result.sections[0].body).toContain("Rua das Flores, 10");
  });

  it("preserva textos livres incluídos pelo administrador", () => {
    const template = validateTemplatePayload({ title: "Contrato", sections: [{ title: "Cláusula adicional", body: "Texto especial acordado entre as partes." }] });
    expect(resolveContract(template, fields).sections[0].body).toBe("Texto especial acordado entre as partes.");
  });

  it("recusa modelo sem cláusulas preenchidas", () => {
    expect(() => validateTemplatePayload({ title: "Contrato", sections: [] })).toThrow(/cláusulas/);
  });
});
