import { describe, expect, it } from "vitest";
import {
  countSlots,
  normalizePlan,
  pickableForDropdown,
  planDates,
  slottedProjectIds,
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

describe("pickableForDropdown", () => {
  const projects = [
    { id: "a", phase: "building" },
    { id: "b", phase: "building" },
    { id: "c", phase: "planning" },
    { id: "d", phase: "idea" },
  ];

  it("offers only Under Construction while any is unslotted", () => {
    const ids = pickableForDropdown(projects, new Set(["a"])).map((p) => p.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("opens up Planning once every Under Construction one is slotted", () => {
    const ids = pickableForDropdown(projects, new Set(["a", "b"])).map(
      (p) => p.id,
    );
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("opens Planning when nothing is under construction", () => {
    const ids = pickableForDropdown([projects[2], projects[3]], new Set()).map(
      (p) => p.id,
    );
    expect(ids).toEqual(["c"]);
  });
});

describe("slottedProjectIds", () => {
  it("collects picks from project days and ignores opt-out days", () => {
    const plan = normalizePlan({
      start: "2026-11-19",
      days: {
        "2026-11-19": {
          mode: null,
          press: { projectId: "p1", worked: false },
          others: [{ projectId: "o1", worked: false }, null],
        },
        "2026-11-20": {
          mode: "none",
          press: { projectId: "p2", worked: false },
          others: [null, null],
        },
      },
    });
    expect([...slottedProjectIds(plan)].sort()).toEqual(["o1", "p1"]);
  });
});
