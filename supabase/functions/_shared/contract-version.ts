type ContractData = Record<string, string | number>;
type TenantData = { tenant_name: string; tenant_tax_id: string; tenant_email: string };

export function buildContractVersion(initialContent: ContractData, previousContent: ContractData | null, tenant: TenantData): ContractData {
  return {
    ...(previousContent ?? initialContent),
    template_version: "oliveira-residential-v2",
    ...tenant,
  };
}

