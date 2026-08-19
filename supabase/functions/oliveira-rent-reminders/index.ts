import { formatDate, formatMoney, sendOliveiraEmail } from "../_shared/email.ts";
import { rentDueIdempotencyKey, rentEmailTotal, saoPauloDate, shouldSendRentDue } from "../_shared/email-rules.ts";
import { audit, json, serve, serviceClient } from "../_shared/http.ts";

serve(async (request) => {
  const client = serviceClient();
  const suppliedSecret = request.headers.get("x-oliveira-cron-secret") ?? "";
  const validation = await client.rpc("oliveira_validate_cron_secret", { p_secret: suppliedSecret });
  if (validation.error || validation.data !== true) return json({ error: "Acesso negado" }, 401);

  const today = saoPauloDate();
  await client.rpc("oliveira_mark_overdue_installments");
  const { data: settings, error: settingsError } = await client.from("oliveira_settings").select("email_enabled,rent_due_email_enabled,payment_instructions").eq("id", 1).single();
  if (settingsError) throw settingsError;
  if (!settings.email_enabled || !settings.rent_due_email_enabled) return json({ date: today, disabled: true, sent: 0 });

  const { data: installments, error } = await client
    .from("oliveira_rent_installments")
    .select("*, tenancy:oliveira_tenancies(id,tenant_id,property:oliveira_properties(title,address),tenant:oliveira_profiles(email,full_name))")
    .eq("due_date", today)
    .in("status", ["upcoming", "pending", "rejected"]);
  if (error) throw error;

  const ids = (installments ?? []).map((item) => item.id);
  const underReview = new Set<string>();
  if (ids.length) {
    const receipts = await client.from("oliveira_payment_receipts").select("installment_id").in("installment_id", ids).eq("status", "under_review");
    if (receipts.error) throw receipts.error;
    for (const receipt of receipts.data ?? []) underReview.add(receipt.installment_id);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const installment of installments ?? []) {
    if (!shouldSendRentDue(installment.status, installment.due_date, today, underReview.has(installment.id))) { skipped += 1; continue; }
    const tenancy = installment.tenancy;
    const tenant = tenancy?.tenant;
    const property = tenancy?.property;
    if (!tenant?.email) { skipped += 1; continue; }
    if (installment.status === "upcoming") await client.from("oliveira_rent_installments").update({ status: "pending" }).eq("id", installment.id).eq("status", "upcoming");
    const total = rentEmailTotal(Number(installment.base_amount), Number(installment.fine_amount), Number(installment.interest_amount), Number(installment.credit_amount));
    const delivery = await sendOliveiraEmail({
      eventType: "rent_due",
      recipientEmail: tenant.email,
      subject: `Aluguel vence hoje — ${property?.title ?? "Imobiliária Oliveira"}`,
      entityType: "installment",
      entityId: installment.id,
      tenancyId: tenancy.id,
      installmentId: installment.id,
      idempotencyKey: rentDueIdempotencyKey(installment.id, today),
      template: {
        preheader: `Seu aluguel de ${installment.reference_month} vence hoje.`,
        heading: "Seu aluguel vence hoje",
        greeting: `Olá, ${tenant.full_name}.`,
        paragraphs: ["Este é o lembrete mensal da sua locação. O pagamento continua sendo realizado fora do sistema."],
        fields: [
          { label: "Imóvel", value: property?.title ?? "Imóvel locado" },
          { label: "Endereço", value: property?.address ?? "Consulte o portal" },
          { label: "Competência", value: installment.reference_month },
          { label: "Vencimento", value: formatDate(installment.due_date) },
          { label: "Valor base", value: formatMoney(Number(installment.base_amount)) },
          { label: "Créditos", value: formatMoney(Number(installment.credit_amount)) },
          { label: "Total", value: formatMoney(total) },
        ],
        notice: settings.payment_instructions || "Consulte o proprietário para obter as instruções de pagamento.",
        ctaLabel: "Acessar área do inquilino",
        ctaUrl: `${Deno.env.get("SITE_URL") ?? "https://imobiliariaoliveira.vercel.app"}/inquilino`,
      },
    });
    if (delivery.status === "sent") sent += 1; else if (delivery.status === "failed") failed += 1; else skipped += 1;
    await audit(null, delivery.status === "sent" ? "email.rent_due.sent" : "email.rent_due.failed", "installment", installment.id, { delivery_id: delivery.deliveryId, recipient: tenant.email }, request);
  }
  return json({ date: today, candidates: installments?.length ?? 0, sent, skipped, failed });
});
