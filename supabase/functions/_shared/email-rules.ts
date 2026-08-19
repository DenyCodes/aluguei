export function saoPauloDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shouldSendRentDue(status: string, dueDate: string, today: string, hasReceiptUnderReview: boolean) {
  return dueDate === today && ["upcoming", "pending", "rejected"].includes(status) && !hasReceiptUnderReview;
}

export function rentEmailTotal(baseAmount: number, fineAmount: number, interestAmount: number, creditAmount: number) {
  return Math.max(0, baseAmount + fineAmount + interestAmount - creditAmount);
}

export function rentDueIdempotencyKey(installmentId: string, dueDate: string) {
  return `oliveira:rent_due:${installmentId}:${dueDate}`;
}

