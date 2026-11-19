// Master Project Plans read-side helpers. Projects are long-horizon "building
// projects" — separate from items, deliberately outside the daily engine.

import { supabaseServer } from "./supabase/server";
import { normalizePlan, type TenDayPlan } from "./ten-day-plan";
import type {
  ProjectPhase,
  ProjectLogEntry,
  ProjectTask,
} from "./project-phases";

export { PHASES, phaseLabel } from "./project-phases";
export type {
  ProjectPhase,
  ProjectLogEntry,
  ProjectTask,
} from "./project-phases";

export type Project = {
  id: string;
  building: string; // building key from settings.buildings
  title: string;
  phase: ProjectPhase;
  why: string | null;
  doneLooksLike: string | null;
  sketch: string | null;
  systems: string | null;
  log: ProjectLogEntry[];
  tasks: ProjectTask[];
  completedAt: string | null;
  createdAt: string;
  modifiedAt: string;
  // Manual drag-order, null until someone actually drags a card. Separate
  // fields because the two pages show different (overlapping) subsets of
  // active projects — same reasoning as items.today_order vs atm_order.
  activeOrder: number | null;
  taskGroupOrder: number | null;
  // Project Plan dropdowns — 1, 2, or 3, null until set.
  priority: number | null;
  daysToBuild: number | null;
  // Strategy key from the building's strategies (settings.buildings), null
  // when the project hasn't been sorted into one.
  strategy: string | null;
};

function envReady() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

function normalizeLog(raw: unknown): ProjectLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e: any) => e && typeof e.date === "string" && typeof e.text === "string",
    )
    .map((e: any) => ({ date: e.date, text: e.text }));
}

function normalizeTasks(raw: unknown): ProjectTask[] {
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

function rowToProject(r: any): Project {
  return {
    id: r.id,
    building: r.building,
    title: r.title,
    phase: r.phase,
    why: r.why,
    doneLooksLike: r.done_looks_like,
    sketch: r.sketch,
    systems: r.systems,
    log: normalizeLog(r.log),
    tasks: normalizeTasks(r.tasks),
    completedAt: r.completed_at,
    createdAt: r.created_at,
    modifiedAt: r.modified_at,
    activeOrder: typeof r.active_order === "number" ? r.active_order : null,
    taskGroupOrder:
      typeof r.task_group_order === "number" ? r.task_group_order : null,
    priority: typeof r.priority === "number" ? r.priority : null,
    daysToBuild: typeof r.days_to_build === "number" ? r.days_to_build : null,
    strategy: typeof r.strategy === "string" && r.strategy ? r.strategy : null,
  };
}

export async function getProjects(): Promise<Project[]> {
  if (!envReady()) return [];
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("projects")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("getProjects error", error.message);
    return [];
  }
  return (data ?? []).map(rowToProject);
}

export async function getProjectsByBuilding(
  building: string,
): Promise<Project[]> {
  if (!envReady()) return [];
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("projects")
    .select("*")
    .eq("building", building)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("getProjectsByBuilding error", error.message);
    return [];
  }
  return (data ?? []).map(rowToProject);
}

export async function getProject(id: string): Promise<Project | null> {
  if (!envReady()) return null;
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("projects")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return rowToProject(data);
}

// The 10-Day Plan (settings.ten_day_plan) — see lib/ten-day-plan.ts for the
// shape and lib/plan-actions.ts for the write side.
export async function getTenDayPlan(): Promise<TenDayPlan> {
  if (!envReady()) return normalizePlan(null);
  const sb = await supabaseServer();
  const { data } = await sb
    .from("settings")
    .select("ten_day_plan")
    .maybeSingle();
  return normalizePlan(data?.ten_day_plan);
}
