/**
 * Lightweight sanity checks for availability merge logic (mirrors TeachersPage).
 * RPC get_teachers_availability is exercised via dev page /dev/availability-test.
 */

import { describe, it, expect } from "vitest";

function buildAvailabilityMap(
  rows: { teacher_id: string; is_available: boolean }[]
): Map<string, boolean> {
  return new Map(rows.map((row) => [row.teacher_id, row.is_available]));
}

function mergeTeachersWithAvailability(
  teacherProfiles: { user_id: string }[],
  availabilityRows: { teacher_id: string; is_available: boolean }[] | null
): { userId: string; isAvailable: boolean }[] {
  const availabilityByTeacher = buildAvailabilityMap(availabilityRows ?? []);
  return teacherProfiles.map((tp) => ({
    userId: tp.user_id,
    isAvailable: availabilityByTeacher.get(tp.user_id) ?? false,
  }));
}

describe("availability merge", () => {
  const teachers = [
    { user_id: "teacher-a" },
    { user_id: "teacher-b" },
  ];

  it("defaults to not available when RPC returns no rows", () => {
    const result = mergeTeachersWithAvailability(teachers, []);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.isAvailable === false)).toBe(true);
  });

  it("sets available true when RPC returns is_available true for that teacher", () => {
    const result = mergeTeachersWithAvailability(teachers, [
      { teacher_id: "teacher-a", is_available: true },
      { teacher_id: "teacher-b", is_available: false },
    ]);
    expect(result.find((r) => r.userId === "teacher-a")?.isAvailable).toBe(true);
    expect(result.find((r) => r.userId === "teacher-b")?.isAvailable).toBe(false);
  });

  it("defaults to false when teacher id missing from RPC result", () => {
    const result = mergeTeachersWithAvailability(teachers, [
      { teacher_id: "teacher-a", is_available: true },
    ]);
    expect(result.find((r) => r.userId === "teacher-b")?.isAvailable).toBe(false);
  });
});
