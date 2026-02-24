import { describe, expect, it } from "vitest";

import {
  canArchiveBooking,
  isCompletedBooking,
  isUpcomingBooking,
  parseDashboardView,
} from "@/lib/teacherDashboard";

describe("teacher dashboard helpers", () => {
  it("parses allowed views with safe fallback", () => {
    expect(parseDashboardView("upcoming")).toBe("upcoming");
    expect(parseDashboardView("completed")).toBe("completed");
    expect(parseDashboardView("all")).toBe("all");
    expect(parseDashboardView("unknown")).toBe("all");
  });

  it("recognizes upcoming and completed bookings", () => {
    const now = new Date("2026-02-24T10:00:00.000Z");
    expect(
      isUpcomingBooking(
        { status: "pending", start_date_time: "2026-02-24T12:00:00.000Z" },
        now,
      ),
    ).toBe(true);

    expect(isCompletedBooking({ status: "completed", start_date_time: now.toISOString() })).toBe(true);
  });

  it("allows archiving only completed/cancelled", () => {
    expect(canArchiveBooking("completed")).toBe(true);
    expect(canArchiveBooking("cancelled")).toBe(true);
    expect(canArchiveBooking("confirmed")).toBe(false);
  });
});
