"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseTimeOnDate } from "@/lib/daily-plan";
import { describeZodError } from "@/lib/zod-error";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { normalizeDocumentFolderKey } from "@/lib/document-folders";
import { markProjectTaskDoneCore } from "@/lib/plan-actions";
import { ymdInTz } from "@/lib/calendar-day-bounds";
import { DAY_TIMEZONE } from "@/lib/day-timezone";
import {
  getDocuments,
  getBuildings,
  RESERVED_BOX_KEYS,
  type DocumentType,
} from "@/lib/categories";

async function requireUser() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { sb, user };
}

async function currentBlueprintId() {
  const { sb } = await requireUser();
  const { data } = await sb
    .from("blueprint_members")
    .select("blueprint_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.blueprint_id as string | undefined;
}

// --- Daily Wellness Center defaults ---

type DailyWellnessCenterDefault = {
  tag: string;
  title: string;
  minutes: number;
  // Day-of-week values (0 = Sunday ... 6 = Saturday, matching Date#getDay())
  // on which this default is skipped entirely -- not created if missing,
  // and not carried forward if an unfinished row already exists. Omit for
  // a default that runs every day.
  skipDays?: number[];
};

// Fixed daily habit tasks that belong on The Wellness Center card every day
// without Tracy having to re-add them by hand. Identified by a dedicated
// `tag` (not title) so renaming one later doesn't spawn a duplicate.
const DAILY_WELLNESS_CENTER_DEFAULTS: DailyWellnessCenterDefault[] = [
  { tag: "DAILY_WELLNESS_CENTER:MORNING_SCORE", title: "Log Morning Routine", minutes: 0 },
  { tag: "DAILY_WELLNESS_CENTER:AFTERNOON_SCORE", title: "Log Lunch Routine", minutes: 0 },
];

// Former daily defaults that have been retired. Any copy of these that is
// still open (not done) gets soft-deleted on the next day build so it stops
// showing up on Maint Tasks / Today. Completed rows are left untouched.
const RETIRED_DAILY_WELLNESS_CENTER_TAGS = [
  "DAILY_WELLNESS_CENTER:WATER",
  "DAILY_WELLNESS_CENTER:LIFT",
  "DAILY_WELLNESS_CENTER:STEPS",
  "DAILY_WELLNESS_CENTER:SUPPLEMENTS",
  "DAILY_WELLNESS_CENTER:MACROS",
];

// Hard-coded the same way app/page.tsx and lib/calendar-work-life.ts
// already hard-code the Wellness Center building key.
const WELLNESS_CENTER_BUILDING_KEY = "THE_WELLNESS_CENTER";

/**
 * Makes sure the fixed daily Wellness Center tasks are on today's plan
 * whenever the day gets (re)built. Called from inside
 * saveDayInputsPartial's step-1 today_order wipe, which fires both on the
 * first build of a day and on every rebuild ("REBUILD DAY").
 *
 * Per tag, only the single newest matching row decides what happens:
 *   - none yet -> create one, marked Today.
 *   - newest is still open (not done), no matter which day it was
 *     created -> its today_order was just wiped by the caller, so
 *     re-mark it Today. This is what stops an unfinished task from
 *     duplicating on the next build: an unchecked "Drink 64 oz water"
 *     just carries forward day after day until she checks it off.
 *   - newest is done, *finished* (actual_end) on `date` -> already
 *     finished for the day being built; leave it alone so a same-day
 *     rebuild doesn't un-finish an already-checked-off task.
 *   - newest is done but finished on an earlier day -> that habit cycle
 *     is closed; create a fresh row for `date` so the earlier
 *     completion stays intact as its own record.
 */
async function ensureDailyWellnessCenterDefaults(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  blueprintId: string,
  userId: string,
  date: string,
) {
  // Clear out any still-open copies of retired daily defaults.
  await sb
    .from("items")
    .update({ deleted_at: new Date().toISOString(), today_order: null })
    .eq("blueprint_id", blueprintId)
    .eq("box", "COUNTER")
    .is("deleted_at", null)
    .or("state.is.null,state.neq.done")
    .in("tag", RETIRED_DAILY_WELLNESS_CENTER_TAGS);

  const tags = DAILY_WELLNESS_CENTER_DEFAULTS.map((d) => d.tag);
  // Newest row per tag decides what happens — not "is there a row from
  // `date`". An unfinished habit task has to carry forward across as many
  // rebuilds/days as it takes until she actually checks it off; matching by
  // creation date instead (the original approach) treated "not created
  // today" as "doesn't exist" and spawned a fresh duplicate every day the
  // task went unfinished. See [[project-blueprint-daily-gym-defaults]].
  const { data: candidates } = await sb
    .from("items")
    .select("id, tag, state, created_at, actual_end")
    .eq("blueprint_id", blueprintId)
    .eq("box", "COUNTER")
    .is("deleted_at", null)
    .in("tag", tags)
    .order("created_at", { ascending: false });

  const latestByTag = new Map<
    string,
    { id: string; state: string | null; actualEnd: string | null }
  >();
  for (const row of candidates ?? []) {
    const tag = row.tag as string;
    // Rows arrive newest-first, so the first one seen per tag is the latest.
    if (!latestByTag.has(tag)) {
      latestByTag.set(tag, {
        id: row.id,
        state: row.state,
        actualEnd: row.actual_end,
      });
    }
  }

  const { data: maxRow } = await sb
    .from("items")
    .select("today_order")
    .eq("blueprint_id", blueprintId)
    .not("today_order", "is", null)
    .order("today_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = Number(maxRow?.today_order ?? 0);

  for (const def of DAILY_WELLNESS_CENTER_DEFAULTS) {
    if (def.skipDays?.length) {
      // Parse date's day-of-week using local Y/M/D components, same
      // convention as lib/calendar-planning.ts's fromYmd -- avoids the
      // UTC-parse shift new Date("YYYY-MM-DD") is prone to.
      const [y, m, d] = date.split("-").map((p) => parseInt(p, 10));
      const dow = new Date(y, m - 1, d).getDay();
      if (def.skipDays.includes(dow)) continue;
    }
    const latest = latestByTag.get(def.tag);
    if (latest && latest.state !== "done") {
      // Still open, whenever it was created — carry it forward onto
      // today's plan instead of spawning a duplicate. Title is re-synced
      // too, so renaming a default renames the open copy in place.
      nextOrder += 1;
      await sb
        .from("items")
        .update({ today_order: nextOrder, title: def.title })
        .eq("id", latest.id);
      continue;
    }
    if (latest && latest.state === "done") {
      // Already finished — if that happened on the day being built, leave
      // it archived (a same-day rebuild shouldn't un-finish it). If it was
      // finished on an earlier day (or never got an actual_end stamped,
      // which shouldn't happen but shouldn't loop forever either), that
      // habit cycle is closed; fall through and start a fresh one for
      // `date`. Checked against actual_end (when it was finished), not
      // created_at (when the row/cycle started) — those two dates differ
      // whenever a task carries over unfinished for a day or more before
      // finally getting checked off.
      const doneYmd = latest.actualEnd
        ? ymdInTz(new Date(latest.actualEnd), DAY_TIMEZONE)
        : null;
      if (doneYmd === date) {
        continue;
      }
    }
    nextOrder += 1;
    await sb.from("items").insert({
      blueprint_id: blueprintId,
      user_id: userId,
      box: "COUNTER",
      title: def.title,
      area: WELLNESS_CENTER_BUILDING_KEY,
      minutes: def.minutes,
      tag: def.tag,
      urgent: false,
      must: false,
      should: false,
      pinned: false,
      today_order: nextOrder,
    });
  }
}

// ─── Day inputs ────────────────────────────────────────────────────────────

const DayInputsSchema = z.object({
  date: z.string(),
  hours_available: z.coerce.number().min(0).max(24),
  creative: z.coerce.number().int().min(1).max(5),
  prob_solv: z.coerce.number().int().min(1).max(5),
  tie_break: z.enum(["CREATIVE", "PROB-SOLV"]),
  end_of_day: z.string(),
});

export async function saveDayInputs(formData: FormData) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const parsed = DayInputsSchema.parse(Object.fromEntries(formData));
  await sb.from("day_inputs").upsert({ ...parsed, blueprint_id: blueprintId });
  revalidatePath("/");
}

// The Today scratchpad — loose notes for the day. Used to be localStorage
// only (device-local, never synced); now lives on the day_inputs row so it
// shows up the same on mobile and desktop. The Docket only ever renders the
// scratchpad once a day_inputs row exists for that date (see app/page.tsx),
// so a plain update is safe — no upsert/insert path needed here.
export async function saveDayScratchpad(date: string, text: string) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const { error } = await sb
    .from("day_inputs")
    .update({ scratchpad: text.trim() === "" ? null : text })
    .eq("blueprint_id", blueprintId)
    .eq("date", date);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// Wizard partial save — only the fields you've answered so far. Used by the
// /build wizard so each step persists immediately.
const PartialDayInputs = z.object({
  date: z.string(),
  hours_available: z.coerce.number().min(0).max(24).optional(),
  creative: z.coerce.number().int().min(1).max(5).optional(),
  prob_solv: z.coerce.number().int().min(1).max(5).optional(),
  tie_break: z.enum(["CREATIVE", "PROB-SOLV"]).optional(),
  end_of_day: z.string().optional(),
  reference_now: z.string().optional(),
  reference_tz: z.string().optional(),
  // When true, wipe today_order on all items and rebuild the Wellness Center
  // defaults. Should be true only when the wizard is rebuilding the day, not
  // when just editing end_of_day inline on the Today page.
  rebuild: z.coerce.boolean().optional(),
});

export async function saveDayInputsPartial(
  patch: z.input<typeof PartialDayInputs>,
) {
  const { sb, user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const parsed = PartialDayInputs.parse(patch);

  const { data: existing } = await sb
    .from("day_inputs")
    .select(
      "hours_available, creative, prob_solv, tie_break, end_of_day",
    )
    .eq("blueprint_id", blueprintId)
    .eq("date", parsed.date)
    .maybeSingle();
  // Rebuilding the day should always start from a clean "on today" slate,
  // but ONLY when explicitly rebuilding (wizard flow). Inline edits to
  // end_of_day on the Today page must NOT wipe today selections.
  if (parsed.rebuild) {
    await sb
      .from("items")
      .update({ today_order: null })
      .eq("blueprint_id", blueprintId)
      .not("today_order", "is", null);
    await ensureDailyWellnessCenterDefaults(sb, blueprintId, user.id, parsed.date);
  }

  const { data: settingsRow } = await sb
    .from("settings")
    .select("default_hours")
    .eq("blueprint_id", blueprintId)
    .maybeSingle();
  const settingsHours = Number(settingsRow?.default_hours ?? 7);

  let hoursVal =
    parsed.hours_available ??
    (existing?.hours_available != null
      ? Number(existing.hours_available)
      : settingsHours);

  const mergedEnd =
    parsed.end_of_day !== undefined
      ? parsed.end_of_day.trim()
      : (existing?.end_of_day ?? "16:30");

  if (parsed.end_of_day !== undefined && parsed.hours_available === undefined) {
    try {
      const end = parseTimeOnDate(parsed.end_of_day.trim(), parsed.date);
      const nowRef =
        parsed.reference_now &&
        !Number.isNaN(Date.parse(parsed.reference_now))
          ? new Date(parsed.reference_now)
          : new Date();
      const ms = end.getTime() - nowRef.getTime();
      hoursVal = Math.min(24, Math.max(0, ms / (60 * 60 * 1000)));
      hoursVal = Math.round(hoursVal * 100) / 100;
    } catch {
      /* keep hoursVal */
    }
  }

  const merged = {
    blueprint_id: blueprintId,
    date: parsed.date,
    hours_available: hoursVal,
    creative: Number(parsed.creative ?? existing?.creative ?? 3),
    prob_solv: Number(parsed.prob_solv ?? existing?.prob_solv ?? 3),
    tie_break:
      (parsed.tie_break ?? existing?.tie_break ?? "PROB-SOLV") as
        | "CREATIVE"
        | "PROB-SOLV",
    end_of_day: mergedEnd,
  };

  await sb.from("day_inputs").upsert(merged, {
    onConflict: "blueprint_id,date",
    ignoreDuplicates: false,
  });

  revalidatePath("/", "layout");
}

// ─── Items: state, flags, box, captures ────────────────────────────────────

export async function setItemState(
  itemId: string,
  state: "upcoming" | "active" | "done" | "skipped" | "overrun",
) {
  const { sb } = await requireUser();
  const patch: Record<string, unknown> = { state };
  if (state === "done") {
    const { data: cur } = await sb
      .from("items")
      .select("today_order")
      .eq("id", itemId)
      .maybeSingle();
    // Keep completed items on Today's plan, but move them to the bottom.
    if ((cur?.today_order ?? null) !== null) {
      const { data: max } = await sb
        .from("items")
        .select("today_order")
        .neq("id", itemId)
        .not("today_order", "is", null)
        .order("today_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      patch.today_order = (max?.today_order ?? 0) + 1;
    }
  }
  if (state === "skipped") {
    // Skipping removes the item from today's plan — Counter/ATM toggles should
    // no longer show it as selected for today.
    patch.today_order = null;
  }
  if (state === "active") patch.actual_start = new Date().toISOString();
  if (state === "done" || state === "skipped" || state === "overrun") {
    patch.actual_end = new Date().toISOString();
  }
  await sb.from("items").update(patch).eq("id", itemId);
  revalidatePath("/");
  revalidatePath("/maint-tasks");
  revalidatePath("/project-tasks");
  revalidatePath("/build");
}

export async function toggleDone(itemId: string, currentlyDone: boolean) {
  await setItemState(itemId, currentlyDone ? "upcoming" : "done");
}

export async function setItemPinned(itemId: string, pinned: boolean) {
  const { sb } = await requireUser();
  await sb.from("items").update({ pinned }).eq("id", itemId);
  revalidatePath("/");
}

export async function setItemEvening(itemId: string, evening: boolean) {
  const { sb } = await requireUser();
  const { error } = await sb.from("items").update({ evening }).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// ⚡ toggle on a Today row. Flips the item's urgent flag, and if the item
// is a Project Task pulled onto Today, flips the flag on that task in the
// project's checklist too, so Project Tasks shows the same bolt.
export async function setItemUrgent(itemId: string, urgent: boolean) {
  const { sb } = await requireUser();
  const { data: item, error } = await sb
    .from("items")
    .update({ urgent })
    .eq("id", itemId)
    .select("source_project_id, source_task_id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (item?.source_project_id && item?.source_task_id) {
    const { data: proj } = await sb
      .from("projects")
      .select("tasks")
      .eq("id", item.source_project_id)
      .maybeSingle();
    if (Array.isArray(proj?.tasks)) {
      // Edit the raw jsonb so no other task fields get dropped.
      const tasks = (proj.tasks as any[]).map((t) =>
        t && t.id === item.source_task_id ? { ...t, urgent } : t,
      );
      await sb
        .from("projects")
        .update({ tasks, modified_at: new Date().toISOString() })
        .eq("id", item.source_project_id);
    }
  }

  revalidatePath("/");
  revalidatePath("/maint-tasks");
  revalidatePath("/project-tasks");
  revalidatePath("/project-plans", "layout");
  revalidatePath("/build");
}

export async function moveItemToBox(itemId: string, box: string) {
  const { sb } = await requireUser();
  await sb.from("items").update({ box }).eq("id", itemId);
  revalidatePath("/");
  revalidatePath("/field-notes");
  revalidatePath("/maint-tasks");
  revalidatePath("/project-tasks");
  revalidatePath("/boxes");
}

export async function softDeleteItem(itemId: string) {
  const { sb } = await requireUser();
  await sb
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId);
  revalidatePath("/");
  revalidatePath("/project-tasks");
  revalidatePath("/maint-tasks");
  revalidatePath("/field-notes");
  revalidatePath("/boxes");
}

/**
 * Finishes a Today item the moment it's checked done — no more parking it
 * at the bottom of Today under a "Clear All Done" step. Branches on what
 * kind of item it is:
 *
 *   - Project Task (source_project_id/source_task_id, set only via the
 *     Project Tasks page's "Add to Today"): finished through
 *     markProjectTaskDoneCore, so the same click strikes the task through
 *     on its Project Plan checklist and drops it off the Project Tasks
 *     page. See markProjectTaskDone in lib/plan-actions.ts for the
 *     mirror-image version of this, triggered from that page's own DONE
 *     button.
 *   - Maint Task (plain Counter/ATM item): taken off today's plan and
 *     archived — state "done" + actual_end stamped, today_order cleared —
 *     so it disappears from Today and from Maint Tasks (see the state
 *     !== "done" filter there). Not soft-deleted, so the toast's Undo
 *     (undoTodayItemDone) can restore it. (There used to be a /done
 *     "Maint Done" page listing these — removed 2026-10-24.)
 */
export async function completeTodayItem(
  itemId: string,
): Promise<{ archivedAs: "project" | "maint" }> {
  const { sb } = await requireUser();
  const { data: item, error } = await sb
    .from("items")
    .select("id, source_project_id, source_task_id")
    .eq("id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) throw new Error("Item not found");

  const archivedAs: "project" | "maint" =
    item.source_project_id && item.source_task_id ? "project" : "maint";

  if (archivedAs === "project") {
    await markProjectTaskDoneCore(
      sb,
      item.source_project_id as string,
      item.source_task_id as string,
    );
  } else {
    const { error: updateError } = await sb
      .from("items")
      .update({
        state: "done",
        today_order: null,
        actual_end: new Date().toISOString(),
      })
      .eq("id", itemId);
    if (updateError) throw new Error(updateError.message);
  }

  revalidatePath("/");
  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
  revalidatePath("/maint-tasks");
  revalidatePath("/field-notes");
  revalidatePath("/boxes");
  revalidatePath("/documents");
  return { archivedAs };
}

/**
 * Reverses completeTodayItem's maint-task path — puts the item back on
 * today's plan as upcoming. Only meaningful for Maint Tasks: once a Project
 * Task is finished, its linked Today item is gone and the checklist itself
 * is the record, so that side has no single-click undo (matches how
 * finishing a task from the Project Tasks page has always worked).
 */
export async function undoTodayItemDone(itemId: string) {
  const { sb } = await requireUser();
  const { data: max } = await sb
    .from("items")
    .select("today_order")
    .not("today_order", "is", null)
    .order("today_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = Number(max?.today_order ?? 0) + 1;
  const { error } = await sb
    .from("items")
    .update({ state: "upcoming", today_order: nextOrder, actual_end: null })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/maint-tasks");
}

/** Permanently removes the row (use sparingly; soft-delete is the default elsewhere). */
export async function hardDeleteItem(itemId: string) {
  const { sb } = await requireUser();
  await sb.from("items").delete().eq("id", itemId);
  revalidatePath("/");
  revalidatePath("/project-tasks");
  revalidatePath("/maint-tasks");
  revalidatePath("/field-notes");
  revalidatePath("/boxes");
  revalidatePath("/documents");
}

// Triage a Drop item. Destination is explicit — Till is for energy-matched
// pulls (carries energy + minutes), Drawer is for obligations (carries
// urgent/must/should flags + minutes). Box is the category and works on both.
const TriagePatch = z.object({
  box_key: z.string().min(1).max(40),
  dest: z.enum(["ATM", "COUNTER"]),
  minutes: z.coerce.number().min(0).max(1440).nullable().optional(),
  energy: z.string().max(40).nullable().optional(), // Till only
  urgent: z.coerce.boolean().optional(), // Drawer only
  must: z.coerce.boolean().optional(), // Drawer only
  should: z.coerce.boolean().optional(), // Drawer only
});

export async function triageDropItem(
  itemId: string,
  patch: z.input<typeof TriagePatch>,
) {
  const { sb } = await requireUser();
  const parsed = TriagePatch.parse(patch);
  const update: Record<string, unknown> = {
    box: parsed.dest,
    minutes: parsed.minutes ?? null,
  };
  if (parsed.dest === "COUNTER") {
    update.area = parsed.box_key;
    update.category = null;
    update.energy = null;
    update.urgent = parsed.urgent ?? false;
    update.must = parsed.must ?? false;
    update.should = parsed.should ?? false;
  } else {
    update.category = parsed.box_key;
    update.area = null;
    update.energy = parsed.energy ?? null;
    update.urgent = false;
    update.must = false;
    update.should = false;
  }
  await sb.from("items").update(update).eq("id", itemId);
  revalidatePath("/", "layout");
}

const ItemPatch = z.object({
  title: z.string().min(1).max(500).optional(),
  area: z.string().max(40).nullable().optional(),
  minutes: z.coerce.number().min(0).max(1440).nullable().optional(),
  urgent: z.coerce.boolean().optional(),
  must: z.coerce.boolean().optional(),
  should: z.coerce.boolean().optional(),
  energy: z.string().max(40).nullable().optional(),
  category: z.string().max(40).nullable().optional(),
  potential: z.coerce.number().int().min(1).max(5).nullable().optional(),
  person: z.string().max(40).nullable().optional(),
  tag: z.string().max(40).nullable().optional(),
  notes: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  today_order: z.coerce.number().int().nullable().optional(),
  pinned: z.coerce.boolean().optional(),
});

/**
 * Same as updateItem but returns errors for the client. Next.js strips thrown
 * error messages from Server Actions in production; returned strings are fine.
 */
export async function updateItemPatch(
  itemId: string,
  patch: z.input<typeof ItemPatch>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let parsed: z.infer<typeof ItemPatch>;
  try {
    parsed = ItemPatch.parse(patch);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid update.";
    return { ok: false, error: msg };
  }
  const { sb } = await requireUser();
  const { error } = await sb.from("items").update(parsed).eq("id", itemId);
  if (error) {
    const code = (error as { code?: string }).code;
    const msg = error.message ?? "Couldn't save.";
    if (
      code === "42703" ||
      /column .*does not exist|could not find.*column|'should'/i.test(msg)
    ) {
      return {
        ok: false,
        error:
          'Database is missing the "should" column. In Supabase → SQL Editor run: alter table items add column if not exists should boolean not null default false;',
      };
    }
    return { ok: false, error: msg };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateItem(
  itemId: string,
  patch: z.input<typeof ItemPatch>,
) {
  const result = await updateItemPatch(itemId, patch);
  if (!result.ok) throw new Error(result.error);
}

export async function createItem(box: string, title: string, extras: z.input<typeof ItemPatch> = {}) {
  const { sb, user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const parsed = ItemPatch.parse(extras);
  const { data } = await sb
    .from("items")
    .insert({
      blueprint_id: blueprintId,
      user_id: user.id,
      box,
      title: title.trim(),
      urgent: parsed.urgent ?? false,
      must: parsed.must ?? false,
      should: parsed.should ?? false,
      pinned: parsed.pinned ?? false,
      ...parsed,
    })
    .select("id")
    .single();
  revalidatePath("/", "layout");
  revalidatePath("/boxes");
  revalidatePath("/maint-tasks");
  revalidatePath("/project-tasks");
  return data?.id;
}

export async function startItem(itemId: string) {
  await setItemState(itemId, "active");
}

// Reorder items by setting today_order to the array index.
export async function reorderItems(itemIds: string[]) {
  const { sb } = await requireUser();
  await Promise.all(
    itemIds.map((id, i) =>
      sb.from("items").update({ today_order: i + 1 }).eq("id", id),
    ),
  );
  revalidatePath("/", "layout");
}

// ATM list ordering inside a selected category panel.
export async function reorderAtmItems(itemIds: string[]) {
  const { sb } = await requireUser();
  await Promise.all(
    itemIds.map((id, i) =>
      sb.from("items").update({ atm_order: i + 1 }).eq("id", id).eq("box", "ATM"),
    ),
  );
  revalidatePath("/project-tasks");
  revalidatePath("/build");
}

// Universal "on today's plan" toggle. Used by both ATM (Withdraw) and
// Counter (Today). today_order = rank across ALL items currently on
// today's plan; null = not on today.
export async function setTodayPlan(itemId: string, on: boolean) {
  const { sb } = await requireUser();
  if (on) {
    const [{ data: max }, { data: cur }] = await Promise.all([
      sb
        .from("items")
        .select("today_order")
        .not("today_order", "is", null)
        .order("today_order", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb.from("items").select("state").eq("id", itemId).maybeSingle(),
    ]);
    const next = (max?.today_order ?? 0) + 1;
    const patch: Record<string, unknown> = { today_order: next };
    if (cur?.state === "skipped") patch.state = "upcoming";
    await sb.from("items").update(patch).eq("id", itemId);
  } else {
    await sb.from("items").update({ today_order: null }).eq("id", itemId);
  }
  revalidatePath("/");
  revalidatePath("/project-tasks");
  revalidatePath("/maint-tasks");
  revalidatePath("/build");
}

// Backwards-compat alias — Counter and the AtmPickButton both call this
// path. Same semantics; kept under the old name so the ATM "Withdraw"
// affordance keeps reading naturally.
export async function pickFromAtm(itemId: string, picked: boolean) {
  return setTodayPlan(itemId, picked);
}

const AtmBoxBudgetSchema = z.object({
  category: z.string().min(1).max(40),
  hours: z.coerce.number().min(0).max(24),
});

// Apply ATM picks in block order by selected boxes + hour budgets.
export async function applyAtmBoxBudgets(
  selections: z.input<typeof AtmBoxBudgetSchema>[],
) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");

  const parsed = selections
    .map((s) => AtmBoxBudgetSchema.parse(s))
    .filter((s) => s.hours > 0);

  // Rebuild ATM picks from scratch for this step.
  await sb
    .from("items")
    .update({ today_order: null })
    .eq("blueprint_id", blueprintId)
    .eq("box", "ATM")
    .not("today_order", "is", null);

  const { data: maxToday } = await sb
    .from("items")
    .select("today_order")
    .eq("blueprint_id", blueprintId)
    .is("deleted_at", null)
    .not("today_order", "is", null)
    .order("today_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ATM picks are intentionally scheduled at the end of the day plan.
  let todayOrder = Number(maxToday?.today_order ?? 0);
  for (const sel of parsed) {
    let remaining = Math.round(sel.hours * 60);
    if (remaining <= 0) continue;

    const { data: rows, error } = await sb
      .from("items")
      .select("id, minutes")
      .eq("blueprint_id", blueprintId)
      .eq("box", "ATM")
      .eq("category", sel.category)
      .is("deleted_at", null)
      .order("atm_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    for (const row of rows ?? []) {
      const minutes = Number(row.minutes ?? 0);
      if (minutes <= 0) continue;
      if (minutes > remaining) continue;
      todayOrder += 1;
      remaining -= minutes;
      const { error: pickErr } = await sb
        .from("items")
        .update({
          today_order: todayOrder,
          state: "upcoming",
          actual_start: null,
          actual_end: null,
        })
        .eq("id", row.id);
      if (pickErr) throw new Error(pickErr.message);
      if (remaining <= 0) break;
    }
  }

  revalidatePath("/");
  revalidatePath("/project-tasks");
  revalidatePath("/build");
}

// Custom task from Today's "+ ADD A CUSTOM TASK". Creates a regular Maint
// Task (COUNTER box, no tag, no building -> General Life) that's already
// placed on today's plan. Because it's an ordinary Maint Task row, it also
// shows on the Maint Tasks page, so if it isn't finished today it persists
// there after the next rebuild clears today_order. Completing it on Today
// marks the same row done, which drops it from Maint Tasks too.
// (Older custom blocks were tagged CUSTOM_BLOCK and stay Today-only; the
// CUSTOM_BLOCK exclusions elsewhere are kept for those legacy rows.)
export async function addCustomBlock(opts: {
  title: string;
  minutes: number;
  startISO?: string;
}) {
  const { sb, user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const start = opts.startISO ? new Date(opts.startISO) : null;
  const end = start
    ? new Date(start.getTime() + opts.minutes * 60_000)
    : null;
  // Land at the bottom of Today's current order, same convention as
  // setTodayPlan: today_order = current max + 1.
  const { data: max } = await sb
    .from("items")
    .select("today_order")
    .not("today_order", "is", null)
    .order("today_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const todayOrder = (max?.today_order ?? 0) + 1;
  await sb.from("items").insert({
    blueprint_id: blueprintId,
    user_id: user.id,
    box: "COUNTER",
    tag: null,
    title: opts.title.trim(),
    minutes: opts.minutes,
    urgent: false,
    must: true,
    should: false,
    pinned: !!start,
    scheduled_start: start?.toISOString() ?? null,
    scheduled_end: end?.toISOString() ?? null,
    today_order: todayOrder,
  });
  revalidatePath("/");
  revalidatePath("/maint-tasks");
}

// Documents: write markdown body for the single document row in a document box.
export async function saveDocument(box: string, body: string, title?: string) {
  const { sb, user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const { data: existing } = await sb
    .from("items")
    .select("id")
    .eq("box", box)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) {
    await sb
      .from("items")
      .update({ body, ...(title ? { title } : {}) })
      .eq("id", existing.id);
  } else {
    await sb.from("items").insert({
      blueprint_id: blueprintId,
      user_id: user.id,
      box,
      title: title ?? box,
      body,
      urgent: false,
      must: false,
      should: false,
      pinned: false,
    });
  }
  revalidatePath(`/documents`, "layout");
}

// Blueprint & box config.
export async function renameBlueprint(name: string) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  await sb.from("blueprints").update({ name }).eq("id", blueprintId);
  revalidatePath("/", "layout");
}

export async function createMyBlueprint(name: string) {
  const { sb, user } = await requireUser();
  const { data: v, error } = await sb
    .from("blueprints")
    .insert({ name: name.trim() || "The Blueprint", owner_id: user.id })
    .select("id")
    .single();
  if (error) throw error;
  await sb
    .from("blueprint_members")
    .insert({ blueprint_id: v.id, user_id: user.id, role: "owner" });
  revalidatePath("/", "layout");
  return v.id;
}

const BoxConfig = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  meta: z.string().max(120).optional().default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function saveBoxConfig(boxes: z.input<typeof BoxConfig>[]) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  let parsed;
  try {
    parsed = boxes.map((b) => BoxConfig.parse(b));
  } catch (e) {
    throw new Error(describeZodError(e) ?? "Invalid box settings.");
  }
  await sb.from("settings").upsert({ blueprint_id: blueprintId, boxes: parsed });
  revalidatePath("/", "layout");
}

// Folder now holds a building key (e.g. "THE_WELLNESS_CENTER") from
// settings.buildings, which is user-configurable — so this is a free string,
// not a fixed enum. normalizeDocumentFolderKey still translates any leftover
// legacy folder values forward on save.
const DocumentConfig = BoxConfig.extend({
  // Overrides BoxConfig's bare `key` — document keys route through a
  // lowercase/hyphen URL slug (slugifyDocumentKey in lib/document-folders.ts)
  // that collapses "_" and "/" to the same "-", so a key containing "/"
  // can never be reconstructed from its slug and 404s (see the
  // "SCHEDULING/PLANNING" bug fixed 2026-09-09). Enforced here as a
  // server-side backstop in case a future client path skips deriveKey.
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(
      /^[A-Z0-9_-]+$/,
      "Note key can only contain letters, numbers, _ and -.",
    ),
  folder: z.string().optional(),
});

export type DocumentKeyMigration = { from: string; to: string };

function isTrustedDocumentKeyMigration(
  from: string,
  to: string,
  prevKeys: Set<string>,
  nextKeys: Set<string>,
): boolean {
  if (!from || !to || from === to) return false;
  if (RESERVED_BOX_KEYS.has(from) || RESERVED_BOX_KEYS.has(to)) return false;
  if (!prevKeys.has(from) || nextKeys.has(from)) return false;
  if (!nextKeys.has(to)) return false;
  return true;
}

export async function saveDocumentConfig(
  documents: z.input<typeof DocumentConfig>[],
  keyMigrations?: DocumentKeyMigration[],
) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const prevDocs = await getDocuments();
  const prevKeys = new Set(prevDocs.map((d) => d.key));
  let parsed;
  try {
    parsed = documents.map((d) => {
      const row = DocumentConfig.parse(d);
      const folder = normalizeDocumentFolderKey(row.folder);
      return folder === row.folder ? row : { ...row, folder };
    });
  } catch (e) {
    throw new Error(describeZodError(e) ?? "Invalid document settings.");
  }
  const nextKeys = new Set(parsed.map((d) => d.key));

  const { data: row } = await sb
    .from("settings")
    .select("*")
    .eq("blueprint_id", blueprintId)
    .maybeSingle();
  const rowObj = row as Record<string, unknown> | null;
  const patch: Record<string, unknown> = { blueprint_id: blueprintId };
  if (rowObj && "documents" in rowObj) {
    patch.documents = parsed;
  } else if (rowObj && "records" in rowObj) {
    patch.records = parsed;
  } else {
    patch.documents = parsed;
  }

  await sb.from("settings").upsert(patch);

  const seenFrom = new Set<string>();
  for (const m of keyMigrations ?? []) {
    if (!m || typeof m.from !== "string" || typeof m.to !== "string") continue;
    const from = m.from.trim();
    const to = m.to.trim();
    if (!isTrustedDocumentKeyMigration(from, to, prevKeys, nextKeys)) continue;
    if (seenFrom.has(from)) continue;
    seenFrom.add(from);

    const { error } = await sb
      .from("items")
      .update({ box: to })
      .eq("blueprint_id", blueprintId)
      .eq("box", from)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/", "layout");
  revalidatePath("/documents", "layout");
  revalidatePath("/settings/documents", "layout");
}

function deriveDocumentKeyFromLabel(label: string): string {
  return label
    .toUpperCase()
    .replace(/[\s/]+/g, "_")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function nextUniqueDocumentKey(label: string, used: Set<string>): string {
  let base = deriveDocumentKeyFromLabel(label);
  if (!base || RESERVED_BOX_KEYS.has(base)) base = "NOTE";
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const tail = `_${n}`;
    candidate = (base.slice(0, Math.max(1, 40 - tail.length)) + tail).slice(
      0,
      40,
    );
    n++;
    if (n > 500) break;
  }
  return candidate;
}

/** Add one document category from the Documents hub (label + building). */
export async function appendDocument(labelRaw: string, folderKey: string) {
  const label = labelRaw.trim();
  if (!label) throw new Error("Enter a name for the note.");
  const buildings = await getBuildings();
  if (!buildings.some((b) => b.key === folderKey)) {
    throw new Error("Choose a building.");
  }

  const docs = await getDocuments();
  const used = new Set(docs.map((d) => d.key));
  const key = nextUniqueDocumentKey(label, used);

  const row: DocumentType = {
    key,
    label,
    meta: "reference",
    color: "#b5853a",
    folder: folderKey as DocumentType["folder"],
  };

  await saveDocumentConfig([...docs, row]);
}


/**
 * Rename a note from its own page. The visible note title is the label on
 * its settings.documents entry, so that's what changes; the key (and so the
 * URL slug) stays put so links and the stored body keep resolving. The note's
 * item row title is kept in step, same as saveDocument already does.
 */
export async function renameDocument(key: string, labelRaw: string) {
  const label = labelRaw.trim();
  if (!label) throw new Error("A note needs a title.");
  if (label.length > 60) throw new Error("Keep the title to 60 characters.");
  const docs = await getDocuments();
  if (!docs.some((d) => d.key === key)) throw new Error("Note not found.");
  await saveDocumentConfig(
    docs.map((d) => (d.key === key ? { ...d, label } : d)),
  );
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (blueprintId) {
    const { error } = await sb
      .from("items")
      .update({ title: label })
      .eq("blueprint_id", blueprintId)
      .eq("box", key)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/documents", "layout");
}

/**
 * Delete a note category from within the note itself. Removes the
 * settings.documents entry (so the note disappears from the hub, its
 * building, and stops resolving at /documents/<slug>) but — same as the
 * old Settings > Notes REMOVE button — leaves the underlying item/body
 * alone. Nothing is hard-deleted here.
 */
export async function deleteDocument(key: string) {
  const docs = await getDocuments();
  const next = docs.filter((d) => d.key !== key);
  if (next.length === docs.length) return;
  await saveDocumentConfig(next);
  revalidatePath("/documents", "layout");
}


// Capture token — generated, persisted on the settings row, surfaced in /settings.
export async function rotateCaptureToken() {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const token =
    "bp_" +
    crypto.getRandomValues(new Uint8Array(24))
      .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  await sb
    .from("settings")
    .upsert({ blueprint_id: blueprintId, capture_token: token });
  revalidatePath("/settings");
  return token;
}

// Sealed state — persisted on the settings row so the door stays shut on refresh.
export async function setSealed(sealed: boolean) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  await sb.from("settings").upsert({ blueprint_id: blueprintId, sealed });
  revalidatePath("/", "layout");
}

// ─── Capture (real session — used by the /field-notes/add page) ───

export async function addFieldNote(text: string, source: string = "mailslot") {
  const trimmed = text.trim();
  if (!trimmed) return;
  const { sb, user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");

  const { data: item, error: itemErr } = await sb
    .from("items")
    .insert({
      blueprint_id: blueprintId,
      user_id: user.id,
      box: "DROP",
      title: trimmed.slice(0, 200),
      urgent: false,
      must: false,
      should: false,
      pinned: false,
    })
    .select("id")
    .single();

  if (itemErr) throw new Error(itemErr.message);
  if (!item?.id) throw new Error("Couldn't create item.");

  const { error: capErr } = await sb.from("captures").insert({
    blueprint_id: blueprintId,
    user_id: user.id,
    raw: trimmed,
    source,
    item_id: item.id,
  });
  if (capErr) throw new Error(capErr.message);
  revalidatePath("/field-notes");
}

// ─── Settings ─────────────────────────────────────────────────────────────

const SettingsSchema = z.object({
  stressor_anchor_minutes: z.coerce.number().int().min(0).max(480),
  default_end_of_day: z.string(),
  default_hours: z.coerce.number().min(0).max(24),
});

export async function saveSettings(formData: FormData) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const raw = Object.fromEntries(formData);
  const parsed = SettingsSchema.parse(raw);
  await sb.from("settings").upsert({ ...parsed, blueprint_id: blueprintId });
  revalidatePath("/settings");
}

// ─── Blueprint members (invite / role / remove) ─────────────────────────────

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "editor"]).default("editor"),
});

export async function inviteMember(formData: FormData) {
  const { user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");

  const parsed = InviteSchema.parse(Object.fromEntries(formData));
  const admin = supabaseAdmin();

  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find(
    (u: any) => u.email?.toLowerCase() === parsed.email.toLowerCase(),
  );

  let invitedUserId: string | null = existing?.id ?? null;
  if (!invitedUserId) {
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(
      parsed.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002"}/auth/callback`,
      },
    );
    if (error) throw error;
    invitedUserId = invited.user.id;
  }

  await admin.from("blueprint_members").upsert({
    blueprint_id: blueprintId,
    user_id: invitedUserId,
    role: parsed.role,
  });
  void user;
  revalidatePath("/settings/members");
}

export async function setMemberRole(
  memberUserId: string,
  role: "owner" | "editor",
) {
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const admin = supabaseAdmin();
  await admin
    .from("blueprint_members")
    .update({ role })
    .eq("blueprint_id", blueprintId)
    .eq("user_id", memberUserId);
  revalidatePath("/settings/members");
}

export async function removeMember(memberUserId: string) {
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const admin = supabaseAdmin();
  await admin
    .from("blueprint_members")
    .delete()
    .eq("blueprint_id", blueprintId)
    .eq("user_id", memberUserId);
  revalidatePath("/settings/members");
}

void redirect;
