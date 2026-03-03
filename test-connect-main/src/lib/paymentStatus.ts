export const PAYMENT_STATUS = {
  WAITING: "waiting",
  PAID: "paid",
  NOT_PAID: "not_paid",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS) as PaymentStatus[];

export function isPaymentStatus(x: unknown): x is PaymentStatus {
  return typeof x === "string" && PAYMENT_STATUS_VALUES.includes(x as PaymentStatus);
}

export function assertPaymentStatus(x: unknown, callsite: string): PaymentStatus {
  if (isPaymentStatus(x)) return x;

  throw new Error(
    `[payment_status] Invalid value "${String(x)}" at ${callsite}. Expected one of: ${PAYMENT_STATUS_VALUES.join(", ")}`,
  );
}