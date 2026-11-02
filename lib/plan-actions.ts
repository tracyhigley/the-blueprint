"use server";

// Server Actions for the Master Project Plans — buildings config + projects.
// Kept separate from lib/actions.ts: the planning layer's own actions never
// initiate changes to items or the daily schedule on their own. The two
// narrow bridges are the "Project Tasks × Today" section below (adds/removes
// a linked Today item) and markProjectTaskDoneCore, which lib/actions.ts
// calls into from completeTodayItem so that checking a project-linked item
// done from Today's side stays in sync with its Project Plan checklist.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { describeZodError } from "@/lib/zod-error";
import { todayYmd } from "@/lib/day-timezone";
import {
  isDayKey,
  type DayKey,
  type WeekBuildings,
  type WeekDayProjects,
} from "@/lib/week-days";

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

// ─── Buildings (settings.buildings) ─────────────────────────────────────────

const BuildingConfig = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  meta: z.string().max(120).optional().default(""),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function saveBuildingConfig(
  buildings: z.input<typeof BuildingConfig>[],
) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  let parsed;
  try {
    parsed = buildings.map((b) => BuildingConfig.parse(b));
  } catch (e) {
    throw new Error(describeZodError(e) ?? "Invalid building settings.");
  }
  await sb.from("settings").upsert({ blueprint_id: blueprintId, buildings: parsed });
  revalidatePath("/project-plans", "layout");
  revalidatePath("/settings/buildings");
}

// ─── This Week (settings.week_buildings / settings.week_day_projects) ──────
// A fixed Sun–Sat template (not tied to calendar dates, see lib/week-days.ts).
// Each day can have more than one building chosen (multi-select); within a
// building that has projects under construction, one project can be
// "featured" for that day via a dropdown. Both read-modify-write on the
// single settings row so a rapid edit never clobbers another day's/
// building's choice made moments earlier.

