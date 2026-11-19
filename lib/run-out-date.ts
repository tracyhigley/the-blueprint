// "When will I run out of projects?" for the All Plans notes card. Adds up the
// Days to Build on every project that isn't complete (unset counts as 0, same
// as the section totals on that page), spreads them over 4 work days a week,
// and counts forward from today.

import { format } from "date-fns";

export const WORK_DAYS_PER_WEEK = 4;

export function runOutDate(totalDays: number, todayYmd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayYmd);
  if (!m || totalDays <= 0) return null;
  const weeks = totalDays / WORK_DAYS_PER_WEEK;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + Math.ceil(weeks * 7));
  return format(d, "MMMM d, yyyy");
}
