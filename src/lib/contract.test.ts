import { describe, expect, it } from "vitest";
import { calculateInstallmentTotal, statusLabel, utilityLabel } from "./contract";

describe("regras de aluguel", () => {
  it("calcula aluguel com multa, juros e crédito aprovado", () => {
    expect(calculateInstallmentTotal({ base_amount: 500, fine_amount: 10, interest_amount: 5, credit_amount: 100 })).toBe(415);
  });

  it("nunca produz parcela negativa depois de um crédito", () => {
    expect(calculateInstallmentTotal({ base_amount: 500, fine_amount: 0, interest_amount: 0, credit_amount: 700 })).toBe(0);
  });

  it("mantém textos diferentes para as políticas de consumo", () => {
    expect(new Set(Object.values(utilityLabel)).size).toBe(3);
  });

  it("apresenta todos os estados operacionais", () => {
    expect(statusLabel("under_review")).toBe("Em análise");
    expect(statusLabel("rejected")).toBe("Comprovante rejeitado");
    expect(statusLabel("late")).toBe("Atrasada");
  });
});

