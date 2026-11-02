// Server-side data access. Fails gracefully when Supabase env isn't set yet,
// so the UI can render in fixture/empty mode during early local dev.

import { supabaseServer } from "./supabase/server";
import type { Item, BoxKey } from "./types";

function envReady() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

function rowToItem(r: any): Item {
  return {
    id: r.id,
    box: r.box,
    title: r.title,
    area: r.area,
    minutes: r.minutes,
    urgent: !!r.urgent,
    must: !!r.must,
    should: !!r.should,
    todayOrder: r.today_order,
    atmOrder: r.atm_order,
    sourceTaskId: r.source_task_id ?? null,
    energy: r.energy,
    category: r.category,
    potential: r.potential,
    person: r.person,
    tag: r.tag,
    notes: r.notes,
    body: r.body,
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end,
    actualStart: r.actual_start,
    actualEnd: r.actual_end,
    state: r.state,
    pinned: !!r.pinned,
    evening: !!r.evening,
    createdAt: r.created_at,
    modifiedAt: r.modified_at,
    deletedAt: r.deleted_at,
  };
}

export async function getItemsByBox(box: BoxKey): Promise<Item[]> {
  if (!envReady()) return [];
  const sb = await supabaseServer();
  let query = sb
    .from("items")
    .select("*")
    .eq("box", box)
    .is("deleted_at", null);
  if (box === "ATM") {
    query = query
      .order("atm_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
  } else {
    query = query
      .order("today_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
  }
  const { data, error } = await query;
  if (error) {
    console.warn("getItemsByBox error", error.message);
    return [];
  }
  return (data ?? []).map(rowToItem);
}

export async function getAllItems(): Promise<Item[]> {
  if (!envReady()) return [];
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("items")
    .select("*")
    .is("deleted_at", null);
  if (error) {
    console.warn("getAllItems error", error.message);
    return [];
  }
  return (data ?? []).map(rowToItem);
}

export async function getDayInputs(date: string) {
  if (!envReady()) return null;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("day_inputs")
    .select("*")
    .eq("date", date)
    .maybeSingle();
  return data;
}

export async function getSettings() {
  if (!envReady()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("*").maybeSingle();
  return data;
}

export async function getCurrentBlueprint() {
  if (!envReady()) return null;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("blueprint_members")
    .select("blueprint_id, role, blueprint:blueprints(id, name)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const v = data.blueprint as unknown as { id: string; name: string } | null;
  return v ? { id: v.id, name: v.name, role: data.role as "owner" | "editor" } : null;
}

// Fixture day used when no `day_inputs` row exists yet.
export function defaultDayInputs(date: string) {
  return {
    date,
    hours_available: 7,
    creative: 3,
    prob_solv: 4,
    tie_break: "PROB-SOLV" as const,
    end_of_day: "16:30",
  };
}
