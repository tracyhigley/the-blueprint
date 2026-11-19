import { describe, expect, it } from "vitest";
import {
  countSlots,
  normalizePlan,
  planDates,
  type TenDayPlan,
} from "./ten-day-plan";

describe("planDates", () => {
  it("gives ten days and never includes a Sunday", () => {
    // 2026-11-19 is a Thursday.
    const dates = planDates("2026-11-19");
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe("2026-11-19");
    expect(dates).not.toContain("2026-11-22"); // Sunday
    expect(dates).not.toContain("2026-11-29"); // Sunday
    expect(dates[9]).toBe("2026-11-30");
  });

  it("slides a Sunday start to Monday", () => {
    expect(planDates("2026-11-22")[0]).toBe("2026-11-23");
  });
});

describe("countSlots", () => {
  it("skips opt-out days and counts worked slots", () => {
    const plan: TenDayPlan = normalizePlan({
      start: "2026-11-19",
      days: {
        "2026-11-19": {
          press: { projectId: "a", worked: true },
          others: [{ projectId: "b", worked: true }, null],
        },
        "2026-11-20": { mode: "none" },
        "2026-11-21": { mode: "maint" },
      },
    });
    // 10 days, 2 opted out → 8 project days × 3 slots.
    expect(countSlots(plan)).toEqual({ worked: 2, total: 24 });
  });
});
