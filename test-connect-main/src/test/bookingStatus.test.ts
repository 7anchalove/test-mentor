import { describe, expect, it } from "vitest";

import { BOOKING_STATUS, assertBookingStatus, isBookingStatus } from "@/lib/bookingStatus";

describe("bookingStatus guards", () => {
  it("returns true for valid booking statuses", () => {
    expect(isBookingStatus(BOOKING_STATUS.PENDING)).toBe(true);
    expect(isBookingStatus(BOOKING_STATUS.CONFIRMED)).toBe(true);
    expect(isBookingStatus(BOOKING_STATUS.CANCELLED)).toBe(true);
    expect(isBookingStatus(BOOKING_STATUS.AWAITING_RECEIPT)).toBe(true);
    expect(isBookingStatus(BOOKING_STATUS.PENDING_REVIEW)).toBe(true);
    expect(isBookingStatus(BOOKING_STATUS.DECLINED)).toBe(true);
  });

  it("returns false for invalid status values", () => {
    expect(isBookingStatus("approved")).toBe(false);
    expect(isBookingStatus("done")).toBe(false);
    expect(isBookingStatus(null)).toBe(false);
    expect(isBookingStatus(undefined)).toBe(false);
  });

  it("throws clear error for invalid values with callsite", () => {
    expect(() => assertBookingStatus("approved", "test.callsite")).toThrowError(
      /Invalid value "approved" at test\.callsite/,
    );
  });
});