export async function saveWeekBuildings(day: DayKey, buildingKeys: string[]) {
  if (!isDayKey(day)) throw new Error("Invalid day");
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const clean = Array.from(
    new Set(
      buildingKeys.filter((k) => typeof k === "string" && k.trim().length > 0),
    ),
  );
  const { data } = await sb
    .from("settings")
    .select("week_buildings, week_day_projects")
    .eq("blueprint_id", blueprintId)
    .maybeSingle();
  const currentBuildings = (data?.week_buildings as WeekBuildings | null) ?? {};
  const nextBuildings: WeekBuildings = { ...currentBuildings, [day]: clean };

  // Drop any featured-project pick for a building that just got unchecked
  // for this day, so a hidden pick doesn't silently reappear if it's
  // re-checked later with stale state.
  const currentProjects =
    (data?.week_day_projects as WeekDayProjects | null) ?? {};
  const dayProjects = { ...(currentProjects[day] ?? {}) };
  for (const buildingKey of Object.keys(dayProjects)) {
    if (!clean.includes(buildingKey)) delete dayProjects[buildingKey];
  }
  const nextProjects: WeekDayProjects = {
    ...currentProjects,
    [day]: dayProjects,
  };

  const { error } = await sb.from("settings").upsert({
    blueprint_id: blueprintId,
    week_buildings: nextBuildings,
    week_day_projects: nextProjects,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/this-week");
}

export async function saveWeekDayProject(
  day: DayKey,
  building: string,
  projectId: string | null,
) {
  if (!isDayKey(day)) throw new Error("Invalid day");
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const { data } = await sb
    .from("settings")
    .select("week_day_projects")
    .eq("blueprint_id", blueprintId)
    .maybeSingle();
  const current = (data?.week_day_projects as WeekDayProjects | null) ?? {};
  const dayProjects = { ...(current[day] ?? {}) };
  if (projectId) dayProjects[building] = projectId;
  else delete dayProjects[building];
  const next: WeekDayProjects = { ...current, [day]: dayProjects };
  const { error } = await sb
    .from("settings")
    .upsert({ blueprint_id: blueprintId, week_day_projects: next });
  if (error) throw new Error(error.message);
  revalidatePath("/this-week");
}

// This Week's Writing Project(s) — a straight full-replace of the picked
// project ids (unlike saveWeekBuildings, this field doesn't interact with
// any other column, so no cross-field merge needed). The client always
// sends its complete current selection.
export async function saveWeekWritingProjects(projectIds: string[]) {
  const { sb } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const clean = Array.from(
    new Set(
      projectIds.filter((id) => typeof id === "string" && id.trim().length > 0),
    ),
  );
  const { error } = await sb
    .from("settings")
    .upsert({ blueprint_id: blueprintId, week_writing_projects: clean });
  if (error) throw new Error(error.message);
  revalidatePath("/this-week");
}

// ─── Projects ────────────────────────────────────────────────────────────────

const Phase = z.enum(["idea", "planning", "building", "complete"]);

export async function createProject(
  building: string,
  title: string,
  phase: z.input<typeof Phase> = "idea",
) {
  const { sb, user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Give it a name first");
  const { error } = await sb.from("projects").insert({
    blueprint_id: blueprintId,
    user_id: user.id,
    building,
    title: cleanTitle,
    phase: Phase.parse(phase),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/project-plans", "layout");
}

// Turns a note (a long-form write-up sitting in Notes) into a real project.
// Always lands as an "idea" — the note's text becomes the project's sketch.
// The note itself is left alone; nothing is deleted here.
export async function createProjectFromNote(
  building: string,
  title: string,
  sketch: string,
) {
  const { sb, user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Give it a name first");
  const { data, error } = await sb
    .from("projects")
    .insert({
      blueprint_id: blueprintId,
      user_id: user.id,
      building,
      title: cleanTitle,
      phase: "idea",
      sketch: sketch.trim() || null,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  revalidatePath("/project-plans", "layout");
  return data?.id as string | undefined;
}

const ProjectPatch = z.object({
  title: z.string().min(1).max(200).optional(),
  why: z.string().nullable().optional(),
  done_looks_like: z.string().nullable().optional(),
  sketch: z.string().nullable().optional(),
  systems: z.string().nullable().optional(),
  building: z.string().min(1).max(40).optional(),
  priority: z.number().int().min(1).max(3).nullable().optional(),
  days_to_build: z.number().int().min(1).max(3).nullable().optional(),
});

export async function updateProjectPatch(
  id: string,
  patch: z.input<typeof ProjectPatch>,
) {
  const { sb } = await requireUser();
  const parsed = ProjectPatch.parse(patch);
  const { error } = await sb
    .from("projects")
    .update({ ...parsed, modified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/project-plans", "layout");
}

export async function setProjectPhase(
  id: string,
  phase: z.input<typeof Phase>,
) {
  const { sb } = await requireUser();
  const parsed = Phase.parse(phase);
  const { error } = await sb
    .from("projects")
    .update({
      phase: parsed,
      completed_at: parsed === "complete" ? new Date().toISOString() : null,
      modified_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/project-plans", "layout");
}

// `date` comes from the client so log entries carry the user's local day,
// not the server's.
export async function addProjectLog(id: string, text: string, date: string) {
  const { sb } = await requireUser();
  const cleanText = text.trim();
  if (!cleanText) return;
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("projects")
    .select("log")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const log = Array.isArray(data?.log) ? data.log : [];
  const { error: updateError } = await sb
    .from("projects")
    .update({
      log: [...log, { date: cleanDate, text: cleanText }],
      modified_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/project-plans", "layout");
}

// ─── Project tasks ───────────────────────────────────────────────────────────
// Lightweight checklist per project, stored the same way as `log`. A task's
// `onTaskList` flag decides whether it currently surfaces on the Project
// Tasks page. `done` is separate — set only via markProjectTaskDone (the
// Project Tasks page's DONE button), and shown struck through back on the
// project's checklist so finishing something there is visible here too.
// Deleting the task (deleteProjectTask) is still how you clear it for good.

function normalizeTasks(raw: unknown): {
  id: string;
  text: string;
  minutes: number | null;
  onTaskList: boolean;
  done: boolean;
  urgent: boolean;
  todayDate: string | null;
  createdAt: string;
}[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t: any) => t && typeof t.id === "string" && typeof t.text === "string",
    )
    .map((t: any) => ({
      id: t.id,
      text: t.text,
      minutes: typeof t.minutes === "number" ? t.minutes : null,
      onTaskList: !!t.onTaskList,
      done: !!t.done,
      urgent: !!t.urgent,
      todayDate: typeof t.todayDate === "string" ? t.todayDate : null,
      createdAt:
        typeof t.createdAt === "string"
          ? t.createdAt
          : new Date().toISOString(),
    }));
}

export async function addProjectTask(
  projectId: string,
  text: string,
  minutes: number | null = null,
) {
  const { sb } = await requireUser();
  const clean = text.trim();
  if (!clean) throw new Error("Give the task a name first");
  const cleanMinutes =
    typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0
      ? Math.round(minutes)
      : null;
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const tasks = normalizeTasks(data?.tasks);
  const task = {
    id: crypto.randomUUID(),
    text: clean,
    minutes: cleanMinutes,
    onTaskList: false,
    done: false,
    urgent: false,
    todayDate: null,
    createdAt: new Date().toISOString(),
  };
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks: [...tasks, task], modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
  return task;
}

export async function setProjectTaskOnList(
  projectId: string,
  taskId: string,
  onTaskList: boolean,
) {
  const { sb } = await requireUser();
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Checking a task back on means it's active again, not done.
  const tasks = normalizeTasks(data?.tasks).map((t) =>
    t.id === taskId
      ? { ...t, onTaskList, done: onTaskList ? false : t.done }
      : t,
  );
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks, modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
}

// Shared core of "mark done everywhere": struck through on the project's
// checklist, off the Project Tasks page, and its linked Today item (if any)
// cleared out. Takes a caller-supplied Supabase client so both the planning
// layer (markProjectTaskDone, below) and the daily-engine layer
// (completeTodayItem in lib/actions.ts, reached the moment Today's done
// click finishes an item that started life as a project task) can finish
// the same operation from whichever side the user acted on.
export async function markProjectTaskDoneCore(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  projectId: string,
  taskId: string,
) {
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const tasks = normalizeTasks(data?.tasks).map((t) =>
    t.id === taskId ? { ...t, done: true, onTaskList: false } : t,
  );
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks, modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);
  // Finishing it here means it's done everywhere — clear out a linked
  // Today item too, rather than leaving a stale obligation behind.
  await sb
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("source_project_id", projectId)
    .eq("source_task_id", taskId)
    .is("deleted_at", null);
}

// Called from the DONE button on the Project Tasks page. Marks the task
// done (struck through on the project's checklist) and takes it off the
// Project Tasks page — the task itself isn't deleted.
export async function markProjectTaskDone(projectId: string, taskId: string) {
  const { sb } = await requireUser();
  await markProjectTaskDoneCore(sb, projectId, taskId);
  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
  revalidatePath("/");
  revalidatePath("/maint-tasks");
}

export async function deleteProjectTask(projectId: string, taskId: string) {
  const { sb } = await requireUser();
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const tasks = normalizeTasks(data?.tasks).filter((t) => t.id !== taskId);
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks, modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);
  // The task is gone for good — don't leave an orphaned Today item pointing
  // at it.
  await sb
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("source_project_id", projectId)
    .eq("source_task_id", taskId)
    .is("deleted_at", null);
  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
  revalidatePath("/");
  revalidatePath("/maint-tasks");
}

// Reorders a project's task checklist to match the given id sequence.
// Order lives purely in array position within the `tasks` JSON column, so
// this just re-sorts that array — same shape as every other project-task
// mutation here (read, transform, write whole array back).
export async function reorderProjectTasks(
  projectId: string,
  taskIds: string[],
) {
  const { sb } = await requireUser();
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const tasks = normalizeTasks(data?.tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const reordered = taskIds
    .map((id) => byId.get(id))
    .filter((t): t is (typeof tasks)[number] => !!t);
  // Any tasks not named in taskIds (shouldn't normally happen) stay put at
  // the end so nothing silently disappears.
  for (const t of tasks) {
    if (!taskIds.includes(t.id)) reordered.push(t);
  }
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks: reordered, modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
}

// Drag order for the Active Plans page's "Under construction" section
// (phase="building" projects, across every building, one flat reorderable
// list — formerly its own /project-plans/under-construction page, merged
// in 2026-09-13). Same shape as reorderItems/reorderAtmItems: stamp
// sequential ints across exactly the ids the client has on screen.
export async function reorderActiveProjects(projectIds: string[]) {
  const { sb } = await requireUser();
  await Promise.all(
    projectIds.map((id, i) =>
      sb
        .from("projects")
        .update({ active_order: i + 1 })
        .eq("id", id),
    ),
  );
  revalidatePath("/project-plans", "layout");
}

// Drag order for the Project Tasks page's grouped cards — a narrower list
// (only active projects with at least one task checked onto that page),
// so it gets its own order column rather than sharing active_order.
export async function reorderProjectTaskGroups(projectIds: string[]) {
  const { sb } = await requireUser();
  await Promise.all(
    projectIds.map((id, i) =>
      sb
        .from("projects")
        .update({ task_group_order: i + 1 })
        .eq("id", id),
    ),
  );
  revalidatePath("/project-tasks");
}

// Soft delete — reversible from the DB, same as items.
export async function deleteProject(id: string) {
  const { sb } = await requireUser();
  const { error } = await sb
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/project-plans", "layout");
}

// ─── Project Tasks × Today (deliberate, narrow exception) ──────────────────
// Everything above is intentionally decoupled from items/today_order (see
// the file header). "Add to Today" on the Project Tasks page is the one
// place that bridges the two systems: it creates a real Item (so the task
// actually shows up on the Today docket, same mechanism as any Maint Tasks
// row) tagged with source_project_id/source_task_id so it can be toggled
// back off cleanly and can never be duplicated (see migration
// 0018_project_task_today_link).

export async function getProjectTaskTodayLinks(): Promise<
  Record<string, { itemId: string; onToday: boolean }>
> {
  const { sb } = await requireUser();
  const { data, error } = await sb
    .from("items")
    .select("id, source_task_id, today_order")
    .not("source_task_id", "is", null)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const map: Record<string, { itemId: string; onToday: boolean }> = {};
  for (const row of data ?? []) {
    if (!row.source_task_id) continue;
    map[row.source_task_id] = {
      itemId: row.id,
      onToday: row.today_order !== null,
    };
  }
  return map;
}

// Creates (or revives) the linked Today item for a project task and puts
// it on today's plan. Safe to call more than once — the unique index on
// (source_project_id, source_task_id) plus this existence check keep it
// from ever creating a second row.
export async function addProjectTaskToToday(
  projectId: string,
  taskId: string,
  text: string,
  minutes: number | null,
) {
  const { sb, user } = await requireUser();
  const blueprintId = await currentBlueprintId();
  if (!blueprintId) throw new Error("No blueprint");

  const { data: existing, error: existingError } = await sb
    .from("items")
    .select("id, today_order")
    .eq("source_project_id", projectId)
    .eq("source_task_id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const { data: max } = await sb
    .from("items")
    .select("today_order")
    .not("today_order", "is", null)
    .order("today_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = Number(max?.today_order ?? 0) + 1;

  if (existing) {
    if (existing.today_order === null) {
      const { error } = await sb
        .from("items")
        .update({ today_order: nextOrder })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
  } else {
    // Carry the task's ⚡ urgent flag onto its Today item.
    const { data: proj } = await sb
      .from("projects")
      .select("tasks")
      .eq("id", projectId)
      .maybeSingle();
    const urgent =
      normalizeTasks(proj?.tasks).find((t) => t.id === taskId)?.urgent ?? false;
    const { error } = await sb.from("items").insert({
      blueprint_id: blueprintId,
      user_id: user.id,
      box: "COUNTER",
      title: text,
      minutes,
      urgent,
      must: false,
      should: false,
      today_order: nextOrder,
      source_project_id: projectId,
      source_task_id: taskId,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/project-tasks");
  revalidatePath("/maint-tasks");
  revalidatePath("/build");
}

// Pulls a project task back off today's plan by removing its linked Item
// entirely (soft delete) — it was only ever created for this purpose, so
// there's nothing worth keeping once it's off Today. The task itself is
// untouched on the project's checklist.
export async function removeProjectTaskFromToday(
  projectId: string,
  taskId: string,
) {
  const { sb } = await requireUser();
  const { error } = await sb
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("source_project_id", projectId)
    .eq("source_task_id", taskId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/project-tasks");
  revalidatePath("/maint-tasks");
  revalidatePath("/build");
}

// Edits a project task's text from its checklist on the Project Plan page
// (the only place task text is ever entered), keeping a linked Today item
// (if any) in sync so the two never disagree.
export async function updateProjectTaskText(
  projectId: string,
  taskId: string,
  text: string,
) {
  const clean = text.trim();
  if (!clean) throw new Error("Give the task a name first");
  const { sb } = await requireUser();
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const tasks = normalizeTasks(data?.tasks).map((t) =>
    t.id === taskId ? { ...t, text: clean } : t,
  );
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks, modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);

  await sb
    .from("items")
    .update({ title: clean })
    .eq("source_project_id", projectId)
    .eq("source_task_id", taskId)
    .is("deleted_at", null);

  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
  revalidatePath("/");
  revalidatePath("/maint-tasks");
}

// Edits a project task's minutes estimate from the Project Tasks page, and
// keeps a linked Today item (if any) in sync so the two never disagree.
export async function updateProjectTaskMinutes(
  projectId: string,
  taskId: string,
  minutes: number | null,
) {
  const { sb } = await requireUser();
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const tasks = normalizeTasks(data?.tasks).map((t) =>
    t.id === taskId ? { ...t, minutes } : t,
  );
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks, modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);

  await sb
    .from("items")
    .update({ minutes })
    .eq("source_project_id", projectId)
    .eq("source_task_id", taskId)
    .is("deleted_at", null);

  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
  revalidatePath("/");
  revalidatePath("/maint-tasks");
}

// ⚡ toggle for a Project Tasks row. Writes the flag onto the task in the
// project's tasks jsonb, and mirrors it onto the linked Today item (if the
// task is currently on Today) so it counts as urgent there too.
export async function updateProjectTaskUrgent(
  projectId: string,
  taskId: string,
  urgent: boolean,
) {
  const { sb } = await requireUser();
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const tasks = normalizeTasks(data?.tasks).map((t) =>
    t.id === taskId ? { ...t, urgent } : t,
  );
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks, modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);

  await sb
    .from("items")
    .update({ urgent })
    .eq("source_project_id", projectId)
    .eq("source_task_id", taskId)
    .is("deleted_at", null);

  revalidatePath("/project-plans", "layout");
  revalidatePath("/project-tasks");
  revalidatePath("/build");
  revalidatePath("/");
}

// ☀ toggle on Today's Currently Under Construction rows: "I'm working on
// this one today." Stores today's date on the task (so it lapses on its own
// tomorrow); only sun-marked tasks count toward Today's hour totals.
export async function setProjectTaskToday(
  projectId: string,
  taskId: string,
  on: boolean,
) {
  const { sb } = await requireUser();
  const { data, error } = await sb
    .from("projects")
    .select("tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const date = todayYmd();
  const tasks = normalizeTasks(data?.tasks).map((t) =>
    t.id === taskId ? { ...t, todayDate: on ? date : null } : t,
  );
  const { error: updateError } = await sb
    .from("projects")
    .update({ tasks, modified_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/");
  revalidatePath("/build");
}
