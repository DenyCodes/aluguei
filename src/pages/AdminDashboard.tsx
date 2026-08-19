import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DashboardShell } from "../components/DashboardShell";
import { AdminBillingPanel } from "../components/BillingPanels";
import { ContractsPanel } from "../components/ContractsPanel";
import { TenancyCreateForm } from "../components/TenancyCreateForm";
import { PropertyCreateForm } from "../components/PropertyCreateForm";
import { seedProperties } from "../data/properties";
import {
  invokeSecure,
  invokeSecureForm,
  requireSupabase,
} from "../lib/supabase";
import { downloadPrivateFile } from "../lib/download";
import { useAuth } from "../state/AuthContext";
import type {
  CommercialLead,
  CommercialLeadStatus,
  Contract,
  ContractTemplate,
  EmailDelivery,
  Installment,
  MaintenanceAttachment,
  MaintenanceRequest,
  OliveiraNotification,
  OliveiraSettings,
  PaymentReceipt,
  Profile,
  Property,
  RentReceipt,
  TenantDocument,
  Tenancy,
} from "../lib/types";

type Tab =
  | "overview"
  | "leads"
  | "properties"
  | "tenants"
  | "contracts"
  | "payments"
  | "maintenance"
  | "emails"
  | "audit"
  | "settings";
type PropertyMedia = {
  id: string;
  storage_path: string;
  public_url: string;
  position: number;
};
type AdminProperty = Property & { media: PropertyMedia[] };
type AuditEntry = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};
const leadStatusLabels: Record<CommercialLeadStatus, string> = {
  new: "Novo",
  contacted: "Contatado",
  qualified: "Qualificado",
  converted: "Convertido",
  archived: "Arquivado",
};

const formatLeadPhone = (digits: string) => {
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `+${digits}`;
};
const emailStatusLabels: Record<string, string> = {
  pending: "Pendente",
  queued: "Na fila",
  sending: "Enviando",
  sent: "Aceito pelo provedor",
  delivered: "Entregue",
  delivery_delayed: "Entrega atrasada",
  failed: "Falhou",
  bounced: "Devolvido",
  complained: "Denunciado",
  suppressed: "Suprimido",
};

const deliveryStatus = (delivery: EmailDelivery | undefined) =>
  delivery?.operational_status ?? delivery?.status ?? "pending";

const canRetryDelivery = (delivery: EmailDelivery | undefined) =>
  ["failed", "bounced", "suppressed"].includes(deliveryStatus(delivery));
type AdminData = {
  leads: CommercialLead[];
  properties: AdminProperty[];
  tenants: Profile[];
  tenancies: Tenancy[];
  contracts: Contract[];
  templates: ContractTemplate[];
  installments: Installment[];
  receipts: PaymentReceipt[];
  rentReceipts: RentReceipt[];
  documents: TenantDocument[];
  maintenance: MaintenanceRequest[];
  attachments: MaintenanceAttachment[];
  notifications: OliveiraNotification[];
  emails: EmailDelivery[];
  audit: AuditEntry[];
  settings: OliveiraSettings | null;
};
const emptyData: AdminData = {
  leads: [],
  properties: [],
  tenants: [],
  tenancies: [],
  contracts: [],
  templates: [],
  installments: [],
  receipts: [],
  rentReceipts: [],
  documents: [],
  maintenance: [],
  attachments: [],
  notifications: [],
  emails: [],
  audit: [],
  settings: null,
};

