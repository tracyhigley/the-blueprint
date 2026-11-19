// Builds the "Download spreadsheet" file for the All Plans page: every project,
// any building, one row each. Pure (no server imports) so it's easy to test.

import { phaseLabel, type ProjectPhase } from "./project-phases";

export type ProjectCsvRow = {
  building: string;
  title: string;
  phase: ProjectPhase;
  priority: number | null;
  daysToBuild: number | null;
  strategy: string;
};

// Quote every cell, and defuse anything a spreadsheet would read as a formula.
function cell(v: string | number | null): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function projectsToCsv(rows: ProjectCsvRow[]): string {
  const header = ["Building", "Project", "Status", "Priority", "Days", "Strategy"];
  const lines = [header, ...rows.map((r) => [
    r.building,
    r.title,
    phaseLabel(r.phase),
    r.priority,
    r.daysToBuild,
    r.strategy,
  ])].map((cols) => cols.map(cell).join(","));
  // BOM so Excel reads accents/dashes correctly; CRLF per the CSV spec.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
