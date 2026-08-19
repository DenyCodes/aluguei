import { audit, json, requireAdmin, serve, serviceClient } from "../_shared/http.ts";

const requiredText = (
  value: unknown,
  label: string,
  maximumLength: number,
) => {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} obrigatorio`);
  if (text.length > maximumLength) throw new Error(`${label} muito longo`);
  return text;
};

const requiredEmail = (value: unknown, label: string) => {
  const email = requiredText(value, label, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(`${label} invalido`);
  return email;
};

serve(async (request) => {
  const admin = await requireAdmin(request, { elevated: true });
  const body = await request.json();
  const sendHour = Number(body.email_send_hour);
  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23)
    throw new Error("Horario de envio invalido");

  const values = {
    id: 1,
    landlord_name: requiredText(body.landlord_name, "Nome do locador", 200),
    landlord_tax_id: requiredText(body.landlord_tax_id, "CPF do locador", 30),
    payment_instructions: requiredText(
      body.payment_instructions,
      "Instrucao de pagamento",
      2000,
    ),
    jurisdiction: requiredText(body.jurisdiction, "Foro", 200),
    email_enabled: body.email_enabled === true,
    rent_due_email_enabled: body.rent_due_email_enabled === true,
    email_from_name: requiredText(body.email_from_name, "Nome do remetente", 200),
    email_from_address: requiredEmail(body.email_from_address, "Remetente"),
    email_reply_to: requiredEmail(body.email_reply_to, "E-mail de resposta"),
    email_admin_copy: requiredEmail(body.email_admin_copy, "Copia administrativa"),
    email_send_hour: sendHour,
    email_timezone: "America/Sao_Paulo",
    updated_at: new Date().toISOString(),
  };

  const saved = await serviceClient()
    .from("oliveira_settings")
    .upsert(values)
    .select("id,updated_at")
    .single();
  if (saved.error) throw saved.error;

  await audit(
    admin.id,
    "settings.updated",
    "settings",
    "1",
    {
      email_enabled: values.email_enabled,
      rent_due_email_enabled: values.rent_due_email_enabled,
      email_send_hour: values.email_send_hour,
    },
    request,
  );
  return json({ settings: saved.data });
});
