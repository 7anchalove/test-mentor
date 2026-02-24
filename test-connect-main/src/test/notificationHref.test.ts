import { describe, expect, it } from "vitest";

import { getNotificationHref } from "@/lib/notificationHref";

describe("getNotificationHref", () => {
  it("maps legacy dashboard requests route to dashboard", () => {
    expect(getNotificationHref({ action_url: "/dashboard/requests" })).toBe("/dashboard");
  });

  it("routes booking_id notifications to sessions when no session-details route exists", () => {
    expect(getNotificationHref({ data: { booking_id: "abc-123" } })).toBe("/sessions");
  });

  it("maps known dashboard aliases to existing app routes", () => {
    expect(getNotificationHref({ action_url: "/dashboard/sessions" })).toBe("/sessions");
    expect(getNotificationHref({ action_url: "/dashboard/messages" })).toBe("/conversations");
    expect(getNotificationHref({ action_url: "/dashboard/availability" })).toBe("/availability");
  });
});
