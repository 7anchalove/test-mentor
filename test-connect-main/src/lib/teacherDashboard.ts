import { BOOKING_STATUS } from "@/lib/bookingStatus";

export type DashboardView = "all" | "upcoming" | "completed";

export const DEFAULT_DASHBOARD_VIEW: DashboardView = "all";
export const COMPLETED_BOOKING_STATUS = "completed";

export type DashboardBookingLike = {
  status: string | null;
  start_date_time: string;
  archived_by_teacher?: boolean | null;
};

export function parseDashboardView(value: string | null): DashboardView {
  if (value === "upcoming" || value === "completed" || value === "all") return value;
  return DEFAULT_DASHBOARD_VIEW;
}

export function isRequestStatus(status: string | null | undefined) {
  return status === BOOKING_STATUS.PENDING_REVIEW || status === BOOKING_STATUS.AWAITING_RECEIPT;
}

export function isUpcomingBooking(booking: DashboardBookingLike, now = new Date()) {
  const status = String(booking.status ?? "");
  const startsAt = new Date(booking.start_date_time);
  return (
    (status === BOOKING_STATUS.PENDING || status === BOOKING_STATUS.CONFIRMED) &&
    startsAt.getTime() > now.getTime()
  );
}

export function isCompletedBooking(booking: DashboardBookingLike) {
  return String(booking.status ?? "") === COMPLETED_BOOKING_STATUS;
}

export function canArchiveBooking(status: string | null | undefined) {
  return String(status ?? "") === COMPLETED_BOOKING_STATUS || String(status ?? "") === BOOKING_STATUS.CANCELLED;
}
