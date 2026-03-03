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

export interface OverrideBookingDetails {
  bookingId?: string;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  fromPaymentStatus?: string;
  toPaymentStatus?: string;
  startDateTime?: string;
}

export interface TeacherSuspendDetails {
  teacherId?: string;
  fromSuspended?: boolean;
  toSuspended?: boolean;
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
  return (
    getStringField(row.after, "reason") ??
    getStringField(row.after, "admin_override_reason") ??
    getStringField(row.before, "reason") ??
    getStringField(row.before, "admin_override_reason")
  );
}

function getBooleanField(source: Record<string, unknown> | null | undefined, key: string): boolean | undefined {
  if (!source) return undefined;
  const value = source[key];
  if (typeof value !== "boolean") return undefined;
  return value;
}

function getOverrideStatusDiff(row: AdminAuditRow) {
  const fromStatus =
    getStringField(row.after, "from_status") ??
    getStringField(row.before, "from_status") ??
    getStringField(row.before, "status");
  const toStatus =
    getStringField(row.after, "to_status") ??
    getStringField(row.after, "status");

  return { fromStatus, toStatus };
}

function getPaymentStatusDiff(row: AdminAuditRow) {
  const fromPaymentStatus = getStringField(row.before, "payment_status");
  const toPaymentStatus = getStringField(row.after, "payment_status");
  return { fromPaymentStatus, toPaymentStatus };
}

export function isOverrideBookingAction(action: string) {
  return action.includes("override_booking_status");
}

export function isTeacherSuspensionAction(action: string) {
  return action === "suspend_teacher" || action === "unsuspend_teacher";
}

export function getOverrideBookingDetails(row: AdminAuditRow): OverrideBookingDetails {
  const { fromStatus, toStatus } = getOverrideStatusDiff(row);
  const { fromPaymentStatus, toPaymentStatus } = getPaymentStatusDiff(row);
  const bookingId =
    getStringField(row.after, "booking_id") ??
    getStringField(row.before, "booking_id") ??
    row.entity_id ??
    undefined;

  return {
    bookingId,
    fromStatus,
    toStatus,
    reason: getReason(row),
    fromPaymentStatus,
    toPaymentStatus,
    startDateTime: getStringField(row.before, "start_date_time") ?? getStringField(row.after, "start_date_time"),
  };
}

export function getTeacherSuspendDetails(row: AdminAuditRow): TeacherSuspendDetails {
  const teacherId =
    getStringField(row.after, "teacher_user_id") ??
    getStringField(row.before, "teacher_user_id") ??
    row.entity_id ??
    undefined;

  const fromSuspended =
    getBooleanField(row.after, "from_is_suspended") ??
    getBooleanField(row.before, "from_is_suspended") ??
    getBooleanField(row.before, "is_suspended") ??
    (row.action === "suspend_teacher" ? false : row.action === "unsuspend_teacher" ? true : undefined);

  const toSuspended =
    getBooleanField(row.after, "to_is_suspended") ??
    getBooleanField(row.after, "is_suspended") ??
    (row.action === "suspend_teacher" ? true : row.action === "unsuspend_teacher" ? false : undefined);

  return {
    teacherId,
    fromSuspended,
    toSuspended,
    reason: getReason(row),
  };
}

export function formatAuditRow(row: AdminAuditRow): FormattedAdminAuditRow {
  const reason = getReason(row);

  if (isOverrideBookingAction(row.action)) {
    const { fromStatus, toStatus, bookingId } = getOverrideBookingDetails(row);

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

  if (isTeacherSuspensionAction(row.action)) {
    const { teacherId } = getTeacherSuspendDetails(row);

    return {
      title: row.action === "suspend_teacher" ? "Teacher suspended" : "Teacher unsuspended",
      subtitle: reason ? `Reason: ${reason}` : undefined,
      meta: teacherId ? `Teacher ID: ${teacherId}` : undefined,
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