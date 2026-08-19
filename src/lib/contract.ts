import type { Installment, UtilityPolicy } from "./types";

export const utilityLabel: Record<UtilityPolicy, string> = {
  included: "inclusa no valor do aluguel",
  individual: "de responsabilidade direta do inquilino",
  shared: "rateada conforme medição ou regra informada pelo proprietário",
};

export function calculateInstallmentTotal(
  installment: Pick<
    Installment,
    "base_amount" | "fine_amount" | "interest_amount" | "credit_amount"
  >,
) {
  return Math.max(
    0,
    installment.base_amount +
      installment.fine_amount +
      installment.interest_amount -
      installment.credit_amount,
  );
}

export function statusLabel(status: Installment["status"]) {
  return {
    upcoming: "Futura",
    pending: "Pendente",
    under_review: "Em análise",
    paid: "Paga",
    late: "Atrasada",
    rejected: "Comprovante rejeitado",
    cancelled: "Cancelada",
  }[status];
}

export const contractClauses = [
  "Identificação das partes e do imóvel",
  "Prazo, aluguel, vencimento, reajuste e garantia",
  "Encargos, água, energia e demais consumos",
  "Vistoria, conservação e devolução do imóvel",
  "Silêncio e convivência sem perturbação em qualquer horário",
  "Manutenção, autorização prévia e crédito no aluguel",
  "Inadimplência, rescisão, aviso prévio e foro",
  "Privacidade, emissão e assinatura eletrônica interna",
];

