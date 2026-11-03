// Server-side reads for routine score-logging (see lib/routine.ts).

import { supabaseServer } from "./supabase/server";

function envReady() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/** Checked item keys for one day (empty if the day hasn't been logged). */
export async function getRoutineDay(date: string): Promise<string[]> {
  if (!envReady()) return [];
  const sb = await supabaseServer();
  const { data } = await sb
    .from("routine_days")
    .select("checked")
    .eq("date", date)
    .maybeSingle();
  return Array.isArray(data?.checked) ? (data.checked as string[]) : [];
}

/**
 * Logged days between two dates, inclusive. Only days with at least one
 * item checked come back — unlogged days are left out entirely.
 */
export async function getRoutineRange(
  from: string,
  to: string,
): Promise<{ date: string; checked: string[] }[]> {
  if (!envReady()) return [];
  const sb = await supabaseServer();
  const { data } = await sb
    .from("routine_days")
    .select("date, checked")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });
  return (data ?? [])
    .map((r: any) => ({
      date: String(r.date),
      checked: Array.isArray(r.checked) ? (r.checked as string[]) : [],
    }))
    .filter((r: { checked: string[] }) => r.checked.length > 0);
}

/** The earliest day with anything logged, or null if nothing ever was. */
export async function getFirstRoutineDate(): Promise<string | null> {
  if (!envReady()) return null;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("routine_days")
    .select("date, checked")
    .order("date", { ascending: true })
    .limit(60);
  const first = (data ?? []).find(
    (r: any) => Array.isArray(r.checked) && r.checked.length > 0,
  );
  return first ? String(first.date) : null;
}
