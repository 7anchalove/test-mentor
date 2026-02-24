import { BOOKING_STATUS } from "@/lib/bookingStatus";

export type StatusTone = "green" | "yellow" | "blue" | "red" | "gray";

export function getStatusTone(rawStatus: string | null | undefined): StatusTone {
  const status = String(rawStatus ?? "").toLowerCase();

  if (status === "completed") return "green";
  if (status === "scheduled") return "yellow";
  if (status === BOOKING_STATUS.PENDING_REVIEW || status === BOOKING_STATUS.PENDING || status === BOOKING_STATUS.AWAITING_RECEIPT) return "yellow";
  if (status === BOOKING_STATUS.CONFIRMED) return "blue";
  if (status === BOOKING_STATUS.DECLINED || status === BOOKING_STATUS.CANCELLED) return "red";

  return "gray";
}

export function toStatusLabel(rawStatus: string | null | undefined): string {
  const status = String(rawStatus ?? "").trim();
  if (!status) return "Unknown";
  return status.replaceAll("_", " ");
}

export function getStatusBadgeClassName(rawStatus: string | null | undefined): string {
  const tone = getStatusTone(rawStatus);

  switch (tone) {
    case "green":
      return "bg-success text-success-foreground border-transparent";
    case "yellow":
      return "bg-amber-500 text-white border-transparent";
    case "blue":
      return "bg-blue-600 text-white border-transparent";
    case "red":
      return "bg-destructive text-destructive-foreground border-transparent";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
