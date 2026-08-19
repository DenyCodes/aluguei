import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AsaasEnvironment = "sandbox" | "production";
export type JsonObject = Record<string, unknown>;

export class AsaasApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(message: string, status: number, code = "asaas_error") {
    super(message);
    this.name = "AsaasApiError";
    this.status = status;
    this.code = code;
    this.retryable = status === 408 || status === 429 || status >= 500;
  }
}

const encoder = new TextEncoder();
const object = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
const stringValue = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function getAsaasEnvironment(): AsaasEnvironment {
  const value = (Deno.env.get("ASAAS_ENVIRONMENT") ?? "").toLowerCase();
  if (value !== "sandbox" && value !== "production") {
    throw new Error("ASAAS_ENVIRONMENT deve ser sandbox ou production");
  }
  return value;
}

export function getAsaasBaseUrl() {
  return getAsaasEnvironment() === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

export function asaasCheckoutUrl(checkoutId: string) {
  const host = getAsaasEnvironment() === "production"
    ? "https://asaas.com"
    : "https://sandbox.asaas.com";
  return `${host}/checkoutSession/show?id=${encodeURIComponent(checkoutId)}`;
}

export async function asaasRequest<T = JsonObject>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) throw new Error("ASAAS_API_KEY nao configurada");
  const method = options.method ?? "GET";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  try {
    const response = await fetch(`${getAsaasBaseUrl()}${path}`, {
      method,
      headers: {
        accept: "application/json",
        access_token: apiKey,
        "User-Agent": "ImobiliariaOliveira/1.0",
        ...(method !== "GET" && method !== "DELETE"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(method !== "GET" && options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errors = Array.isArray(payload?.errors) ? payload.errors : [];
      const first = object(errors[0]);
      const message = stringValue(first.description || payload?.message) ||
        `Asaas HTTP ${response.status}`;
      const code = stringValue(first.code || payload?.code) || "asaas_error";
      throw new AsaasApiError(message, response.status, code);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof AsaasApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AsaasApiError("Tempo limite excedido na comunicacao com o Asaas", 408, "timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertOliveiraAsaasAccount() {
  const expectedAccount = Deno.env.get("ASAAS_ACCOUNT_ID") ?? "";
  if (!expectedAccount) throw new Error("ASAAS_ACCOUNT_ID nao configurada");
  const account = await asaasRequest<JsonObject>("/myAccount");
  const actualAccount = stringValue(account.id);
  if (!actualAccount || actualAccount !== expectedAccount) {
    throw new Error("A credencial Asaas nao pertence a conta Oliveira configurada");
  }
  return actualAccount;
}

export const compactUuid = (value: string) => value.replaceAll("-", "").slice(0, 32);
export const customerReference = (tenantId: string) => `oliveira:tenant:${tenantId}`;
export const agreementReference = (agreementId: string) => `oliveira:agreement:${agreementId}`;
export const chargeReference = (chargeId: string) => `oliveira:charge:${chargeId}`;
export const authorizationContractId = (tenancyId: string) => `io${compactUuid(tenancyId)}`;
export const isOliveiraReference = (value: unknown) =>
  typeof value === "string" && value.startsWith("oliveira:");

export function normalizeDocument(value: unknown) {
  const document = stringValue(value).replace(/\D/g, "");
  if (![11, 14].includes(document.length)) throw new Error("CPF/CNPJ invalido");
  return document;
}

export async function hashDocument(document: string) {
  const pepper = Deno.env.get("OLIVEIRA_BILLING_PEPPER");
  if (!pepper) throw new Error("OLIVEIRA_BILLING_PEPPER nao configurado");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(document));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) {
    mismatch |= (a[index % Math.max(a.length, 1)] ?? 0) ^
      (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return mismatch === 0;
}

export async function getBillingFlags(client: SupabaseClient) {
  const result = await client.from("oliveira_settings")
    .select("billing_enabled,automatic_creation_enabled,billing_started_at")
    .eq("id", 1)
    .single();
  if (result.error) throw result.error;
  return {
    billingEnabled: result.data.billing_enabled === true,
    automaticCreationEnabled: result.data.automatic_creation_enabled === true,
    billingStartedAt: result.data.billing_started_at as string | null,
  };
}

export async function ensureAsaasCustomer(
  client: SupabaseClient,
  input: { tenantId: string; name: string; email: string; phone?: string | null; cpfCnpj: unknown },
) {
  const current = await client.from("oliveira_asaas_customers").select("*")
    .eq("tenant_id", input.tenantId).maybeSingle();
  if (current.error) throw current.error;
  if (current.data) return current.data;

  const cpfCnpj = normalizeDocument(input.cpfCnpj);
  const externalReference = customerReference(input.tenantId);
  const documentHash = await hashDocument(cpfCnpj);
  const query = new URLSearchParams({ externalReference, limit: "1" });
  const listed = await asaasRequest<{ data?: Array<JsonObject> }>(`/customers?${query}`);
  let providerCustomer = listed.data?.[0];
  if (!providerCustomer) {
    const operation = await reserveOperation(client, {
      operationKey: `create-customer:${input.tenantId}:${documentHash.slice(0, 16)}`,
      operationType: "create_customer",
      requestPayload: { externalReference, documentHash: documentHash.slice(0, 16) },
    });
    if (operation.status !== "pending") {
      throw new Error("Cadastro do cliente ja registrado; aguarde conciliacao");
    }
    if (!await markOperationRunning(client, operation.id)) {
      throw new Error("Cadastro do cliente ja esta em processamento");
    }
    try {
      providerCustomer = await asaasRequest<JsonObject>("/customers", {
        method: "POST",
        body: {
          name: input.name,
          cpfCnpj,
          email: input.email,
          ...(input.phone ? { mobilePhone: input.phone.replace(/\D/g, "") } : {}),
          externalReference,
          notificationDisabled: true,
          groupName: "Imobiliaria Oliveira",
        },
      });
      await finishOperation(client, operation.id, {
        status: "succeeded",
        providerResourceId: stringValue(providerCustomer.id) || null,
      });
    } catch (error) {
      const unknown = error instanceof AsaasApiError && error.retryable;
      await finishOperation(client, operation.id, {
        status: unknown ? "unknown" : "permanent_failed",
        error: error instanceof Error ? error.message : "Falha Asaas",
      });
      throw error;
    }
  }
  const providerCustomerId = stringValue(providerCustomer.id);
  if (!providerCustomerId) throw new Error("Asaas nao retornou o identificador do cliente");
  const inserted = await client.from("oliveira_asaas_customers").insert({
    tenant_id: input.tenantId,
    provider_customer_id: providerCustomerId,
    external_reference: externalReference,
    document_hash: documentHash,
    document_last4: cpfCnpj.slice(-4),
  }).select().single();
  if (!inserted.error) return inserted.data;
  const raced = await client.from("oliveira_asaas_customers").select("*")
    .eq("tenant_id", input.tenantId).single();
  if (raced.error) throw inserted.error;
  return raced.data;
}

export async function reserveOperation(
  client: SupabaseClient,
  input: {
    operationKey: string;
    operationType: string;
    agreementId?: string | null;
    chargeId?: string | null;
    requestPayload?: JsonObject;
  },
) {
  const existing = await client.from("oliveira_billing_operations").select("*")
    .eq("operation_key", input.operationKey).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const inserted = await client.from("oliveira_billing_operations").insert({
    operation_key: input.operationKey,
    operation_type: input.operationType,
    agreement_id: input.agreementId ?? null,
    charge_id: input.chargeId ?? null,
    request_payload: input.requestPayload ?? {},
  }).select().single();
  if (!inserted.error) return inserted.data;
  const raced = await client.from("oliveira_billing_operations").select("*")
    .eq("operation_key", input.operationKey).single();
  if (raced.error) throw inserted.error;
  return raced.data;
}

export async function markOperationRunning(client: SupabaseClient, id: string) {
  const updated = await client.from("oliveira_billing_operations").update({
    status: "running",
    attempts: 1,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).in("status", ["pending", "retryable_failed", "unknown"]).select().maybeSingle();
  if (updated.error) throw updated.error;
  return updated.data;
}

export async function finishOperation(
  client: SupabaseClient,
  id: string,
  input: { status: "succeeded" | "retryable_failed" | "permanent_failed" | "unknown"; providerResourceId?: string | null; error?: string | null },
) {
  const result = await client.from("oliveira_billing_operations").update({
    status: input.status,
    provider_resource_id: input.providerResourceId ?? null,
    last_error: input.error?.slice(0, 1000) ?? null,
    next_attempt_at: input.status === "retryable_failed"
      ? new Date(Date.now() + 15 * 60_000).toISOString()
      : null,
    completed_at: ["succeeded", "permanent_failed"].includes(input.status)
      ? new Date().toISOString()
      : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (result.error) throw result.error;
}

export async function findPaymentByExternalReference(externalReference: string) {
  const query = new URLSearchParams({ externalReference, limit: "10" });
  const result = await asaasRequest<{ data?: Array<JsonObject> }>(`/payments?${query}`);
  return result.data?.find((item) => item.externalReference === externalReference) ?? null;
}

export function parseProviderDate(value: unknown) {
  if (!value) return null;
  const raw = stringValue(value);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00-03:00` : raw.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isStaleProviderEvent(lastEventAt: unknown, incomingEventAt: unknown) {
  const last = parseProviderDate(lastEventAt);
  const incoming = parseProviderDate(incomingEventAt);
  return Boolean(last && incoming && new Date(incoming).getTime() < new Date(last).getTime());
}

export function normalizeWebhookPayload(rawValue: unknown) {
  const raw = object(rawValue);
  const account = object(raw.account);
  const payment = object(raw.payment);
  const checkout = object(raw.checkout);
  const subscription = object(raw.subscription);
  const authorization = object(raw.authorization);
  const instruction = object(raw.paymentInstruction);
  const eligibility = object(raw.eligibility);
  const authorizationFromInstruction = object(instruction.authorization);
  const automaticAuthorization = typeof raw.pixAutomaticAuthorization === "string"
    ? raw.pixAutomaticAuthorization
    : stringValue(object(raw.pixAutomaticAuthorization).id);

  const eventType = stringValue(raw.event).slice(0, 120);
  const paymentId = stringValue(payment.id || instruction.payment || raw.payment);
  const checkoutId = stringValue(checkout.id || raw.checkout);
  const subscriptionId = stringValue(subscription.id || payment.subscription || raw.subscription);
  const authorizationId = stringValue(
    authorization.id || authorizationFromInstruction.id || automaticAuthorization,
  );
  const instructionId = stringValue(instruction.id);
  const externalReference = stringValue(
    payment.externalReference || checkout.externalReference || subscription.externalReference,
  );
  const resourceKind = paymentId
    ? "payment"
    : checkoutId
      ? "checkout"
      : subscriptionId
        ? "subscription"
        : instructionId
          ? "payment_instruction"
          : authorizationId
            ? "pix_authorization"
            : eventType.includes("ELIGIBILITY")
              ? "eligibility"
              : "unknown";
  const resourceId = paymentId || checkoutId || subscriptionId || instructionId || authorizationId || "";

  return {
    eventId: stringValue(raw.id).slice(0, 180),
    eventType,
    accountId: stringValue(account.id).slice(0, 120),
    providerCreatedAt: parseProviderDate(raw.dateCreated),
    resourceKind,
    resourceId: resourceId.slice(0, 180),
    externalReference: externalReference.slice(0, 240),
    payload: {
      payment: paymentId
        ? {
          id: paymentId,
          status: stringValue(payment.status),
          billingType: stringValue(payment.billingType),
          value: numberValue(payment.value),
          netValue: numberValue(payment.netValue),
          dueDate: stringValue(payment.dueDate),
          paymentDate: stringValue(payment.paymentDate || payment.clientPaymentDate),
          confirmedDate: stringValue(payment.confirmedDate),
          externalReference: stringValue(payment.externalReference),
          customer: stringValue(payment.customer),
          subscription: subscriptionId,
          invoiceUrl: stringValue(payment.invoiceUrl),
        }
        : null,
      checkout: checkoutId
        ? {
          id: checkoutId,
          status: stringValue(checkout.status),
          externalReference: stringValue(checkout.externalReference),
        }
        : null,
      subscription: subscriptionId
        ? {
          id: subscriptionId,
          status: stringValue(subscription.status),
          externalReference: stringValue(subscription.externalReference),
          billingType: stringValue(subscription.billingType),
          nextDueDate: stringValue(subscription.nextDueDate),
        }
        : null,
      authorization: authorizationId
        ? {
          id: authorizationId,
          status: stringValue(authorization.status),
          customerId: stringValue(authorization.customerId),
        }
        : null,
      paymentInstruction: instructionId
        ? {
          id: instructionId,
          status: stringValue(instruction.status),
          payment: paymentId,
          authorizationId,
          dueDate: stringValue(instruction.dueDate),
          refusalReason: stringValue(instruction.refusalReason),
        }
        : null,
      eligibility: eventType.includes("ELIGIBILITY")
        ? {
          status: stringValue(eligibility.status),
          ineligibleReasons: Array.isArray(eligibility.ineligibleReasons)
            ? eligibility.ineligibleReasons.map((item) => stringValue(item).slice(0, 200)).slice(0, 20)
            : [],
        }
        : null,
    },
  };
}

export async function webhookBelongsToOliveira(
  client: SupabaseClient,
  normalized: ReturnType<typeof normalizeWebhookPayload>,
) {
  const expectedAccount = Deno.env.get("ASAAS_ACCOUNT_ID") ?? "";
  if (expectedAccount && normalized.accountId && normalized.accountId !== expectedAccount) return false;
  if (isOliveiraReference(normalized.externalReference)) return true;
  if (normalized.eventType === "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED") return true;

  if (normalized.resourceKind === "payment" && normalized.resourceId) {
    const result = await client.from("oliveira_billing_charges").select("id")
      .eq("provider_payment_id", normalized.resourceId).limit(1);
    if (result.data?.length) return true;
  }
  if (normalized.resourceKind === "checkout" && normalized.resourceId) {
    const charge = await client.from("oliveira_billing_charges").select("id")
      .eq("provider_checkout_id", normalized.resourceId).limit(1);
    if (charge.data?.length) return true;
    const agreement = await client.from("oliveira_billing_agreements").select("id")
      .eq("provider_checkout_id", normalized.resourceId).limit(1);
    if (agreement.data?.length) return true;
  }
  const payload = object(normalized.payload);
  const authorizationId = stringValue(object(payload.authorization).id);
  const subscriptionId = stringValue(object(payload.subscription).id);
  if (authorizationId) {
    const result = await client.from("oliveira_billing_agreements").select("id")
      .eq("provider_authorization_id", authorizationId).limit(1);
    if (result.data?.length) return true;
  }
  if (subscriptionId) {
    const result = await client.from("oliveira_billing_agreements").select("id")
      .eq("provider_subscription_id", subscriptionId).limit(1);
    if (result.data?.length) return true;
  }
  return false;
}

export function minimizedUnknownWebhook(normalized: ReturnType<typeof normalizeWebhookPayload>) {
  return {
    event: normalized.eventType,
    accountId: normalized.accountId || null,
    resourceKind: normalized.resourceKind,
    resourceId: normalized.resourceId || null,
  };
}

export function businessDaysUntil(fromDate: string, dueDate: string) {
  const cursor = new Date(`${fromDate}T12:00:00-03:00`);
  const end = new Date(`${dueDate}T12:00:00-03:00`);
  let days = 0;
  while (cursor < end && days <= 366) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

export function saoPauloDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const installmentNetAmount = (installment: JsonObject) =>
  Math.max(0, Number(installment.base_amount ?? 0) - Number(installment.credit_amount ?? 0));
