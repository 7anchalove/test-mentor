export const BOOKING_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  AWAITING_RECEIPT: "awaiting_receipt",
  PENDING_REVIEW: "pending_review",
  DECLINED: "declined",
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

const BOOKING_STATUS_VALUES = Object.values(BOOKING_STATUS) as BookingStatus[];

export function isBookingStatus(x: unknown): x is BookingStatus {
  return typeof x === "string" && BOOKING_STATUS_VALUES.includes(x as BookingStatus);
}

export function assertBookingStatus(x: unknown, callsite: string): BookingStatus {
  if (isBookingStatus(x)) return x;

  throw new Error(
    `[booking_status] Invalid value "${String(x)}" at ${callsite}. Expected one of: ${BOOKING_STATUS_VALUES.join(", ")}`,
  );
}