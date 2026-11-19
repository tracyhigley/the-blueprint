import { describe, expect, it } from "vitest";
import { runOutDate } from "./run-out-date";

describe("runOutDate", () => {
  it("spreads the days over 4 work days a week", () => {
    // 20 days ÷ 4 per week = 5 weeks = 35 calendar days.
    expect(runOutDate(20, "2026-11-19")).toBe("December 24, 2026");
  });
  it("rounds up to a whole calendar day", () => {
    // 6 days ÷ 4 = 1.5 weeks = 10.5 → 11 days.
    expect(runOutDate(6, "2026-11-19")).toBe("November 30, 2026");
  });
  it("has no date when nothing is assigned", () => {
    expect(runOutDate(0, "2026-11-19")).toBeNull();
  });
});
