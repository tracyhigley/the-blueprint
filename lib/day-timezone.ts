import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { todayYmdInTz } from "@/lib/calendar-day-bounds";

/**
 * IANA zone for the app’s calendar day on the server. Vercel runs Node in UTC,
 * so Date#getDate() alone rolls at UTC midnight; this fixes “today” to a chosen zone.
 *
 * Default `Etc/GMT+4` is a fixed UTC−4 offset (IANA `Etc/GMT` signs are inverted).
 * Override with the `BLUEPRINT_DAY_TIMEZONE` env var (e.g. `America/New_York` for US
 * Eastern with DST) — the env var name is unchanged so any existing Vercel config
 * keeps working.
 */
export const DAY_TIMEZONE =
  process.env.BLUEPRINT_DAY_TIMEZONE?.trim() || "Etc/GMT+4";

export function todayYmd(): string {
  return todayYmdInTz(DAY_TIMEZONE);
}

/** Day of month in the app’s zone (e.g. for rotating copy on the docket). */
export function zonedDayOfMonth(): number {
  return Number(format(toZonedTime(new Date(), DAY_TIMEZONE), "d"));
}
