// The 10-Day Plan's shared vocabulary and date math. Client-safe on purpose
// (no server imports) so the day cards and the Server Actions use the same
// rules. Stored as one jsonb blob in settings.ten_day_plan.

import { format } from "date-fns";

// Same hardcode-the-key convention as the old Library key: matches the
// auto-derived settings.buildings key for "The Press". If that building is
// ever renamed/rekeyed, update this to match.
export const PRESS_BUILDING_KEY = "THE_PRESS";

// The Library's projects never go in the "Other buildings" slots. Same
// hardcode-the-key convention as the Press key above.
export const LIBRARY_BUILDING_KEY = "THE_LIBRARY";

export const PLAN_LENGTH = 10;
export const OTHER_SLOT_COUNT = 2;
// One Press project + two other-building projects.
export const SLOTS_PER_DAY = 1 + OTHER_SLOT_COUNT;

export type PlanSlot = { projectId: string; worked: boolean };

// null = a normal project day. "none" and "maint" are the two ways to opt out.
export type PlanDayMode = "none" | "maint";

export type PlanDay = {
  mode: PlanDayMode | null;
  press: PlanSlot | null;
  others: (PlanSlot | null)[]; // always OTHER_SLOT_COUNT long
};

// A finished plan, kept as a small record of progress.
export type PastPlan = {
  start: string;
  end: string;
  worked: number;
  total: number;
};

export type TenDayPlan = {
  start: string | null; // YYYY-MM-DD, null until the first plan is started
  days: Record<string, PlanDay>; // keyed by YYYY-MM-DD
  past: PastPlan[];
};

export function emptyDay(): PlanDay {
  return {
    mode: null,
    press: null,
    others: Array.from({ length: OTHER_SLOT_COUNT }, () => null),
  };
}

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isYmd(v: unknown): v is string {
  return typeof v === "string" && parseYmd(v) !== null;
}

// The plan's days: starting on `start`, 10 days, Sundays skipped (a Sunday
// start slides to Monday).
export function planDates(start: string, count = PLAN_LENGTH): string[] {
  const d = parseYmd(start);
  if (!d) return [];
  const out: string[] = [];
  while (out.length < count) {
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// "Thu, Nov 19" — built from the date's own parts so the server's timezone
// can't shift it a day.
export function formatPlanDate(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), "EEE, MMM d");
}

function normalizeSlot(raw: any): PlanSlot | null {
  if (!raw || typeof raw.projectId !== "string" || !raw.projectId) return null;
  return { projectId: raw.projectId, worked: raw.worked === true };
}

export function normalizeDay(raw: any): PlanDay {
  const others = Array.isArray(raw?.others) ? raw.others : [];
  return {
    mode: raw?.mode === "none" || raw?.mode === "maint" ? raw.mode : null,
    press: normalizeSlot(raw?.press),
    others: Array.from({ length: OTHER_SLOT_COUNT }, (_, i) =>
      normalizeSlot(others[i]),
    ),
  };
}

export function normalizePlan(raw: unknown): TenDayPlan {
  const r = (raw ?? {}) as any;
  const days: Record<string, PlanDay> = {};
  if (r.days && typeof r.days === "object") {
    for (const [date, day] of Object.entries(r.days)) {
      if (isYmd(date)) days[date] = normalizeDay(day);
    }
  }
  const past: PastPlan[] = Array.isArray(r.past)
    ? r.past
        .filter(
          (p: any) =>
            p &&
            isYmd(p.start) &&
            isYmd(p.end) &&
            typeof p.worked === "number" &&
            typeof p.total === "number",
        )
        .map((p: any) => ({
          start: p.start,
          end: p.end,
          worked: p.worked,
          total: p.total,
        }))
    : [];
  return { start: isYmd(r.start) ? r.start : null, days, past };
}

// Progress across the current plan. Every project day counts three slots
// (filled or not) so the denominator is the goal, not just what's been
// picked; "no project work" and "maint only" days don't count against you.
export function countSlots(plan: TenDayPlan): { worked: number; total: number } {
  if (!plan.start) return { worked: 0, total: 0 };
  let worked = 0;
  let total = 0;
  for (const date of planDates(plan.start)) {
    const day = plan.days[date] ?? emptyDay();
    if (day.mode) continue;
    total += SLOTS_PER_DAY;
    for (const slot of [day.press, ...day.others]) {
      if (slot?.worked) worked += 1;
    }
  }
  return { worked, total };
}

// Every project already picked on a normal project day of the plan. Days set
// to "No Project Work" / "Maintenance Only" don't count: their slots are hidden.
export function slottedProjectIds(plan: TenDayPlan): Set<string> {
  const ids = new Set<string>();
  for (const day of Object.values(plan.days)) {
    if (day.mode) continue;
    for (const slot of [day.press, ...day.others]) {
      if (slot) ids.add(slot.projectId);
    }
  }
  return ids;
}

// What a dropdown offers: Under Construction projects only, until every one of
// them is slotted into the plan; then Planning projects open up too (Under
// Construction stay listed first, since a multi-day build needs more days).
// `projects` must already be in display order. Idea / Complete never appear.
export function pickableForDropdown<
  T extends { id: string; phase: string },
>(projects: T[], slotted: Set<string>): T[] {
  const building = projects.filter((p) => p.phase === "building");
  const allSlotted = building.every((p) => slotted.has(p.id));
  return projects.filter(
    (p) => p.phase === "building" || (allSlotted && p.phase === "planning"),
  );
}

export function planHasAnyEntries(plan: TenDayPlan): boolean {
  return Object.values(plan.days).some(
    (d) => d.mode || d.press || d.others.some(Boolean),
  );
}
