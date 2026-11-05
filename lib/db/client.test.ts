import { describe, expect, it } from "vitest";
import { timestamptzToIso } from "./client";

describe("timestamps from Postgres", () => {
  it("keeps microseconds so a value read earlier still matches the row", () => {
    expect(timestamptzToIso("2026-11-05 07:50:40.684177+01")).toBe("2026-11-05T07:50:40.684177+01:00");
    expect(timestamptzToIso("2026-11-05 00:50:40+00")).toBe("2026-11-05T00:50:40+00:00");
    expect(timestamptzToIso("2026-11-05 00:50:40.5-05:30")).toBe("2026-11-05T00:50:40.5-05:30");
  });
  it("still reads as the same moment in JavaScript", () => {
    expect(new Date(timestamptzToIso("2026-11-05 07:50:40.684177+01")).toISOString()).toBe("2026-11-05T06:50:40.684Z");
  });
});
