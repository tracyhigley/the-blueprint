import { describe, expect, it } from "vitest";
import { projectsToCsv } from "./projects-csv";

describe("projectsToCsv", () => {
  it("writes a header, labels the status, and quotes tricky cells", () => {
    const csv = projectsToCsv([
      {
        building: "The Press",
        title: 'Book "One", revised',
        phase: "building",
        priority: 1,
        daysToBuild: null,
        strategy: "",
      },
      {
        building: "The Library",
        title: "=SUM(A1)",
        phase: "idea",
        priority: null,
        daysToBuild: 3,
        strategy: "Launch",
      },
    ]);
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe('"Building","Project","Status","Priority","Days","Strategy"');
    expect(lines[1]).toBe('"The Press","Book ""One"", revised","Under construction","1","",""');
    expect(lines[2]).toBe('"The Library","\'=SUM(A1)","Idea","","3","Launch"');
  });
});
