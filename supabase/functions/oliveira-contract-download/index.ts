import {
  isOliveiraAdmin,
  json,
  requireUser,
  serve,
  serviceClient,
} from "../_shared/http.ts";

serve(async (request) => {
  const user = await requireUser(request);
  const { contract_id: contractId } = await request.json();
  const client = serviceClient();
  const { data: contract, error } = await client
    .from("oliveira_contracts")
    .select("pdf_path, tenancy:oliveira_tenancies(tenant_id)")
    .eq("id", contractId)
    .single();
  if (error || !contract?.pdf_path)
    throw error ?? new Error("PDF indisponível");
  const isAdmin = await isOliveiraAdmin(user);
  if (!isAdmin && contract.tenancy.tenant_id !== user.id)
    throw new Error("Acesso negado");
  const signed = await client.storage
    .from("oliveira-private-documents")
    .createSignedUrl(contract.pdf_path, 120);
  if (signed.error) throw signed.error;
  return json({ url: signed.data.signedUrl, expires_in: 120 });
});
