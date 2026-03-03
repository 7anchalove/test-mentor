export interface AdminAuditRow {
  id: string;
  created_at: string;
  admin_user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface FormattedAdminAuditRow {
  title: string;
  subtitle?: string;
  meta?: string;
  reason?: string;
}

function getStringField(source: Record<string, unknown> | null | undefined, key: string): string | undefined {
  if (!source) return undefined;
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function getReason(row: AdminAuditRow) {
  return getStringField(row.after, "reason") ?? getStringField(row.before, "reason");
}

export function formatAuditRow(row: AdminAuditRow): FormattedAdminAuditRow {
  const reason = getReason(row);

  if (row.action === "override_booking_status") {
    const fromStatus =
      getStringField(row.after, "from_status") ??
      getStringField(row.before, "from_status") ??
      getStringField(row.before, "status");
    const toStatus =
      getStringField(row.after, "to_status") ??
      getStringField(row.after, "status");
    const bookingId =
      getStringField(row.after, "booking_id") ??
      getStringField(row.before, "booking_id") ??
      row.entity_id ??
      undefined;

    const title = fromStatus && toStatus
      ? `Booking overridden: ${fromStatus} → ${toStatus}`
      : "Booking overridden";

    return {
      title,
      subtitle: reason ? `Reason: ${reason}` : undefined,
      meta: bookingId ? `Booking ID: ${bookingId}` : undefined,
      reason,
    };
  }

  if (row.action === "suspend_teacher" || row.action === "unsuspend_teacher") {
    const suspendedTeacherId =
      getStringField(row.after, "teacher_user_id") ??
      getStringField(row.before, "teacher_user_id") ??
      row.entity_id ??
      undefined;

    return {
      title: row.action === "suspend_teacher" ? "Teacher suspended" : "Teacher unsuspended",
      subtitle: reason ? `Reason: ${reason}` : undefined,
      meta: suspendedTeacherId ? `Teacher ID: ${suspendedTeacherId}` : undefined,
      reason,
    };
  }

  const fromStatus =
    getStringField(row.after, "from_status") ??
    getStringField(row.before, "from_status");
  const toStatus =
    getStringField(row.after, "to_status") ??
    getStringField(row.before, "to_status");

  return {
    title: `${row.action} : ${row.entity_type ?? "unknown"}`,
    subtitle: reason
      ? `Reason: ${reason}`
      : fromStatus && toStatus
        ? `Transition: ${fromStatus} → ${toStatus}`
        : undefined,
    meta: row.entity_id ? `Entity ID: ${row.entity_id}` : undefined,
    reason,
  };
}