// Future Tasks — pure logic (no database, no Next.js). Validation, repeat
// stepping, page grouping, and the Field Note / Slack text. The database
// side lives in lib/future-tasks-db.ts; the page in app/future-tasks.
//
// How it works: a task with a date waits on /future-tasks until its day.
// On that day (or the first run after, if it was added late) the morning
// job copies it into Field Notes and posts one Slack message. A one-off
// task is then marked sent (done_at) and sits in the Sent list for 30
// days; a repeating task moves to its next date AFTER today instead.

import { formatInTimeZone } from "date-fns-tz";

/** "Today" for Future Tasks is US Eastern, not UTC. */
export const FUTURE_TASKS_TZ = "America/New_York";

export function futureTasksToday(now: Date = new Date()): string {
  return formatInTimeZone(now, FUTURE_TASKS_TZ, "yyyy-MM-dd");
}

export const REPEATS = [
  { key: "none", label: "Doesn't repeat" },
  { key: "weekly", label: "Every week" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "monthly", label: "Every month" },
  { key: "quarterly", label: "Every 3 months" },
  { key: "every90days", label: "Every 90 days" },
  { key: "semiannual", label: "Every 6 months" },
  { key: "yearly", label: "Every year" },
] as const;

export type Repeat = (typeof REPEATS)[number]["key"];

export function repeatLabel(r: Repeat): string {
  return REPEATS.find((x) => x.key === r)?.label ?? r;
}

export type FutureTask = {
  id: string;
  title: string;
  due_on: string | null;
  repeat: Repeat;
  anchor_day: number | null;
  link: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  last_done_at: string | null;
  sent_on: string | null;
  /** set when the hub sent this task (see lib/hub-todos.ts) */
  source?: string | null;
  external_key?: string | null;
};

export const TITLE_MAX = 200;
export const LINK_MAX = 500;
export const NOTES_MAX = 2000;
export const SENT_LIST_DAYS = 30;
export const SENT_LIST_MAX = 50;

// ---------- dates (plain YYYY-MM-DD strings, no time zones) ----------

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYmd(s: string): boolean {
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
}

function ymd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Adds months, landing on `anchorDay` clamped to the month's last day. */
export function addMonths(date: string, n: number, anchorDay: number): string {
  const [y, m] = parts(date);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return ymd(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
}

export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round(
    (Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000,
  );
}

/** One step of a repeat. */
export function stepRepeat(
  date: string,
  repeat: Repeat,
  anchorDay?: number | null,
): string {
  const anchor = anchorDay ?? parts(date)[2];
  switch (repeat) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "monthly":
      return addMonths(date, 1, anchor);
    case "quarterly":
      return addMonths(date, 3, anchor);
    case "every90days":
      return addDays(date, 90);
    case "semiannual":
      return addMonths(date, 6, anchor);
    case "yearly":
      return addMonths(date, 12, anchor);
    default:
      throw new Error("doesn't repeat");
  }
}

/** Next date strictly after `today` — a late task comes back once, not N times. */
export function nextAfter(
  date: string,
  repeat: Repeat,
  anchorDay: number | null,
  today: string,
): string {
  let d = date;
  do {
    d = stepRepeat(d, repeat, anchorDay);
  } while (d <= today);
  return d;
}

// ---------- form input ----------

export type TaskInput = {
  title?: unknown;
  show_on?: unknown;
  repeat?: unknown;
  link?: unknown;
  notes?: unknown;
};

