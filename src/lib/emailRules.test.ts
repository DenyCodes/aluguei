import { describe, expect, it } from "vitest";
import { rentDueIdempotencyKey, rentEmailTotal, saoPauloDate, shouldSendRentDue } from "../../supabase/functions/_shared/email-rules";

describe("regras dos e-mails mensais", () => {
  it("envia somente no vencimento para estado elegível", () => {
    expect(shouldSendRentDue("upcoming", "2026-08-14", "2026-08-14", false)).toBe(true);
    expect(shouldSendRentDue("upcoming", "2026-08-15", "2026-08-14", false)).toBe(false);
    expect(shouldSendRentDue("paid", "2026-08-14", "2026-08-14", false)).toBe(false);
    expect(shouldSendRentDue("pending", "2026-08-14", "2026-08-14", true)).toBe(false);
  });

  it("calcula o total sem permitir saldo negativo", () => {
    expect(rentEmailTotal(900, 18, 4, 100)).toBe(822);
    expect(rentEmailTotal(500, 0, 0, 700)).toBe(0);
  });

  it("gera chave estável por parcela e vencimento", () => {
    expect(rentDueIdempotencyKey("parcela-1", "2026-08-14")).toBe("oliveira:rent_due:parcela-1:2026-08-14");
  });

  it("respeita o fuso de São Paulo", () => {
    expect(saoPauloDate(new Date("2026-08-14T02:30:00Z"))).toBe("2026-08-13");
  });
});

