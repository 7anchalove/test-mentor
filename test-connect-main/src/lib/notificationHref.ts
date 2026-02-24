type NotificationLike = {
  action_url?: string | null;
  booking_id?: string | null;
  type?: string | null;
  kind?: string | null;
  data?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function mapLegacyDashboardPath(path: string): string {
  if (path === "/dashboard/requests") return "/dashboard";
  if (path === "/dashboard/sessions") return "/sessions";
  if (path === "/dashboard/availability") return "/availability";
  if (path === "/dashboard/messages") return "/conversations";
  if (path.startsWith("/dashboard/sessions/")) return "/sessions";
  if (path.startsWith("/dashboard/")) return "/dashboard";
  if (path.startsWith("/sessions/")) return "/sessions";
  return path;
}

function normalizeActionUrl(actionUrl: string): string | null {
  const trimmed = actionUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (typeof window !== "undefined" && parsed.origin !== window.location.origin) {
        return null;
      }
      const inAppPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return mapLegacyDashboardPath(inAppPath);
    } catch {
      return null;
    }
  }

  if (!trimmed.startsWith("/")) return null;
  return mapLegacyDashboardPath(trimmed);
}

function inferType(notification: NotificationLike): string {
  const data = asRecord(notification.data);
  const payload = asRecord(notification.payload);

  return String(
    getString(notification.type) ??
      getString(notification.kind) ??
      getString(data?.type) ??
      getString(data?.kind) ??
      getString(payload?.type) ??
      getString(payload?.kind) ??
      "",
  ).toLowerCase();
}

function inferBookingId(notification: NotificationLike): string | null {
  const data = asRecord(notification.data);
  const payload = asRecord(notification.payload);

  const direct = getString(notification.booking_id);
  if (direct) return direct;

  const fromData = getString(data?.booking_id);
  if (fromData) return fromData;

  const fromPayload = getString(payload?.booking_id);
  if (fromPayload) return fromPayload;

  const url = getString(notification.action_url);
  if (!url) return null;

  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    return parsed.searchParams.get("booking_id");
  } catch {
    return null;
  }
}

export function getNotificationHref(notification: NotificationLike): string | null {
  const bookingId = inferBookingId(notification);
  if (bookingId) {
    return "/sessions";
  }

  const notificationType = inferType(notification);
  if (notificationType.includes("request") || notificationType.includes("booking")) {
    return "/dashboard";
  }

  const actionUrl = getString(notification.action_url);
  if (actionUrl) {
    return normalizeActionUrl(actionUrl);
  }

  return "/dashboard";
}
