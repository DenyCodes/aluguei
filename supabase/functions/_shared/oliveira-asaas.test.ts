import {
  authorizationContractId,
  businessDaysUntil,
  constantTimeEqual,
  isStaleProviderEvent,
  minimizedUnknownWebhook,
  normalizeWebhookPayload,
} from "./oliveira-asaas.ts";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("authorization contract id respects Asaas limit", () => {
  const id = authorizationContractId("11111111-2222-3333-4444-555555555555");
  assert(id.length <= 35, "contractId exceeds 35 characters");
  assert(!id.includes("-"), "contractId must be compact");
});

Deno.test("Automatic Pix webhook is normalized without unknown fields", () => {
  const normalized = normalizeWebhookPayload({
    id: "evt_oliveira_1",
    event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
    dateCreated: "2026-08-18 12:00:00",
    account: { id: "acc_1", secret: "must-not-survive" },
    paymentInstruction: {
      id: "ins_1",
      status: "SCHEDULED",
      payment: "pay_1",
      authorization: { id: "aut_1" },
      extraPii: "must-not-survive",
    },
  });
  assert(normalized.eventId === "evt_oliveira_1", "event id was not kept");
  assert(normalized.resourceId === "pay_1", "payment id was not normalized");
  assert(!JSON.stringify(normalized.payload).includes("must-not-survive"), "unknown data leaked");
});

Deno.test("unknown webhook storage is minimized", () => {
  const normalized = normalizeWebhookPayload({
    id: "evt_foreign_1",
    event: "FUTURE_PROVIDER_EVENT",
    account: { id: "acc_foreign" },
    customer: { name: "Sensitive Name", cpfCnpj: "00000000000" },
  });
  const minimized = minimizedUnknownWebhook(normalized);
  const serialized = JSON.stringify(minimized);
  assert(!serialized.includes("Sensitive Name"), "unknown customer data was retained");
  assert(!serialized.includes("00000000000"), "unknown document was retained");
});

Deno.test("business day window ignores weekends", () => {
  assert(businessDaysUntil("2026-08-14", "2026-08-18") === 2, "Friday to Tuesday should be two business days");
});

Deno.test("webhook token comparison handles equal and different values", () => {
  assert(constantTimeEqual("a-long-token", "a-long-token"), "equal tokens should match");
  assert(!constantTimeEqual("a-long-token", "another-token"), "different tokens should not match");
});

Deno.test("older provider event is stale but equal timestamp stays idempotent", () => {
  assert(
    isStaleProviderEvent("2026-08-18T12:00:01Z", "2026-08-18T12:00:00Z"),
    "older event should be stale",
  );
  assert(
    !isStaleProviderEvent("2026-08-18T12:00:01Z", "2026-08-18T12:00:01Z"),
    "equal event timestamps should be processable",
  );
});
