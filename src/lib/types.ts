export type UserRole = "admin" | "tenant";
export type UtilityPolicy = "included" | "individual" | "shared";
export type InstallmentStatus =
  | "upcoming"
  | "pending"
  | "under_review"
  | "paid"
  | "late"
  | "rejected"
  | "cancelled";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  cpf_masked: string | null;
  role: UserRole;
  avatar_path: string | null;
  document_status: "incomplete" | "pending" | "approved" | "rejected";
  account_status: "active" | "disabled" | "deleted";
  deleted_at: string | null;
};

export type Property = {
  id: string;
  title: string;
  neighborhood: string;
  neighborhood_label: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  water_policy: UtilityPolicy;
  electricity_policy: UtilityPolicy;
  contact: string;
  active: boolean;
  availability_status: "available" | "rented" | "maintenance" | "archived";
  images: string[];
};

export type Tenancy = {
  id: string;
  tenant_id: string;
  property_id: string;
  starts_on: string;
  ends_on: string;
  monthly_rent: number;
  due_day: number;
  late_fee_percent: number;
  monthly_interest_percent: number;
  adjustment_index: string;
  guarantee_type: string;
  status: "draft" | "active" | "ended" | "cancelled";
  deleted_at: string | null;
  deleted_by: string | null;
  require_document_approval: boolean;
  required_document_types: TenantDocumentType[];
  property?: Pick<Property, "title" | "address">;
};

export type TenantDocumentType =
  | "profile_photo"
  | "rg_front"
  | "rg_back"
  | "cpf"
  | "proof_of_address"
  | "other";