export type CleanTask = {
  title: string;
  due_on: string | null;
  repeat: Repeat;
  anchor_day: number | null;
  link: string | null;
  notes: string | null;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function cleanTitle(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

/** Web address or in-app path. `shopify.com/x` → `https://shopify.com/x`. */
export function cleanLink(raw: unknown): Result<string | null> {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string")
    return { ok: false, error: "that link doesn't look right" };
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  if (s.length > LINK_MAX)
    return { ok: false, error: `keep the link to ${LINK_MAX} characters` };
  if (/\s/.test(s))
    return { ok: false, error: "a link can't have spaces in it" };
  if (s.startsWith("//"))
    return { ok: false, error: "start the link with https:// or /" };
  if (s.startsWith("/")) return { ok: true, value: s };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  let url = s;
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (name !== "http" && name !== "https")
      return {
        ok: false,
        error:
          "links have to be a web address (https://…) or a page in the app (/…)",
      };
    if (!/^https?:\/\/[^/]/i.test(s))
      return { ok: false, error: "that link doesn't look right" };
  } else {
    url = `https://${s}`;
  }
  try {
    const u = new URL(url);
    if (!u.hostname.includes(".") && u.hostname !== "localhost")
      return { ok: false, error: "that link doesn't look right" };
  } catch {
    return { ok: false, error: "that link doesn't look right" };
  }
  if (url.length > LINK_MAX)
    return { ok: false, error: `keep the link to ${LINK_MAX} characters` };
  return { ok: true, value: url };
}

export function validateTask(input: TaskInput): Result<CleanTask> {
  const title = cleanTitle(input.title);
  if (!title) return { ok: false, error: "type what the task is" };
  if (title.length > TITLE_MAX)
    return {
      ok: false,
      error: `keep the task to ${TITLE_MAX} characters; put the rest in Notes`,
    };

  let due_on: string | null = null;
  if (input.show_on != null && input.show_on !== "") {
    if (typeof input.show_on !== "string" || !isValidYmd(input.show_on))
      return { ok: false, error: "pick a real date" };
    due_on = input.show_on;
  }

  const repeatRaw =
    input.repeat == null || input.repeat === "" ? "none" : input.repeat;
  const repeat = REPEATS.find((r) => r.key === repeatRaw)?.key;
  if (!repeat) return { ok: false, error: "pick how often it repeats" };
  if (repeat !== "none" && !due_on)
    return { ok: false, error: "a repeating task needs a first date" };

  const link = cleanLink(input.link);
  if (!link.ok) return link;

  let notes: string | null = null;
  if (input.notes != null) {
    if (typeof input.notes !== "string")
      return { ok: false, error: "notes have to be text" };
    const n = input.notes.replace(/\r\n?/g, "\n").trim();
    if (n.length > NOTES_MAX)
      return {
        ok: false,
        error: `keep the notes to ${NOTES_MAX.toLocaleString("en-US")} characters`,
      };
    notes = n || null;
  }

  return {
    ok: true,
    value: {
      title,
      due_on,
      repeat,
      anchor_day: due_on ? parts(due_on)[2] : null,
      link: link.value,
      notes,
    },
  };
}

// ---------- what's due / what happens when it's sent ----------

/** Open, dated, today or earlier, and not already sent for that date. */
export function isDue(t: FutureTask, today: string): boolean {
  return (
    !t.done_at && !!t.due_on && t.due_on <= today && t.sent_on !== t.due_on
  );
}

export function dueTasks(tasks: FutureTask[], today: string): FutureTask[] {
  return tasks
    .filter((t) => isDue(t, today))
    .sort((a, b) =>
      a.due_on! < b.due_on!
        ? -1
        : a.due_on! > b.due_on!
          ? 1
          : a.created_at < b.created_at
            ? -1
            : 1,
    );
}

/** Row changes after a task has been copied into Field Notes. */
export function sentPatch(
  t: FutureTask,
  today: string,
  nowIso: string,
): Partial<FutureTask> & { updated_at: string } {
  if (t.repeat === "none") {
    return { done_at: nowIso, sent_on: t.due_on, updated_at: nowIso };
  }
  return {
    due_on: nextAfter(t.due_on!, t.repeat, t.anchor_day, today),
    last_done_at: nowIso,
    sent_on: t.due_on,
    updated_at: nowIso,
  };
}

/**
 * "Put back" on a sent one-off: reopen it. If its date is today or earlier
 * it would go straight back into Field Notes, so the date is cleared
 * (Someday) — give it a new day with Edit.
 */
export function putBackPatch(
  t: FutureTask,
  today: string,
  nowIso: string,
): Partial<FutureTask> & { updated_at: string } {
  const keepDate = t.due_on && t.due_on > today;
  return {
    done_at: null,
    sent_on: null,
    due_on: keepDate ? t.due_on : null,
    anchor_day: keepDate ? t.anchor_day : null,
    repeat: keepDate ? t.repeat : "none",
    updated_at: nowIso,
  };
}

// ---------- display ----------

export function prettyDate(date: string, withWeekday = true): string {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MO = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const md = `${MO[m - 1]} ${d}`;
  return withWeekday ? `${WD[dt.getUTCDay()]} ${md}` : md;
}

export function isoToEasternYmd(iso: string): string {
  return formatInTimeZone(new Date(iso), FUTURE_TASKS_TZ, "yyyy-MM-dd");
}

/** e.g. "Due Mon Nov 3 · Every month · last sent Oct 3 · link ↗" */
export function metaLine(t: FutureTask, today: string): string {
  const bits: string[] = [];
  if (!t.due_on) bits.push("Someday");
  else if (t.due_on === today) bits.push("Due today");
  else if (t.due_on < today) {
    const n = dayDiff(today, t.due_on);
    bits.push(
      `Was due ${prettyDate(t.due_on)} (${n} day${n === 1 ? "" : "s"} ago)`,
    );
  } else bits.push(`Due ${prettyDate(t.due_on)}`);
  if (t.repeat !== "none") bits.push(repeatLabel(t.repeat));
  if (t.last_done_at)
    bits.push(
      `last sent ${prettyDate(isoToEasternYmd(t.last_done_at), false)}`,
    );
  return bits.join(" · ");
}

export type PageGroups = {
  waiting: FutureTask[];
  coming: FutureTask[];
  someday: FutureTask[];
  sent: FutureTask[];
};

export function groupTasks(
  tasks: FutureTask[],
  today: string,
  now: Date = new Date(),
): PageGroups {
  const cutoff = now.getTime() - SENT_LIST_DAYS * 86400000;
  const byDue = (a: FutureTask, b: FutureTask) =>
    a.due_on! < b.due_on!
      ? -1
      : a.due_on! > b.due_on!
        ? 1
        : a.created_at < b.created_at
          ? -1
          : 1;
  const open = tasks.filter((t) => !t.done_at);
  return {
    // Normally empty: due but the job hasn't run yet (or a put-back).
    waiting: open.filter((t) => t.due_on && t.due_on <= today).sort(byDue),
    coming: open.filter((t) => t.due_on && t.due_on > today).sort(byDue),
    someday: open
      .filter((t) => !t.due_on)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    sent: tasks
      .filter((t) => t.done_at && new Date(t.done_at).getTime() >= cutoff)
      .sort((a, b) => (a.done_at! > b.done_at! ? -1 : 1))
      .slice(0, SENT_LIST_MAX),
  };
}

export function isExternalLink(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

/** The Field Note's notes: the task's notes, its link, and where it came from. */
export function fieldNoteNotes(
  t: FutureTask,
  siteUrl: string,
  today: string,
): string {
  const lines: string[] = [];
  if (t.notes) lines.push(t.notes);
  if (t.link)
    lines.push(
      isExternalLink(t.link)
        ? t.link
        : `${siteUrl.replace(/\/$/, "")}${t.link}`,
    );
  let from = "From Future Tasks";
  if (t.due_on && t.due_on < today)
    from += ` (was due ${prettyDate(t.due_on, false)})`;
  if (t.repeat !== "none")
    from += ` · ${repeatLabel(t.repeat).toLowerCase()}; next ${prettyDate(nextAfter(t.due_on!, t.repeat, t.anchor_day, today))}`;
  lines.push(from);
  return lines.join("\n\n");
}

/** Slack's mrkdwn needs &, <, > escaped. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slackMessage(
  sent: FutureTask[],
  today: string,
  siteUrl: string,
): { text: string; blocks: unknown[] } | null {
  if (sent.length === 0) return null;
  const n = sent.length;
  const head = `${n} future task${n === 1 ? "" : "s"} added to Field Notes`;
  const lines = sent.map((t) => {
    const when =
      t.due_on && t.due_on < today
        ? ` (was due ${prettyDate(t.due_on, false)})`
        : "";
    return `• ${slackEscape(t.title)}${when}`;
  });
  const url = `${siteUrl.replace(/\/$/, "")}/field-notes`;
  return {
    text: `${head}: ${sent.map((t) => t.title).join(", ")}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${head}*\n${lines.join("\n")}` },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open Field Notes" },
            url,
          },
        ],
      },
    ],
  };
}