export function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const pathPart = location.pathname.split("/")[2] ?? "";
  const tab: Tab =
    (
      {
        "": "overview",
        leads: "leads",
        imoveis: "properties",
        inquilinos: "tenants",
        locacoes: "contracts",
        contratos: "contracts",
        financeiro: "payments",
        manutencoes: "maintenance",
        emails: "emails",
        auditoria: "audit",
        configuracoes: "settings",
      } as Record<string, Tab>
    )[pathPart] ?? "overview";
  const tenantDetailId =
    location.pathname.match(/^\/admin\/inquilinos\/([^/]+)$/)?.[1] ?? "";
  const propertyDetailId =
    location.pathname.match(/^\/admin\/imoveis\/([^/]+)$/)?.[1] ?? "";
  const highlightedLeadId = new URLSearchParams(location.search).get("lead");
  const [data, setData] = useState<AdminData>(emptyData);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [tenantStatus, setTenantStatus] = useState<
    "all" | Profile["account_status"]
  >("active");
  const [auditSearch, setAuditSearch] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatus, setLeadStatus] = useState<"all" | CommercialLeadStatus>(
    "all",
  );
  const [showDeletedTenancies, setShowDeletedTenancies] = useState(false);
  const [showPropertyCreate, setShowPropertyCreate] = useState(false);

  const load = useCallback(async () => {
    const client = requireSupabase();
    const [
      leads,
      properties,
      tenants,
      tenancies,
      contracts,
      templates,
      installments,
      receipts,
      rentReceipts,
      documents,
      maintenance,
      attachments,
      notifications,
      emails,
      audit,
      settings,
    ] = await Promise.all([
      client.rpc("oliveira_list_commercial_leads"),
      client
        .from("oliveira_properties")
        .select(
          "*, oliveira_property_media(id,storage_path,public_url,position)",
        )
        .order("created_at"),
      client
        .from("oliveira_profiles")
        .select("*")
        .eq("role", "tenant")
        .order("full_name"),
      client
        .from("oliveira_tenancies")
        .select("*, property:oliveira_properties(title,address)")
        .order("created_at", { ascending: false }),
      client
        .from("oliveira_contracts")
        .select("*")
        .order("created_at", { ascending: false }),
      client
        .from("oliveira_contract_templates")
        .select("*")
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false }),
      client
        .from("oliveira_rent_installments")
        .select("*")
        .order("due_date", { ascending: false }),
      client
        .from("oliveira_payment_receipts")
        .select("*")
        .order("created_at", { ascending: false }),
      client
        .from("oliveira_rent_receipts")
        .select("*")
        .order("created_at", { ascending: false }),
      client
        .from("oliveira_tenant_documents")
        .select("*")
        .neq("status", "deleted")
        .order("created_at", { ascending: false }),
      client
        .from("oliveira_maintenance_requests")
        .select("*")
        .order("created_at", { ascending: false }),
      client
        .from("oliveira_maintenance_attachments")
        .select("*")
        .order("created_at", { ascending: false }),
      client
        .from("oliveira_notifications")
        .select("*")
        .eq("recipient_id", user?.id ?? "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: false })
        .limit(100),
      client.rpc("oliveira_list_email_delivery_summaries", { p_limit: 500 }),
      client
        .from("oliveira_audit_log")
        .select("id,actor_id,action,entity_type,entity_id,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      client.from("oliveira_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    const firstError = [
      leads,
      properties,
      tenants,
      tenancies,
      contracts,
      templates,
      installments,
      receipts,
      rentReceipts,
      documents,
      maintenance,
      attachments,
      notifications,
      emails,
      audit,
      settings,
    ].find((result) => result.error)?.error;
    if (firstError) throw firstError;
    setData({
      leads: (leads.data ?? []) as CommercialLead[],
      properties: (properties.data ?? []).map(
        (row: Record<string, unknown>) => {
          const media = [
            ...((row.oliveira_property_media as PropertyMedia[] | undefined) ??
              []),
          ].sort((a, b) => a.position - b.position);
          return {
            ...row,
            images: media.map((item) => item.public_url),
            media,
          } as AdminProperty;
        },
      ),
      tenants: (tenants.data ?? []) as Profile[],
      tenancies: (tenancies.data ?? []) as Tenancy[],
      contracts: (contracts.data ?? []) as Contract[],
      templates: (templates.data ?? []) as ContractTemplate[],
      installments: (installments.data ?? []) as Installment[],
      receipts: (receipts.data ?? []) as PaymentReceipt[],
      rentReceipts: (rentReceipts.data ?? []) as RentReceipt[],
      documents: (documents.data ?? []) as TenantDocument[],
      maintenance: (maintenance.data ?? []) as MaintenanceRequest[],
      attachments: (attachments.data ?? []) as MaintenanceAttachment[],
      notifications: (notifications.data ?? []) as OliveiraNotification[],
      emails: (emails.data ?? []) as EmailDelivery[],
      audit: (audit.data ?? []) as AuditEntry[],
      settings: settings.data as OliveiraSettings | null,
    });
  }, [user?.id]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch((error) => setMessage(error.message)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (tab !== "leads" || !user?.id) return;
    const unreadIds = data.notifications
      .filter(
        (notification) =>
          notification.event_type === "commercial_lead_created" &&
          !notification.read_at,
      )
      .map((notification) => notification.id);
    if (!unreadIds.length) return;
    void requireSupabase()
      .from("oliveira_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .then(({ error }) => {
        if (error) return;
        setData((current) => ({
          ...current,
          notifications: current.notifications.map((notification) =>
            unreadIds.includes(notification.id)
              ? { ...notification, read_at: new Date().toISOString() }
              : notification,
          ),
        }));
      });
  }, [data.notifications, tab, user?.id]);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operação não concluída.",
      );
    } finally {
      setBusy(false);
    }
  };
  const updateLead = async (
    event: FormEvent<HTMLFormElement>,
    lead: CommercialLead,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        invokeSecure("oliveira-lead-admin", {
          action: "update",
          lead_id: lead.id,
          status: form.get("status"),
          internal_note: form.get("internal_note"),
        }),
      "Acompanhamento comercial atualizado.",
    );
  };
  const totals = useMemo(
    () => ({
      newLeads: data.leads.filter((item) => item.status === "new").length,
      active: data.tenancies.filter((item) => item.status === "active").length,
      pendingContracts: data.contracts.filter(
        (item) => item.status === "pending_signature",
      ).length,
      pendingReceipts: data.receipts.filter(
        (item) => item.status === "under_review",
      ).length,
      pendingDocuments: data.documents.filter(
        (item) => item.status === "pending",
      ).length,
      openMaintenance: data.maintenance.filter((item) =>
        ["requested", "authorized", "completed"].includes(item.status),
      ).length,
      overdue: data.installments
        .filter((item) => item.status === "late")
        .reduce(
          (sum, item) =>
            sum +
            item.base_amount +
            item.fine_amount +
            item.interest_amount -
            item.credit_amount,
          0,
        ),
    }),
    [data],
  );
  const filteredLeads = useMemo(
    () =>
      data.leads.filter(
        (lead) =>
          (leadStatus === "all" || lead.status === leadStatus) &&
          `${lead.full_name} ${lead.email} ${lead.phone_digits}`
            .toLowerCase()
            .includes(leadSearch.toLowerCase()),
      ),
    [data.leads, leadSearch, leadStatus],
  );

  const saveProperty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const { error } = await requireSupabase()
        .from("oliveira_properties")
        .insert({
          title: form.get("title"),
          neighborhood: String(form.get("neighborhood"))
            .toLowerCase()
            .replace(/\s+/g, "-"),
          neighborhood_label: form.get("neighborhood"),
          address: form.get("address"),
          price: Number(form.get("price")),
          bedrooms: Number(form.get("bedrooms")),
          bathrooms: Number(form.get("bathrooms")),
          area: Number(form.get("area")),
          water_policy: form.get("water_policy"),
          electricity_policy: form.get("electricity_policy"),
          contact: form.get("contact"),
          active: form.get("availability_status") !== "archived",
          availability_status: form.get("availability_status"),
        });
      if (error) throw error;
      event.currentTarget.reset();
    }, "Imóvel cadastrado.");
  };
  const updateProperty = async (
    event: FormEvent<HTMLFormElement>,
    property: AdminProperty,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const occupied = data.tenancies.some(
        (item) => item.property_id === property.id && item.status === "active",
      );
      const availabilityStatus = occupied
        ? "rented"
        : String(
            form.get("availability_status") ?? property.availability_status,
          );
      const updated = await requireSupabase()
        .from("oliveira_properties")
        .update({
          title: form.get("title"),
          address: form.get("address"),
          price: Number(form.get("price")),
          water_policy: form.get("water_policy"),
          electricity_policy: form.get("electricity_policy"),
          availability_status: availabilityStatus,
          active: availabilityStatus !== "archived",
          updated_at: new Date().toISOString(),
        })
        .eq("id", property.id);
      if (updated.error) throw updated.error;
    }, "Imóvel atualizado.");
  };
  const toggleProperty = (property: AdminProperty) => {
    const occupied = data.tenancies.some(
      (item) => item.property_id === property.id && item.status === "active",
    );
    if (property.active && occupied) {
      setMessage(
        "Encerre ou cancele a locação ativa antes de arquivar o imóvel.",
      );
      return Promise.resolve();
    }
    return run(
      async () => {
        const updated = await requireSupabase()
          .from("oliveira_properties")
          .update({
            active: !property.active,
            availability_status: property.active
              ? "archived"
              : occupied
                ? "rented"
                : "available",
            updated_at: new Date().toISOString(),
          })
          .eq("id", property.id);
        if (updated.error) throw updated.error;
      },
      property.active ? "Imóvel arquivado." : "Imóvel reativado.",
    );
  };
  const importSeeds = () =>
    run(async () => {
      for (const item of seedProperties) {
        const property = {
          title: item.title,
          neighborhood: item.neighborhood,
          neighborhood_label: item.neighborhood_label,
          address: item.address,
          price: item.price,
          bedrooms: item.bedrooms,
          bathrooms: item.bathrooms,
          area: item.area,
          water_policy: item.water_policy,
          electricity_policy: item.electricity_policy,
          contact: item.contact,
          active: item.active,
        };
        const { error } = await requireSupabase()
          .from("oliveira_properties")
          .insert(property);
        if (error && error.code !== "23505") throw error;
      }
    }, "Imóveis iniciais importados. Envie as fotos pelo gerenciador.");
  const uploadPhoto = async (propertyId: string, files: FileList | null) => {
    if (!files?.length) return;
    await run(async () => {
      const client = requireSupabase();
      for (const [index, file] of Array.from(files).entries()) {
        const path = `${propertyId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const uploaded = await client.storage
          .from("oliveira-property-media")
          .upload(path, file, { upsert: false });
        if (uploaded.error) throw uploaded.error;
        const { data: publicUrl } = client.storage
          .from("oliveira-property-media")
          .getPublicUrl(path);
        const { error } = await client.from("oliveira_property_media").insert({
          property_id: propertyId,
          storage_path: path,
          public_url: publicUrl.publicUrl,
          position: index + 100,
        });
        if (error) throw error;
      }
    }, "Fotos enviadas.");
  };
  const removePhoto = (media: PropertyMedia) =>
    run(async () => {
      const client = requireSupabase();
      const storage = await client.storage
        .from("oliveira-property-media")
        .remove([media.storage_path]);
      if (storage.error) throw storage.error;
      const { error } = await client
        .from("oliveira_property_media")
        .delete()
        .eq("id", media.id);
      if (error) throw error;
    }, "Foto removida.");
  const movePhoto = (
    property: AdminProperty,
    index: number,
    direction: number,
  ) =>
    run(async () => {
      const otherIndex = index + direction;
      if (otherIndex < 0 || otherIndex >= property.media.length) return;
      const current = property.media[index];
      const other = property.media[otherIndex];
      const client = requireSupabase();
      const first = await client
        .from("oliveira_property_media")
        .update({ position: other.position })
        .eq("id", current.id);
      if (first.error) throw first.error;
      const second = await client
        .from("oliveira_property_media")
        .update({ position: current.position })
        .eq("id", other.id);
      if (second.error) throw second.error;
    }, "Ordem das fotos atualizada.");
  const inviteTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await run(
      () => invokeSecure("oliveira-invite-tenant", form),
      "Convite enviado ao inquilino.",
    );
  };
  const updateTenant = async (
    event: FormEvent<HTMLFormElement>,
    tenantId: string,
  ) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await run(
      () =>
        invokeSecure("oliveira-tenant-profile-admin", {
          action: "update",
          tenant_id: tenantId,
          ...form,
        }),
      "Cadastro atualizado.",
    );
  };
  const sendTenantRecovery = (tenant: Profile) =>
    run(
      () =>
        invokeSecure("oliveira-auth-email", {
          action: "recovery",
          email: tenant.email,
        }),
      "Se o envio estiver habilitado, as instruções de recuperação foram encaminhadas.",
    );
  const deleteTenant = (tenant: Profile) => {
    const confirmation = window.prompt(
      `Para excluir o acesso de ${tenant.full_name}, digite o e-mail completo:`,
      "",
    );
    if (confirmation?.trim().toLowerCase() !== tenant.email.toLowerCase()) {
      if (confirmation !== null)
        setMessage("Exclusão cancelada: o e-mail não corresponde.");
      return Promise.resolve();
    }
    return run(
      () =>
        invokeSecure("oliveira-tenant-profile-admin", {
          action: "delete",
          tenant_id: tenant.id,
        }),
      "Inquilino excluído da operação. O histórico foi preservado e o acesso bloqueado.",
    ).then(() => navigate("/admin/inquilinos"));
  };
  const restoreTenant = (tenant: Profile) =>
    run(
      () =>
        invokeSecure("oliveira-tenant-profile-admin", {
          action: "restore",
          tenant_id: tenant.id,
        }),
      "Cadastro e acesso do inquilino restaurados.",
    );
  const uploadTenantDocument = async (
    tenantId: string,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("tenant_id", tenantId);
    await run(
      () => invokeSecureForm("oliveira-tenant-documents", form),
      "Documento enviado e aprovado.",
    );
    event.currentTarget.reset();
  };
  const reviewDocument = (
    documentId: string,
    action: "approve" | "reject" | "delete",
  ) => {
    const note =
      action === "reject"
        ? window.prompt("Motivo da rejeição:", "")
        : action === "delete"
          ? window.prompt("Motivo da exclusão:", "Documento substituído")
          : "";
    if ((action === "reject" || action === "delete") && note === null)
      return Promise.resolve();
    return run(
      () =>
        invokeSecure("oliveira-tenant-documents", {
          action,
          document_id: documentId,
          note,
        }),
      action === "approve"
        ? "Documento aprovado."
        : action === "reject"
          ? "Documento rejeitado."
          : "Documento excluído.",
    );
  };
  const openPrivateFile = async (
    entityType: string,
    entityId: string,
    fileName = "arquivo",
  ) => {
    await run(async () => {
      const result = await invokeSecure<{ url: string }>(
        entityType === "tenant_document"
          ? "oliveira-tenant-documents"
          : "oliveira-private-file",
        entityType === "tenant_document"
          ? { action: "download", document_id: entityId }
          : { entity_type: entityType, entity_id: entityId },
      );
      if (!result?.url) throw new Error("Arquivo indisponível");
      window.open(result.url, "_blank", "noopener,noreferrer");
    }, `${fileName} aberto em nova aba.`);
  };
  const downloadReceipt = async (receipt: RentReceipt) => {
    await run(async () => {
      const result = await invokeSecure<{ url: string }>(
        "oliveira-private-file",
        { entity_type: "rent_receipt", entity_id: receipt.id },
      );
      if (!result?.url) throw new Error("Recibo indisponível");
      await downloadPrivateFile(
        result.url,
        `recibo-${receipt.receipt_number}.pdf`,
      );
    }, "Recibo baixado.");
  };
  const createTenancy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await run(
      () => invokeSecure("oliveira-create-tenancy", form),
      "Locação criada e parcelas geradas.",
    );
  };
  const configureDocuments = (tenancy: Tenancy) =>
    run(
      () =>
        invokeSecure("oliveira-tenancy-admin", {
          action: "documents",
          tenancy_id: tenancy.id,
          require_document_approval: !tenancy.require_document_approval,
          required_document_types: !tenancy.require_document_approval
            ? ["profile_photo", "rg_front", "rg_back"]
            : [],
        }),
      !tenancy.require_document_approval
        ? "Aprovação documental exigida."
        : "Exigência documental removida.",
    );
  const changeTenancyStatus = (
    tenancyId: string,
    action: "end" | "cancel" | "reactivate",
  ) => {
    if (!window.confirm("Confirmar alteração do status da locação?"))
      return Promise.resolve();
    return run(
      () =>
        invokeSecure("oliveira-tenancy-admin", {
          tenancy_id: tenancyId,
          action,
        }),
      "Locação atualizada.",
    );
  };
  const deleteTenancy = (tenancy: Tenancy) => {
    if (
      !window.confirm(
        "Excluir esta locação do uso operacional? Parcelas futuras serão canceladas e o histórico será preservado.",
      )
    )
      return Promise.resolve();
    return run(
      () =>
        invokeSecure("oliveira-tenancy-admin", {
          tenancy_id: tenancy.id,
          action: "delete",
        }),
      "Locação excluída. O histórico permanece preservado.",
    );
  };
  const restoreTenancy = (tenancy: Tenancy) =>
    run(
      () =>
        invokeSecure("oliveira-tenancy-admin", {
          tenancy_id: tenancy.id,
          action: "restore",
        }),
      "Locação restaurada como cancelada. Reative-a quando necessário.",
    );
  const decideReceipt = (receiptId: string, decision: "approve" | "reject") => {
    const note =
      decision === "reject"
        ? window.prompt("Informe o motivo da rejeição:", "")
        : window.prompt("Observação opcional:", "");
    if (decision === "reject" && !note) return Promise.resolve();
    return run(
      () =>
        invokeSecure("oliveira-payment-admin", {
          action: decision,
          receipt_id: receiptId,
          note,
        }),
      decision === "approve"
        ? "Pagamento aprovado e recibo gerado."
        : "Comprovante rejeitado.",
    );
  };
  const registerManualPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        invokeSecure("oliveira-payment-admin", {
          action: "manual",
          installment_id: form.get("installment_id"),
          amount: Number(form.get("amount")),
        }),
      "Pagamento manual registrado.",
    );
  };
  const decideMaintenance = (requestId: string, action: string) => {
    const amount =
      action === "authorize" || action === "credit"
        ? Number(
            window.prompt("Informe o limite/valor aprovado em reais:", "0"),
          )
        : undefined;
    const note = window.prompt("Registre uma orientação ou motivo:", "");
    if (note === null) return Promise.resolve();
    return run(
      () =>
        invokeSecure("oliveira-maintenance-admin", {
          request_id: requestId,
          action,
          amount,
          note,
        }),
      "Manutenção atualizada.",
    );
  };
  const createMaintenance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await run(
      () =>
        invokeSecure("oliveira-maintenance-admin", {
          action: "create",
          ...form,
        }),
      "Solicitação de manutenção cadastrada e enviada ao inquilino.",
    );
    event.currentTarget.reset();
  };
  const sendTestEmail = () =>
    run(
      () => invokeSecure("oliveira-email-admin", { action: "test" }),
      "E-mail de teste enviado para a conta administrativa.",
    );
  const retryEmail = (deliveryId: string) =>
    run(
      () =>
        invokeSecure("oliveira-email-admin", {
          action: "retry",
          delivery_id: deliveryId,
        }),
      "Nova tentativa de envio concluída.",
    );
  const exportAudit = () => {
    const escape = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["data", "acao", "entidade", "identificador", "ator"],
      ...data.audit.map((entry) => [
        entry.created_at,
        entry.action,
        entry.entity_type,
        entry.entity_id,
        entry.actor_id,
      ]),
    ];
    const blob = new Blob(
      ["\ufeff" + rows.map((row) => row.map(escape).join(";")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auditoria-imobiliaria-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const filteredTenants = data.tenants.filter(
    (tenant) =>
      (tenantStatus === "all" || tenant.account_status === tenantStatus) &&
      `${tenant.full_name} ${tenant.email}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selectedTenant = data.tenants.find(
    (tenant) => tenant.id === tenantDetailId,
  );
  const selectedTenantTenancies = data.tenancies.filter(
    (item) => item.tenant_id === tenantDetailId,
  );
  const selectedTenantDocuments = data.documents.filter(
    (item) => item.tenant_id === tenantDetailId,
  );
  const selectedProperty = data.properties.find(
    (property) => property.id === propertyDetailId,
  );

  return (
    <DashboardShell
      title={
        selectedTenant
          ? selectedTenant.full_name
          : selectedProperty
            ? selectedProperty.title
            : tab === "leads"
              ? "Leads comerciais"
              : "Painel administrativo"
      }
      subtitle={
        selectedTenant
          ? "Ficha documental e histórico do inquilino."
          : selectedProperty
            ? "Detalhes, situação, dados e galeria do imóvel."
            : tab === "leads"
              ? "Pedidos de implantação recebidos pela página pública."
              : "Imóveis, contratos e aluguéis sob controle do proprietário."
      }
      unread={totals.pendingDocuments + totals.newLeads}
    >
      {message && <div className="notice">{message}</div>}
      {tab === "overview" && (
        <>
          {totals.newLeads > 0 && (
            <Link className="admin-lead-alert" to="/admin/leads">
              <span>LE</span>
              <div>
                <strong>
                  {totals.newLeads} novo{totals.newLeads === 1 ? "" : "s"} pedido
                  {totals.newLeads === 1 ? "" : "s"} de implantação
                </strong>
                <small>Abra a central comercial para registrar o contato.</small>
              </div>
              <b aria-hidden="true">→</b>
            </Link>
          )}
          <section className="metric-grid admin-metrics">
            <article>
              <span>Novos pedidos</span>
              <strong>{totals.newLeads}</strong>
            </article>
            <article>
              <span>Locações ativas</span>
              <strong>{totals.active}</strong>
            </article>
            <article>
              <span>Valor vencido</span>
              <strong className="small-metric">
                R$ {totals.overdue.toFixed(2)}
              </strong>
            </article>
            <article>
              <span>Contratos aguardando</span>
              <strong>{totals.pendingContracts}</strong>
            </article>
            <article>
              <span>Documentos para revisar</span>
              <strong>{totals.pendingDocuments}</strong>
            </article>
            <article>
              <span>Comprovantes</span>
              <strong>{totals.pendingReceipts}</strong>
            </article>
            <article>
              <span>Manutenções abertas</span>
              <strong>{totals.openMaintenance}</strong>
            </article>
          </section>
          <section className="dashboard-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Prioridades</span>
                <h2>Central de pendências</h2>
              </div>
            </div>
            <div className="quick-action-grid">
              <Link to="/admin/leads">
                <strong>Responder novos leads</strong>
                <span>{totals.newLeads} aguardando contato</span>
              </Link>
              <Link to="/admin/inquilinos">
                <strong>Revisar documentos</strong>
                <span>{totals.pendingDocuments} aguardando análise</span>
              </Link>
              <Link to="/admin/financeiro">
                <strong>Conferir pagamentos</strong>
                <span>{totals.pendingReceipts} comprovantes recebidos</span>
              </Link>
              <Link to="/admin/contratos">
                <strong>Acompanhar contratos</strong>
                <span>{totals.pendingContracts} aguardando assinatura</span>
              </Link>
              <Link to="/admin/manutencoes">
                <strong>Responder manutenção</strong>
                <span>{totals.openMaintenance} solicitações abertas</span>
              </Link>
            </div>
          </section>
          <section className="dashboard-card">
            <h2>Atividade recente</h2>
            <div className="activity-feed">
              {data.audit.slice(0, 8).map((entry) => (
                <article key={entry.id}>
                  <span />
                  <div>
                    <strong>{entry.action.replaceAll(".", " ")}</strong>
                    <small>
                      {new Date(entry.created_at).toLocaleString("pt-BR")}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === "leads" && (
        <section className="dashboard-card commercial-leads-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Comercial</span>
              <h2>Pedidos de implantação</h2>
              <p>
                Contatos autorizados na página do sistema, sem exclusão do
                histórico.
              </p>
            </div>
            <span className="soft-badge">{filteredLeads.length} registros</span>
          </div>
          <div className="directory-filters lead-directory-filters">
            <input
              className="search-input"
              value={leadSearch}
              onChange={(event) => setLeadSearch(event.target.value)}
              placeholder="Buscar por nome, e-mail ou telefone"
              aria-label="Buscar leads comerciais"
            />
            <select
              aria-label="Filtrar leads por status"
              value={leadStatus}
              onChange={(event) =>
                setLeadStatus(event.target.value as typeof leadStatus)
              }
            >
              <option value="all">Todos os status</option>
              {(Object.entries(leadStatusLabels) as [CommercialLeadStatus, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ),
              )}
            </select>
          </div>
          <div className="commercial-lead-list">
            {filteredLeads.map((lead) => {
              const confirmation = data.emails.find(
                (delivery) =>
                  delivery.entity_type === "commercial_lead" &&
                  delivery.entity_id === lead.id &&
                  delivery.event_type === "commercial_lead_confirmation",
              );
              const adminDelivery = data.emails.find(
                (delivery) =>
                  delivery.entity_type === "commercial_lead" &&
                  delivery.entity_id === lead.id &&
                  delivery.event_type === "commercial_lead_admin" &&
                  delivery.recipient_email === user?.email,
              );
              const confirmationStatus = deliveryStatus(confirmation);
              const adminDeliveryStatus = deliveryStatus(adminDelivery);
              return (
                <article
                  id={`lead-${lead.id}`}
                  className={highlightedLeadId === lead.id ? "highlighted" : ""}
                  key={lead.id}
                >
                  <div className="commercial-lead-summary">
                    <div className="commercial-lead-avatar" aria-hidden="true">
                      {lead.full_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="commercial-lead-identity">
                      <div>
                        <strong>{lead.full_name}</strong>
                        <span className={`status lead-${lead.status}`}>
                          {leadStatusLabels[lead.status]}
                        </span>
                      </div>
                      <a href={`mailto:${lead.email}`}>{lead.email}</a>
                      <a href={`tel:+${lead.phone_digits}`}>
                        {formatLeadPhone(lead.phone_digits)}
                      </a>
                    </div>
                    <div className="commercial-lead-date">
                      <span>Recebido</span>
                      <strong>
                        {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                      </strong>
                      <small>
                        {new Date(lead.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                  </div>
                  <div className="commercial-lead-meta">
                    <span>Origem: {lead.source_path}</span>
                    {lead.utm_source && <span>Campanha: {lead.utm_source}</span>}
                    <span>
                      Consentimento: {new Date(lead.consent_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="commercial-email-state" aria-label="Situação dos e-mails">
                    <span>
                      Confirmação ao lead
                      <b className={`status ${confirmationStatus}`}>
                        {emailStatusLabels[confirmationStatus] ?? confirmationStatus}
                      </b>
                      {confirmation && canRetryDelivery(confirmation) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void retryEmail(confirmation.id)}
                        >
                          Reenviar
                        </button>
                      )}
                    </span>
                    <span>
                      Aviso administrativo
                      <b className={`status ${adminDeliveryStatus}`}>
                        {emailStatusLabels[adminDeliveryStatus] ?? adminDeliveryStatus}
                      </b>
                    </span>
                  </div>
                  <form
                    className="commercial-lead-form"
                    onSubmit={(event) => void updateLead(event, lead)}
                  >
                    <label>
                      Etapa comercial
                      <select name="status" defaultValue={lead.status}>
                        {(Object.entries(leadStatusLabels) as [CommercialLeadStatus, string][]).map(
                          ([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Observação interna
                      <textarea
                        name="internal_note"
                        defaultValue={lead.internal_note}
                        maxLength={2000}
                        rows={2}
                        placeholder="Registre o próximo passo sem incluir dados desnecessários."
                      />
                    </label>
                    <button className="primary-button" disabled={busy}>
                      Salvar acompanhamento
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
          {!filteredLeads.length && (
            <div className="empty-state compact">
              Nenhum pedido corresponde aos filtros selecionados.
            </div>
          )}
        </section>
      )}
      {tab === "properties" && !selectedProperty && (
        <>
          <section className="dashboard-card property-directory-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Visão geral</span>
                <h2>Imóveis</h2>
                <p>Selecione um imóvel para abrir dados, situação e galeria.</p>
              </div>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void importSeeds()}
                >
                  Importar atuais
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setShowPropertyCreate((current) => !current)}
                >
                  {showPropertyCreate ? "Fechar cadastro" : "+ Novo imóvel"}
                </button>
              </div>
            </div>
            <div className="minimal-property-grid">
              {data.properties.map((property) => {
                const occupied = data.tenancies.some(
                  (tenancy) =>
                    tenancy.property_id === property.id &&
                    tenancy.status === "active" &&
                    !tenancy.deleted_at,
                );
                return (
                  <Link
                    to={`/admin/imoveis/${property.id}`}
                    key={property.id}
                    className="minimal-property-card"
                  >
                    <div className="minimal-property-cover">
                      {property.media[0] ? (
                        <img src={property.media[0].public_url} alt="" />
                      ) : (
                        <span>Sem foto</span>
                      )}
                      <span
                        className={`status ${property.availability_status}`}
                      >
                        {occupied
                          ? "Alugado"
                          : property.availability_status === "available"
                            ? "Disponível"
                            : property.availability_status === "rented"
                              ? "Alugado"
                              : property.availability_status === "maintenance"
                                ? "Em manutenção"
                                : "Arquivado"}
                      </span>
                    </div>
                    <div>
                      <strong>{property.title}</strong>
                      <p>{property.neighborhood_label}</p>
                      <small>
                        R$ {property.price.toFixed(2)} • {property.media.length}{" "}
                        fotos
                      </small>
                    </div>
                    <span className="minimal-card-arrow">→</span>
                  </Link>
                );
              })}
            </div>
          </section>
          {showPropertyCreate && (
            <PropertyCreateForm
              busy={busy}
              onSubmit={(event) => void saveProperty(event)}
            />
          )}
        </>
      )}
      {tab === "properties" && selectedProperty && (
        <div className="split-panel">
          <button
            className="text-button back-button property-detail-back"
            type="button"
            onClick={() => navigate("/admin/imoveis")}
          >
            ← Voltar para imóveis
          </button>
          <section className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Detalhes do imóvel</h2>
                <p>Edite informações, situação e ordem das fotos.</p>
              </div>
            </div>
            <div className="property-manager">
              {data.properties
                .filter((property) => property.id === selectedProperty.id)
                .map((property) => (
                  <article key={property.id}>
                    <div className="property-manager-heading">
                      <div>
                        <strong>{property.title}</strong>
                        <small>
                          {property.address} • R$ {property.price}
                        </small>
                        <span
                          className={`status ${property.availability_status}`}
                        >
                          {property.availability_status === "rented"
                            ? "Alugado"
                            : property.availability_status === "available"
                              ? "Disponível"
                              : property.availability_status === "maintenance"
                                ? "Em manutenção"
                                : "Arquivado"}
                        </span>
                      </div>
                      <div className="action-row">
                        <label className="upload-button">
                          Adicionar fotos
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) =>
                              void uploadPhoto(property.id, event.target.files)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void toggleProperty(property)}
                        >
                          {property.active ? "Arquivar" : "Reativar"}
                        </button>
                      </div>
                    </div>
                    <div className="media-manager">
                      {property.media.map((media, index) => (
                        <div key={media.id}>
                          <img src={media.public_url} alt="" />
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                void movePhoto(property, index, -1)
                              }
                              aria-label="Mover foto para esquerda"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              onClick={() => void movePhoto(property, index, 1)}
                              aria-label="Mover foto para direita"
                            >
                              →
                            </button>
                            <button
                              type="button"
                              onClick={() => void removePhoto(media)}
                              aria-label="Excluir foto"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <details className="inline-edit-panel">
                      <summary>Editar informações</summary>
                      <form
                        className="stack-form compact"
                        onSubmit={(event) =>
                          void updateProperty(event, property)
                        }
                      >
                        <label>
                          Título
                          <input
                            name="title"
                            defaultValue={property.title}
                            required
                          />
                        </label>
                        <label>
                          Endereço
                          <input
                            name="address"
                            defaultValue={property.address}
                            required
                          />
                        </label>
                        <label>
                          Aluguel
                          <input
                            name="price"
                            type="number"
                            min="0"
                            defaultValue={property.price}
                            required
                          />
                        </label>
                        <div className="form-grid">
                          <label>
                            Situação
                            <select
                              name="availability_status"
                              defaultValue={property.availability_status}
                              disabled={data.tenancies.some(
                                (item) =>
                                  item.property_id === property.id &&
                                  item.status === "active",
                              )}
                            >
                              <option value="available">Disponível</option>
                              <option value="rented">Alugado</option>
                              <option value="maintenance">Em manutenção</option>
                              <option value="archived">Arquivado</option>
                            </select>
                            {data.tenancies.some(
                              (item) =>
                                item.property_id === property.id &&
                                item.status === "active",
                            ) && (
                              <small>
                                Situação controlada pela locação ativa.
                              </small>
                            )}
                          </label>
                          <label>
                            Água
                            <select
                              name="water_policy"
                              defaultValue={property.water_policy}
                            >
                              <option value="included">Inclusa</option>
                              <option value="individual">Individual</option>
                              <option value="shared">Rateada</option>
                            </select>
                          </label>
                          <label>
                            Luz
                            <select
                              name="electricity_policy"
                              defaultValue={property.electricity_policy}
                            >
                              <option value="included">Inclusa</option>
                              <option value="individual">Individual</option>
                              <option value="shared">Rateada</option>
                            </select>
                          </label>
                        </div>
                        <button className="primary-button" disabled={busy}>
                          Salvar imóvel
                        </button>
                      </form>
                    </details>
                  </article>
                ))}
            </div>
          </section>
          <aside className="dashboard-card property-operation-summary">
            <span className="eyebrow">Resumo operacional</span>
            <h2>{selectedProperty.title}</h2>
            <dl>
              <div>
                <dt>Situação</dt>
                <dd>{selectedProperty.availability_status}</dd>
              </div>
              <div>
                <dt>Aluguel</dt>
                <dd>R$ {selectedProperty.price.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Fotos</dt>
                <dd>{selectedProperty.media.length}</dd>
              </div>
              <div>
                <dt>Ocupação</dt>
                <dd>
                  {data.tenancies.some(
                    (tenancy) =>
                      tenancy.property_id === selectedProperty.id &&
                      tenancy.status === "active" &&
                      !tenancy.deleted_at,
                  )
                    ? "Com locação ativa"
                    : "Sem locação ativa"}
                </dd>
              </div>
            </dl>
            <Link className="secondary-button" to="/admin/locacoes">
              Abrir locações
            </Link>
          </aside>
        </div>
      )}
      {tab === "tenants" && selectedTenant && (
        <>
          <button
            className="text-button back-button"
            type="button"
            onClick={() => navigate("/admin/inquilinos")}
          >
            ← Voltar para inquilinos
          </button>
          <section className="tenant-profile-hero dashboard-card">
            <div className="profile-avatar large">
              {selectedTenant.full_name.slice(0, 1)}
            </div>
            <div>
              <span className="eyebrow">Ficha do inquilino</span>
              <h2>{selectedTenant.full_name}</h2>
              <p>
                {selectedTenant.email} •{" "}
                {selectedTenant.phone || "sem telefone"}
              </p>
            </div>
            <div className="status-stack">
              <span className={`status ${selectedTenant.account_status}`}>
                {selectedTenant.account_status === "active"
                  ? "Acesso ativo"
                  : selectedTenant.account_status === "disabled"
                    ? "Acesso desativado"
                    : "Excluído"}
              </span>
              <span className={`status ${selectedTenant.document_status}`}>
                Documentos: {selectedTenant.document_status}
              </span>
            </div>
          </section>
          <div className="split-panel tenant-detail-grid">
            <section className="dashboard-card">
              <h2>Dados cadastrais</h2>
              <form
                className="stack-form"
                onSubmit={(event) =>
                  void updateTenant(event, selectedTenant.id)
                }
              >
                <label>
                  Nome completo
                  <input
                    name="full_name"
                    defaultValue={selectedTenant.full_name}
                    required
                  />
                </label>
                <label>
                  E-mail de acesso
                  <input
                    name="email"
                    type="email"
                    defaultValue={selectedTenant.email}
                    autoComplete="off"
                    readOnly
                    required
                  />
                  <small>
                    A troca de e-mail exige confirmação pelo próprio inquilino.
                  </small>
                </label>
                <label>
                  Telefone
                  <input
                    name="phone"
                    defaultValue={selectedTenant.phone ?? ""}
                  />
                </label>
                <label>
                  CPF
                  <input
                    name="cpf"
                    placeholder={selectedTenant.cpf_masked ?? "Não informado"}
                  />
                </label>
                <button className="primary-button" disabled={busy}>
                  Salvar cadastro
                </button>
              </form>
            </section>
            <section className="dashboard-card access-management-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Acesso do inquilino</span>
                  <h2>Login e recuperação</h2>
                  <p>
                    O administrador não define nem recebe senhas. Um novo link
                    pessoal pode ser enviado ao e-mail confirmado.
                  </p>
                </div>
              </div>
              <button
                className="secondary-button full-button"
                type="button"
                disabled={busy}
                onClick={() => void sendTenantRecovery(selectedTenant)}
              >
                Enviar recuperação por e-mail
              </button>
              {selectedTenant.account_status === "deleted" ? (
                <button
                  className="secondary-button full-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void restoreTenant(selectedTenant)}
                >
                  Restaurar cadastro e acesso
                </button>
              ) : (
                <button
                  className="danger-button full-button"
                  type="button"
                  disabled={
                    busy ||
                    selectedTenantTenancies.some(
                      (tenancy) => tenancy.status === "active",
                    )
                  }
                  onClick={() => void deleteTenant(selectedTenant)}
                >
                  Excluir inquilino
                </button>
              )}
              {selectedTenantTenancies.some(
                (tenancy) => tenancy.status === "active",
              ) && (
                <small>
                  Encerre ou cancele a locação ativa antes de excluir o
                  inquilino.
                </small>
              )}
            </section>
            <section className="dashboard-card">
              <div className="card-heading">
                <div>
                  <h2>Documentos privados</h2>
                  <p>Envios do admin são aprovados imediatamente.</p>
                </div>
                <span className="soft-badge">
                  {selectedTenantDocuments.length} arquivos
                </span>
              </div>
              <form
                className="document-upload-form"
                onSubmit={(event) =>
                  void uploadTenantDocument(selectedTenant.id, event)
                }
              >
                <select name="document_type" required>
                  <option value="profile_photo">Foto de perfil</option>
                  <option value="rg_front">RG frente</option>
                  <option value="rg_back">RG verso</option>
                  <option value="cpf">CPF</option>
                  <option value="proof_of_address">
                    Comprovante de residência
                  </option>
                  <option value="other">Outro</option>
                </select>
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  required
                />
                <button className="primary-button" disabled={busy}>
                  Enviar arquivo
                </button>
              </form>
              <div className="document-list">
                {selectedTenantDocuments.map((document) => (
                  <article key={document.id}>
                    <div className="document-type-icon">
                      {document.mime_type === "application/pdf" ? "PDF" : "IMG"}
                    </div>
                    <div>
                      <strong>{document.display_name}</strong>
                      <small>
                        {document.document_type.replaceAll("_", " ")} •{" "}
                        {(document.size_bytes / 1024).toFixed(0)} KB
                      </small>
                      {document.review_note && (
                        <small>{document.review_note}</small>
                      )}
                    </div>
                    <span className={`status ${document.status}`}>
                      {document.status}
                    </span>
                    <div className="action-row">
                      <button
                        type="button"
                        onClick={() =>
                          void openPrivateFile(
                            "tenant_document",
                            document.id,
                            document.display_name,
                          )
                        }
                      >
                        Abrir
                      </button>
                      {document.status === "pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void reviewDocument(document.id, "approve")
                            }
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void reviewDocument(document.id, "reject")
                            }
                          >
                            Rejeitar
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void reviewDocument(document.id, "delete")
                        }
                      >
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <section className="dashboard-card">
            <h2>Locações e histórico</h2>
            <div className="management-list">
              {selectedTenantTenancies.map((tenancy) => (
                <article key={tenancy.id}>
                  <div>
                    <strong>{tenancy.property?.title}</strong>
                    <small>
                      {tenancy.starts_on} a {tenancy.ends_on} • R${" "}
                      {tenancy.monthly_rent.toFixed(2)}
                    </small>
                  </div>
                  <span className={`status ${tenancy.status}`}>
                    {tenancy.status}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === "tenants" && !selectedTenant && (
        <div className="split-panel">
          <section className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Inquilinos</h2>
                <p>Abra uma ficha para consultar documentos e operação.</p>
              </div>
              <span className="soft-badge">
                {filteredTenants.length} registros
              </span>
            </div>
            <div className="directory-filters">
              <input
                className="search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou e-mail"
              />
              <select
                aria-label="Filtrar situação do cadastro"
                value={tenantStatus}
                onChange={(event) =>
                  setTenantStatus(event.target.value as typeof tenantStatus)
                }
              >
                <option value="active">Ativos</option>
                <option value="disabled">Desativados</option>
                <option value="deleted">Excluídos</option>
                <option value="all">Todos</option>
              </select>
            </div>
            <div className="tenant-directory">
              {filteredTenants.map((tenant) => (
                <Link to={`/admin/inquilinos/${tenant.id}`} key={tenant.id}>
                  <div className="profile-avatar">
                    {tenant.full_name.slice(0, 1)}
                  </div>
                  <div>
                    <strong>{tenant.full_name}</strong>
                    <small>
                      {tenant.email} • {tenant.phone || "sem telefone"}
                    </small>
                  </div>
                  <span className={`status ${tenant.account_status}`}>
                    {tenant.account_status === "active"
                      ? "Ativo"
                      : tenant.account_status === "disabled"
                        ? "Desativado"
                        : "Excluído"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
          <section className="dashboard-card">
            <h2>Convidar inquilino</h2>
            <form
              className="stack-form"
              onSubmit={(event) => void inviteTenant(event)}
            >
              <label>
                Nome completo
                <input name="full_name" required />
              </label>
              <label>
                E-mail
                <input name="email" type="email" required />
              </label>
              <label>
                Telefone
                <input name="phone" />
              </label>
              <label>
                CPF
                <input name="cpf" inputMode="numeric" />
              </label>
              <button className="primary-button" disabled={busy}>
                Cadastrar e enviar convite
              </button>
            </form>
          </section>
        </div>
      )}
      {tab === "contracts" && pathPart === "locacoes" && (
        <>
          <TenancyCreateForm
            tenants={data.tenants}
            properties={data.properties}
            busy={busy}
            onSubmit={(event) => void createTenancy(event)}
            title="Nova locação"
            description="Escolha o inquilino e o imóvel; o sistema cria o vínculo e gera as parcelas."
            submitLabel="Criar locação e parcelas"
          />
          <section className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Locações</h2>
                <p>Ciclo de vida, regras e documentação obrigatória.</p>
              </div>
              <div className="action-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowDeletedTenancies((current) => !current)}
                >
                  {showDeletedTenancies ? "Ocultar excluídas" : "Ver excluídas"}
                </button>
                <span className="soft-badge">
                  {data.tenancies.filter((item) => !item.deleted_at).length}{" "}
                  ativas no histórico
                </span>
              </div>
            </div>
            <div className="tenancy-cards">
              {data.tenancies
                .filter((tenancy) =>
                  showDeletedTenancies
                    ? Boolean(tenancy.deleted_at)
                    : !tenancy.deleted_at,
                )
                .map((tenancy) => {
                  const tenant = data.tenants.find(
                    (item) => item.id === tenancy.tenant_id,
                  );
                  return (
                    <article key={tenancy.id}>
                      <div>
                        <span className="eyebrow">
                          {tenancy.property?.title}
                        </span>
                        <h3>{tenant?.full_name}</h3>
                        <p>
                          {new Date(
                            `${tenancy.starts_on}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}{" "}
                          a{" "}
                          {new Date(
                            `${tenancy.ends_on}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <dl>
                        <div>
                          <dt>Aluguel</dt>
                          <dd>R$ {tenancy.monthly_rent.toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt>Vencimento</dt>
                          <dd>Dia {tenancy.due_day}</dd>
                        </div>
                        <div>
                          <dt>Documentos</dt>
                          <dd>
                            {tenancy.require_document_approval
                              ? "Obrigatórios"
                              : "Sem bloqueio"}
                          </dd>
                        </div>
                      </dl>
                      <div className="action-row">
                        {tenancy.deleted_at ? (
                          <button
                            type="button"
                            onClick={() => void restoreTenancy(tenancy)}
                          >
                            Restaurar locação
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void configureDocuments(tenancy)}
                            >
                              {tenancy.require_document_approval
                                ? "Remover exigência"
                                : "Exigir documentos"}
                            </button>
                            {tenancy.status === "active" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void changeTenancyStatus(tenancy.id, "end")
                                  }
                                >
                                  Encerrar
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void changeTenancyStatus(
                                      tenancy.id,
                                      "cancel",
                                    )
                                  }
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void changeTenancyStatus(
                                    tenancy.id,
                                    "reactivate",
                                  )
                                }
                              >
                                Reativar
                              </button>
                            )}
                            <button
                              className="danger-button"
                              type="button"
                              onClick={() => void deleteTenancy(tenancy)}
                            >
                              Excluir locação
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        </>
      )}
      {tab === "contracts" && pathPart !== "locacoes" && (
        <ContractsPanel
          busy={busy}
          tenants={data.tenants}
          properties={data.properties}
          tenancies={data.tenancies.filter((item) => !item.deleted_at)}
          contracts={data.contracts}
          templates={data.templates}
          settings={data.settings}
          onCreateTenancy={(event) => void createTenancy(event)}
          onReload={load}
        />
      )}
      {tab === "payments" && (
        <>
          <AdminBillingPanel />
          <section className="dashboard-card">
            <h2>Registrar pagamento recebido fora do sistema</h2>
            <form
              className="inline-upload"
              onSubmit={(event) => void registerManualPayment(event)}
            >
              <select name="installment_id" required>
                <option value="">Selecione a parcela</option>
                {data.installments
                  .filter((item) =>
                    ["pending", "late", "rejected", "under_review"].includes(
                      item.status,
                    ),
                  )
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.reference_month} • R$ {item.base_amount}
                    </option>
                  ))}
              </select>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Valor recebido"
                required
              />
              <button className="primary-button" disabled={busy}>
                Marcar como pago
              </button>
            </form>
          </section>
          <section className="dashboard-card">
            <h2>Comprovantes recebidos</h2>
            <div className="responsive-table mobile-card-table">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td data-label="Data">
                        {new Date(receipt.created_at).toLocaleDateString(
                          "pt-BR",
                        )}
                      </td>
                      <td data-label="Valor">R$ {receipt.amount.toFixed(2)}</td>
                      <td data-label="Status">
                        <span className={`status ${receipt.status}`}>
                          {receipt.status}
                        </span>
                      </td>
                      <td data-label="Ações">
                        <button
                          type="button"
                          onClick={() =>
                            void openPrivateFile(
                              "payment_receipt",
                              receipt.id,
                              "Comprovante",
                            )
                          }
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void decideReceipt(receipt.id, "approve")
                          }
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void decideReceipt(receipt.id, "reject")
                          }
                        >
                          Rejeitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="dashboard-card">
            <h2>Recibos emitidos</h2>
            <div className="management-list">
              {data.rentReceipts.map((receipt) => (
                <article key={receipt.id}>
                  <div>
                    <strong>{receipt.receipt_number}</strong>
                    <small>
                      R$ {receipt.amount.toFixed(2)} •{" "}
                      {new Date(receipt.paid_at).toLocaleDateString("pt-BR")}
                    </small>
                  </div>
                  <button
                    className="table-action"
                    type="button"
                    onClick={() => void downloadReceipt(receipt)}
                  >
                    Baixar PDF
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === "maintenance" && (
        <>
          <section className="dashboard-card maintenance-create-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Cadastro administrativo</span>
                <h2>Nova solicitação de manutenção</h2>
                <p>
                  Registre uma ocorrência identificada pelo proprietário e
                  notifique o inquilino.
                </p>
              </div>
            </div>
            <form
              className="stack-form"
              onSubmit={(event) => void createMaintenance(event)}
            >
              <label>
                Locação ativa
                <select name="tenancy_id" required>
                  <option value="">Selecione o imóvel e o inquilino</option>
                  {data.tenancies
                    .filter((item) => item.status === "active")
                    .map((tenancy) => {
                      const tenant = data.tenants.find(
                        (item) => item.id === tenancy.tenant_id,
                      );
                      return (
                        <option key={tenancy.id} value={tenancy.id}>
                          {tenancy.property?.title} — {tenant?.full_name}
                        </option>
                      );
                    })}
                </select>
              </label>
              <label>
                Título
                <input
                  name="title"
                  minLength={4}
                  placeholder="Ex.: Verificação de vazamento"
                  required
                />
              </label>
              <label>
                Descrição
                <textarea
                  name="description"
                  rows={4}
                  minLength={10}
                  placeholder="Descreva o problema, local e providência necessária."
                  required
                />
              </label>
              <label>
                Orientação inicial do proprietário
                <textarea name="owner_note" rows={2} placeholder="Opcional" />
              </label>
              <button className="primary-button" disabled={busy}>
                Cadastrar solicitação
              </button>
            </form>
          </section>
          <section className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Solicitações de manutenção</h2>
                <p>
                  Autorizações, comprovantes e créditos ficam na linha do tempo.
                </p>
              </div>
              <span className="soft-badge">
                {totals.openMaintenance} abertas
              </span>
            </div>
            <div className="maintenance-timeline admin-maintenance">
              {data.maintenance.map((request) => (
                <article key={request.id}>
                  <div className="timeline-marker" />
                  <div>
                    <div className="card-heading">
                      <div>
                        <strong>{request.title}</strong>
                        <small>{request.description}</small>
                      </div>
                      <span className={`status ${request.status}`}>
                        {request.status}
                      </span>
                      <span className="soft-badge">
                        {request.source === "admin"
                          ? "Criada pelo admin"
                          : "Enviada pelo inquilino"}
                      </span>
                    </div>
                    {request.owner_note && (
                      <div className="owner-note">
                        Orientação: {request.owner_note}
                      </div>
                    )}
                    <div className="attachment-links">
                      {data.attachments
                        .filter((file) => file.request_id === request.id)
                        .map((file) => (
                          <button
                            key={file.id}
                            onClick={() =>
                              void openPrivateFile(
                                "maintenance_attachment",
                                file.id,
                                file.display_name,
                              )
                            }
                          >
                            {file.display_name}
                          </button>
                        ))}
                    </div>
                    <div className="action-row">
                      <button
                        type="button"
                        onClick={() =>
                          void decideMaintenance(request.id, "authorize")
                        }
                      >
                        Autorizar limite
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void decideMaintenance(request.id, "credit")
                        }
                      >
                        Aprovar crédito
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void decideMaintenance(request.id, "reject")
                        }
                      >
                        Rejeitar
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === "emails" && (
        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>E-mails automáticos</h2>
              <p>
                Histórico do Resend, tentativas e falhas da Imobiliária
                Oliveira.
              </p>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void sendTestEmail()}
            >
              Enviar teste
            </button>
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Evento</th>
                  <th>Destinatário</th>
                  <th>Status</th>
                  <th>Tentativas</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.emails.map((email) => (
                  <tr key={email.id}>
                    <td>
                      {new Date(email.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td>
                      <strong>{email.event_type}</strong>
                      <small className="table-note">{email.subject}</small>
                    </td>
                    <td>{email.recipient_email}</td>
                    <td>
                      <span className={`status ${email.status}`}>
                        {email.operational_status ?? email.status}
                      </span>
                      {email.error_message && (
                        <small className="email-error">
                          {email.error_message}
                        </small>
                      )}
                    </td>
                    <td>{email.attempts}</td>
                    <td>
                      {email.status === "failed" &&
                      ![
                        "tenant_invite",
                        "password_recovery",
                        "signature_otp",
                      ].includes(email.event_type) ? (
                        <button
                          type="button"
                          onClick={() => void retryEmail(email.id)}
                        >
                          Reenviar
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.emails.length === 0 && (
            <p className="muted">Nenhum e-mail registrado.</p>
          )}
        </section>
      )}
      {tab === "audit" && (
        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>Auditoria</h2>
              <p>Registro pesquisável das operações protegidas.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={exportAudit}
            >
              Exportar CSV
            </button>
          </div>
          <input
            className="search-input"
            value={auditSearch}
            onChange={(event) => setAuditSearch(event.target.value)}
            placeholder="Filtrar por ação, entidade ou identificador"
          />
          <div className="responsive-table mobile-card-table">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>Identificador</th>
                </tr>
              </thead>
              <tbody>
                {data.audit
                  .filter((entry) =>
                    `${entry.action} ${entry.entity_type} ${entry.entity_id}`
                      .toLowerCase()
                      .includes(auditSearch.toLowerCase()),
                  )
                  .map((entry) => (
                    <tr key={entry.id}>
                      <td data-label="Data">
                        {new Date(entry.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td data-label="Ação">
                        {entry.action.replaceAll(".", " ")}
                      </td>
                      <td data-label="Entidade">{entry.entity_type}</td>
                      <td data-label="ID">{entry.entity_id}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "settings" && (
        <SettingsPanel busy={busy} run={run} settings={data.settings} />
      )}
    </DashboardShell>
  );
}

function SettingsPanel({
  busy,
  run,
  settings,
}: {
  busy: boolean;
  run: (action: () => Promise<unknown>, success: string) => Promise<void>;
  settings: OliveiraSettings | null;
}) {
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        invokeSecure("oliveira-settings-admin", {
          ...Object.fromEntries(form),
          email_enabled: form.get("email_enabled") === "on",
          rent_due_email_enabled:
            form.get("rent_due_email_enabled") === "on",
          email_send_hour: Number(form.get("email_send_hour")),
        }),
      "Configurações salvas.",
    );
  };
  if (!settings)
    return (
      <section className="dashboard-card">
        <p>Carregando configurações...</p>
      </section>
    );
  return (
    <section className="dashboard-card narrow-card">
      <h2>Pagamento, emissor e e-mails</h2>
      <p className="muted">
        Nunca coloque senha bancária ou chave secreta. O remetente utiliza o
        domínio já validado da PlayTecno.
      </p>
      <form className="stack-form" onSubmit={(event) => void save(event)}>
        <label>
          Nome do locador/emissor
          <input
            name="landlord_name"
            defaultValue={settings.landlord_name}
            required
          />
        </label>
        <label>
          CPF do locador
          <input
            name="landlord_tax_id"
            defaultValue={settings.landlord_tax_id}
            required
          />
        </label>
        <label>
          Chave PIX ou instrução de transferência
          <textarea
            name="payment_instructions"
            rows={4}
            defaultValue={settings.payment_instructions}
            required
          />
        </label>
        <label>
          Foro do contrato
          <input
            name="jurisdiction"
            defaultValue={settings.jurisdiction}
            required
          />
        </label>
        <hr />
        <label className="check-label">
          <input
            type="checkbox"
            name="email_enabled"
            defaultChecked={settings.email_enabled}
          />
          <span>Ativar e-mails automáticos</span>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            name="rent_due_email_enabled"
            defaultChecked={settings.rent_due_email_enabled}
          />
          <span>Enviar cobrança no dia do vencimento</span>
        </label>
        <label>
          Nome do remetente
          <input
            name="email_from_name"
            defaultValue={settings.email_from_name}
            required
          />
        </label>
        <label>
          E-mail remetente
          <input
            name="email_from_address"
            type="email"
            defaultValue={settings.email_from_address}
            required
          />
        </label>
        <label>
          Responder para
          <input
            name="email_reply_to"
            type="email"
            defaultValue={settings.email_reply_to}
            required
          />
        </label>
        <label>
          Cópia administrativa
          <input
            name="email_admin_copy"
            type="email"
            defaultValue={settings.email_admin_copy}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Horário
            <input
              name="email_send_hour"
              type="number"
              min="0"
              max="23"
              defaultValue={settings.email_send_hour}
              required
            />
          </label>
          <label>
            Fuso
            <input
              name="email_timezone"
              defaultValue={settings.email_timezone}
              readOnly
            />
          </label>
        </div>
        <button className="primary-button" disabled={busy}>
          Salvar configurações
        </button>
      </form>
    </section>
  );
}