export type TenantDocument = {
  id: string;
  tenant_id: string;
  document_type: TenantDocumentType;
  display_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "approved" | "rejected" | "replaced" | "deleted";
  uploaded_by: string;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type RentReceipt = {
  id: string;
  installment_id: string;
  tenancy_id: string;
  tenant_id: string;
  receipt_number: string;
  amount: number;
  paid_at: string;
  pdf_path: string | null;
  issued_by: string | null;
  billing_charge_id: string | null;
  source: "manual" | "asaas";
  status: "active" | "voided";
  provider_payment_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};
export type MaintenanceAttachment = {
  id: string;
  request_id: string;
  tenant_id: string;
  storage_path: string;
  display_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};
export type OliveiraNotification = {
  id: string;
  recipient_id: string;
  event_type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type Contract = {
  id: string;
  tenancy_id: string;
  version: number;
  status: "draft" | "pending_signature" | "signed" | "cancelled";
  document_hash: string | null;
  pdf_path: string | null;
  content: Record<string, unknown>;
  issued_at: string | null;
  signed_at: string | null;
};

export type ContractSection = {
  title: string;
  body: string;
};

export type ContractTemplate = {
  id: string;
  name: string;
  description: string;
  content: {
    title: string;
    sections: ContractSection[];
  };
  is_default: boolean;
  active: boolean;
  updated_at: string;
};

export type Installment = {
  id: string;
  tenancy_id: string;
  reference_month: string;
  due_date: string;
  base_amount: number;
  fine_amount: number;
  interest_amount: number;
  credit_amount: number;
  paid_amount: number;
  status: InstallmentStatus;
  paid_at: string | null;
  principal_paid_at: string | null;
  settled_at: string | null;
  payment_source: "asaas" | "manual" | "receipt" | null;
};

export type PaymentReceipt = {
  id: string;
  installment_id: string;
  tenant_id: string;
  file_path: string;
  amount: number;
  status: "under_review" | "approved" | "rejected";
  note: string | null;
  created_at: string;
};

export type MaintenanceRequest = {
  id: string;
  tenancy_id: string;
  tenant_id: string;
  title: string;
  description: string;
  status: "requested" | "authorized" | "completed" | "credited" | "rejected";
  approved_limit: number | null;
  approved_credit: number | null;
  owner_note: string | null;
  source: "tenant" | "admin";
  created_by: string | null;
  created_at: string;
};

export type EmailDelivery = {
  id: string;
  event_type:
    | "rent_due"
    | "contract_issued"
    | "contract_signed"
    | "tenant_invite"
    | "password_recovery"
    | "signature_otp"
    | "commercial_lead_confirmation"
    | "commercial_lead_admin"
    | "payment_setup"
    | "payment_available"
    | "payment_due"
    | "payment_confirmed"
    | "payment_failed"
    | "pix_authorization"
    | "late_adjustment_due"
    | "payment_reversed"
    | "test";
  recipient_email: string;
  subject: string;
  entity_type: string;
  entity_id: string | null;
  status: "pending" | "sending" | "sent" | "failed";
  operational_status:
    | "queued"
    | "sending"
    | "sent"
    | "delivered"
    | "delivery_delayed"
    | "bounced"
    | "complained"
    | "failed"
    | "suppressed"
    | null;
  attempts: number;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

export type CommercialLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "archived";

export type CommercialLead = {
  id: string;
  full_name: string;
  email: string;
  phone_digits: string;
  status: CommercialLeadStatus;
  source_path: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  consent_at: string;
  internal_note: string;
  status_changed_at: string;
  status_changed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OliveiraSettings = {
  id: number;
  landlord_name: string;
  landlord_tax_id: string;
  payment_instructions: string;
  jurisdiction: string;
  email_enabled: boolean;
  rent_due_email_enabled: boolean;
  email_from_name: string;
  email_from_address: string;
  email_reply_to: string;
  email_admin_copy: string;
  email_send_hour: number;
  email_timezone: string;
  billing_enabled: boolean;
  automatic_creation_enabled: boolean;
  billing_started_at: string | null;
};

export type BillingMethod =
  | "pix_automatic"
  | "credit_card"
  | "credit_card_subscription"
  | "pix"
  | "manual";

export type BillingAgreementStatus =
  | "setup_pending"
  | "awaiting_authorization"
  | "active"
  | "fallback_required"
  | "cancelled"
  | "expired"
  | "failed";

export type BillingChargeStatus =
  | "draft"
  | "creating"
  | "pending"
  | "scheduled"
  | "confirmed"
  | "received"
  | "overdue"
  | "refused"
  | "cancelled"
  | "refunded"
  | "chargeback"
  | "manual_review";

export type AsaasIntegration = {
  id: 1;
  environment: "unconfigured" | "sandbox" | "production";
  account_id: string | null;
  pix_automatic_eligibility: "unknown" | "eligible" | "ineligible";
  pix_automatic_ineligible_reasons: string[];
  webhook_id: string | null;
  webhook_url: string | null;
  webhook_configured_at: string | null;
  last_webhook_at: string | null;
  last_eligibility_event_at: string | null;
  enabled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingAgreement = {
  id: string;
  tenancy_id: string;
  tenant_id: string;
  asaas_customer_id: string | null;
  method: "pix_automatic" | "credit_card_subscription";
  status: BillingAgreementStatus;
  external_reference: string;
  provider_authorization_id: string | null;
  provider_subscription_id: string | null;
  provider_checkout_id: string | null;
  provider_status: string | null;
  starts_on: string;
  ends_on: string | null;
  fallback_reason: string | null;
  consent_at: string;
  consent_version: string;
  consent_method: "tenant_web";
  activated_at: string | null;
  cancelled_at: string | null;
  last_event_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BillingCharge = {
  id: string;
  installment_id: string | null;
  agreement_id: string | null;
  tenancy_id: string;
  tenant_id: string;
  kind: "rent_principal" | "late_adjustment";
  method: "pix_automatic" | "credit_card" | "pix" | "manual";
  status: BillingChargeStatus;
  amount: number;
  due_date: string;
  external_reference: string;
  provider_payment_id: string | null;
  provider_checkout_id: string | null;
  provider_instruction_id: string | null;
  provider_status: string | null;
  invoice_url: string | null;
  pix_qr_payload: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  last_event_at: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BillingOperation = {
  id: string;
  operation_key: string;
  operation_type:
    | "create_customer"
    | "create_authorization"
    | "create_checkout"
    | "create_payment"
    | "cancel_payment"
    | "cancel_agreement"
    | "update_payment";
  agreement_id: string | null;
  charge_id: string | null;
  status:
    | "pending"
    | "running"
    | "succeeded"
    | "retryable_failed"
    | "permanent_failed"
    | "unknown";
  request_payload: Record<string, unknown>;
  provider_resource_id: string | null;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AsaasWebhookEvent = {
  id: number;
  event_id: string;
  event_type: string;
  resource_kind: string | null;
  resource_id: string | null;
  is_oliveira: boolean;
  status: "pending" | "processing" | "processed" | "ignored" | "failed";
  attempts: number;
  error_message: string | null;
  provider_created_at: string | null;
  received_at: string;
  processed_at: string | null;
};

export type InstallmentFinancialStatus =
  | "cancelled"
  | "manual_review"
  | "settled"
  | "principal_paid_fees_due"
  | "not_due"
  | "principal_pending";
