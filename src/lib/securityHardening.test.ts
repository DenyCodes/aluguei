import { describe, expect, it } from "vitest";
import {
  canRetryStoredEmail,
  sanitizeEmailTemplateForStorage,
  shouldSendAdminCopy,
} from "../../supabase/functions/_shared/email-security.ts";
import {
  hasExpectedFileSignature,
  safeStorageFileName,
} from "../../supabase/functions/_shared/file-validation.ts";
import {
  hasElevatedClaims,
  isAllowedOrigin,
} from "../../supabase/functions/_shared/http-security.ts";
import { verifySvixSignature } from "../../supabase/functions/_shared/resend-webhook-security.ts";

const base64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

describe("hardening dos e-mails", () => {
  it("nao persiste link, codigo ou campos de mensagens de autenticacao", () => {
    const persisted = sanitizeEmailTemplateForStorage("signature_otp", {
      preheader: "Codigo privado",
      heading: "Confirme sua assinatura",
      greeting: "Ola, pessoa",
      paragraphs: ["Seu codigo e 123456"],
      fields: [{ label: "Codigo", value: "123456" }],
      ctaLabel: "Assinar",
      ctaUrl: "https://example.test/secret-token",
    });

    expect(persisted).toEqual({
      preheader: "Codigo privado",
      heading: "Confirme sua assinatura",
      notice: "Conteudo de autenticacao removido do registro operacional.",
      footer: undefined,
    });
  });

  it("bloqueia copia administrativa e retry de eventos sensiveis", () => {
    expect(shouldSendAdminCopy("tenant_invite", true)).toBe(false);
    expect(canRetryStoredEmail("password_recovery")).toBe(false);
    expect(shouldSendAdminCopy("rent_due", true)).toBe(true);
    expect(canRetryStoredEmail("rent_due")).toBe(true);
  });
});

describe("hardening HTTP e de arquivos", () => {
  it("aceita somente origens da allowlist", () => {
    expect(isAllowedOrigin("https://imobiliariaoliveira.vercel.app")).toBe(true);
    expect(
      isAllowedOrigin(
        "https://portal.oliveira.test",
        "https://portal.oliveira.test/",
      ),
    ).toBe(true);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it("exige AAL2 ou sessao emitida nos ultimos quinze minutos", () => {
    expect(hasElevatedClaims({ aal: "aal2", iat: 1 }, 2_000_000)).toBe(true);
    expect(hasElevatedClaims({ aal: "aal1", iat: 1_999_200 }, 2_000_000)).toBe(
      true,
    );
    expect(hasElevatedClaims({ aal: "aal1", iat: 1_999_000 }, 2_000_000)).toBe(
      false,
    );
    expect(hasElevatedClaims({ aal: "aal1", iat: 2_001_000 }, 2_000_000)).toBe(
      false,
    );
  });

  it("valida assinatura real do arquivo e normaliza o nome", () => {
    expect(
      hasExpectedFileSignature(
        new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        "application/pdf",
      ),
    ).toBe(true);
    expect(
      hasExpectedFileSignature(
        new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]),
        "application/pdf",
      ),
    ).toBe(false);
    expect(safeStorageFileName("comprovante Joao/08.pdf")).toBe(
      "comprovante-Joao-08.pdf",
    );
  });
});

describe("assinatura do webhook Resend", () => {
  it("aceita HMAC Svix valido e rejeita assinatura ou timestamp invalidos", async () => {
    const rawBody = '{"type":"email.delivered","data":{"email_id":"email_1"}}';
    const svixId = "msg_test_1";
    const svixTimestamp = "1800000000";
    const secretBytes = new TextEncoder().encode("segredo-webhook-de-teste-32-bytes");
    const secret = `whsec_${base64(secretBytes)}`;
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`),
    );
    const signature = `v1,${base64(new Uint8Array(digest))}`;

    expect(
      await verifySvixSignature({
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature: signature,
        secret,
        nowSeconds: 1800000000,
      }),
    ).toBe(true);
    expect(
      await verifySvixSignature({
        rawBody: `${rawBody} `,
        svixId,
        svixTimestamp,
        svixSignature: signature,
        secret,
        nowSeconds: 1800000000,
      }),
    ).toBe(false);
    expect(
      await verifySvixSignature({
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature: signature,
        secret,
        nowSeconds: 1800000600,
      }),
    ).toBe(false);
  });
});
