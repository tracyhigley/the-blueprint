// To-dos sent by the hub — database side. Every query filters by
// blueprint_id. `admin` is the service-role client (the hub has no
// signed-in user); loosely typed so the tests can use an in-memory fake.

import type { HubTodo } from "./hub-todos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

function fail(error: { message: string } | null | undefined): void {
  if (error) throw new Error(error.message);
}

export type HubTodoOut = {
  source: string;
  key: string;
  title: string;
  due_on: string | null;
  link: string | null;
  notes: string | null;
  where: "future_tasks" | "field_notes";
  /** waiting = dated, its day hasn't come; open = on the list now */
  status: "waiting" | "open";
};

async function find(admin: Db, table: string, blueprintId: string, t: { source: string; key: string }) {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .eq("blueprint_id", blueprintId)
    .eq("source", t.source)
    .eq("external_key", t.key)
    .maybeSingle();
  fail(error);
  return data as Record<string, unknown> | null;
}

/**
 * Adds the to-do, or updates it if this source and key already exist.
 * A to-do that was ticked off stays ticked off unless `reopen` is set.
 * Returns what happened so the hub can log it.
 */
export async function upsertHubTodo(
  admin: Db,
  blueprintId: string,
  ownerId: string,
  t: HubTodo,
): Promise<"created" | "updated" | "closed"> {
  const item = await find(admin, "items", blueprintId, t);
  const future = await find(admin, "future_tasks", blueprintId, t);
  const itemOpen = item && item.state !== "done" && !item.deleted_at;
  const futureOpen = future && !future.done_at;

  if (itemOpen || futureOpen) {
    const now = new Date().toISOString();
    if (itemOpen) {
      const { error } = await admin
        .from("items")
        .update({ title: t.title, notes: t.notes, modified_at: now })
        .eq("blueprint_id", blueprintId)
        .eq("id", item.id);
      fail(error);
    }
    if (futureOpen) {
      const { error } = await admin
        .from("future_tasks")
        .update({ title: t.title, due_on: t.due_on, link: t.link, notes: t.notes, sent_on: null, updated_at: now })
        .eq("blueprint_id", blueprintId)
        .eq("id", future.id);
      fail(error);
    }
    return "updated";
  }
  if ((item || future) && !t.reopen) return "closed";

  if (item) {
    const { error } = await admin.from("items").update({ state: null, deleted_at: null }).eq("blueprint_id", blueprintId).eq("id", item.id);
    fail(error);
  }
  if (future) {
    const { error } = await admin
      .from("future_tasks")
      .update({ done_at: null, done_by: null, sent_on: null, due_on: t.due_on, title: t.title, link: t.link, notes: t.notes })
      .eq("blueprint_id", blueprintId)
      .eq("id", future.id);
    fail(error);
  }
  if (item || future) return "created";

  if (t.due_on) {
    const { error } = await admin.from("future_tasks").insert({
      blueprint_id: blueprintId,
      title: t.title,
      due_on: t.due_on,
      repeat: "none",
      link: t.link,
      notes: t.notes,
      source: t.source,
      external_key: t.key,
    });
    fail(error);
  } else {
    const { error } = await admin.from("items").insert({
      blueprint_id: blueprintId,
      user_id: ownerId,
      box: "DROP",
      title: t.title,
      notes: t.notes,
      tag: t.source,
      source: t.source,
      external_key: t.key,
      urgent: false,
      must: false,
      should: false,
      pinned: false,
    });
    fail(error);
  }
  return "created";
}

/** Ticks the to-do off (in Future Tasks, and in Field Notes if it was already sent there). Returns how many rows changed. */
export async function closeHubTodo(
  admin: Db,
  blueprintId: string,
  t: { source: string; key: string },
): Promise<number> {
  const now = new Date().toISOString();
  let n = 0;
  const { data: items, error: e1 } = await admin
    .from("items")
    .update({ state: "done", modified_at: now })
    .eq("blueprint_id", blueprintId)
    .eq("source", t.source)
    .eq("external_key", t.key)
    .is("deleted_at", null)
    .select("id");
  fail(e1);
  n += items?.length ?? 0;
  const { data: tasks, error: e2 } = await admin
    .from("future_tasks")
    .update({ done_at: now, updated_at: now })
    .eq("blueprint_id", blueprintId)
    .eq("source", t.source)
    .eq("external_key", t.key)
    .is("done_at", null)
    .select("id");
  fail(e2);
  return n + (tasks?.length ?? 0);
}

/** Every hub to-do still open, optionally only one source. Dated ones not yet sent show as "waiting". */
export async function listHubTodos(admin: Db, blueprintId: string, source?: string): Promise<HubTodoOut[]> {
  const out: HubTodoOut[] = [];
  let q = admin.from("items").select("*").eq("blueprint_id", blueprintId).not("external_key", "is", null).is("deleted_at", null);
  if (source) q = q.eq("source", source);
  const { data: items, error: e1 } = await q;
  fail(e1);
  for (const r of (items ?? []) as Record<string, string | null>[])
    if (r.state !== "done")
      out.push({ source: r.source!, key: r.external_key!, title: r.title!, due_on: null, link: null, notes: r.notes ?? null, where: "field_notes", status: "open" });
  let f = admin.from("future_tasks").select("*").eq("blueprint_id", blueprintId).not("external_key", "is", null).is("done_at", null);
  if (source) f = f.eq("source", source);
  const { data: tasks, error: e2 } = await f;
  fail(e2);
  for (const r of (tasks ?? []) as Record<string, string | null>[])
    out.push({ source: r.source!, key: r.external_key!, title: r.title!, due_on: r.due_on ?? null, link: r.link ?? null, notes: r.notes ?? null, where: "future_tasks", status: "waiting" });
  return out;
}
