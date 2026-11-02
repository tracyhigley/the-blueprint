// Future Tasks — database side. Every query filters by blueprint_id so each
// blueprint keeps its own list. `sb` is either the signed-in user's client
// (RLS applies) or the service-role client for the morning job.

import {
  type CleanTask,
  type FutureTask,
  dueTasks,
  fieldNoteNotes,
  futureTasksToday,
  nextAfter,
  putBackPatch,
  sentPatch,
  slackMessage,
} from "./future-tasks";

// Loosely typed on purpose: works with the real Supabase client and the
// in-memory fake used by the tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

const TABLE = "future_tasks";

export class TaskGone extends Error {
  constructor() {
    super("that task isn't on this list any more");
  }
}

function fail(error: { message: string } | null | undefined): void {
  if (error) throw new Error(error.message);
}

export async function listTasks(
  sb: Db,
  blueprintId: string,
): Promise<FutureTask[]> {
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("blueprint_id", blueprintId);
  fail(error);
  return (data ?? []) as FutureTask[];
}

export async function getTask(
  sb: Db,
  blueprintId: string,
  id: string,
): Promise<FutureTask> {
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("blueprint_id", blueprintId)
    .eq("id", id)
    .maybeSingle();
  fail(error);
  if (!data) throw new TaskGone();
  return data as FutureTask;
}

export async function addTask(
  sb: Db,
  blueprintId: string,
  userId: string,
  task: CleanTask,
): Promise<FutureTask> {
  const { data, error } = await sb
    .from(TABLE)
    .insert({ ...task, blueprint_id: blueprintId, created_by: userId })
    .select("*")
    .single();
  fail(error);
  return data as FutureTask;
}

async function patchTask(
  sb: Db,
  blueprintId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await sb
    .from(TABLE)
    .update(patch)
    .eq("blueprint_id", blueprintId)
    .eq("id", id)
    .select("id");
  fail(error);
  if (!data?.length) throw new TaskGone();
}

export async function editTask(
  sb: Db,
  blueprintId: string,
  id: string,
  task: CleanTask,
): Promise<void> {
  await getTask(sb, blueprintId, id);
  // A new date means a fresh start: forget which date was last sent.
  await patchTask(sb, blueprintId, id, {
    ...task,
    sent_on: null,
    updated_at: new Date().toISOString(),
  });
}

/** Done from the page: one-off → Done list; repeat → next date after today. */
export async function markDone(
  sb: Db,
  blueprintId: string,
  id: string,
  userId: string,
  today = futureTasksToday(),
): Promise<{ already?: true; next?: string }> {
  const t = await getTask(sb, blueprintId, id);
  if (t.done_at) return { already: true };
  const now = new Date().toISOString();
  if (t.repeat === "none") {
    await patchTask(sb, blueprintId, id, {
      done_at: now,
      done_by: userId,
      updated_at: now,
    });
    return {};
  }
  const next = nextAfter(t.due_on!, t.repeat, t.anchor_day, today);
  await patchTask(sb, blueprintId, id, {
    due_on: next,
    last_done_at: now,
    sent_on: null,
    updated_at: now,
  });
  return { next };
}

export async function putBack(
  sb: Db,
  blueprintId: string,
  id: string,
  today = futureTasksToday(),
): Promise<void> {
  const t = await getTask(sb, blueprintId, id);
  if (!t.done_at) return;
  await patchTask(sb, blueprintId, id, {
    ...putBackPatch(t, today, new Date().toISOString()),
    done_by: null,
  });
}

export async function deleteTask(
  sb: Db,
  blueprintId: string,
  id: string,
): Promise<void> {
  await getTask(sb, blueprintId, id);
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("blueprint_id", blueprintId)
    .eq("id", id);
  fail(error);
}

/**
 * Copies every due task in one blueprint into Field Notes. Each task is
 * claimed first (an update guarded by its updated_at), so two overlapping
 * runs can never add the same task twice. Returns the tasks that went in.
 */
export async function sendDueForBlueprint(
  admin: Db,
  blueprintId: string,
  opts: { today: string; siteUrl: string; now?: Date },
): Promise<FutureTask[]> {
  const tasks = dueTasks(await listTasks(admin, blueprintId), opts.today);
  if (tasks.length === 0) return [];

  const { data: blueprint, error: vErr } = await admin
    .from("blueprints")
    .select("owner_id")
    .eq("id", blueprintId)
    .maybeSingle();
  fail(vErr);
  if (!blueprint?.owner_id) return [];

  const sent: FutureTask[] = [];
  for (const t of tasks) {
    const nowIso = (opts.now ?? new Date()).toISOString();
    const patch = sentPatch(t, opts.today, nowIso);

    const { data: claimed, error: claimErr } = await admin
      .from(TABLE)
      .update(patch)
      .eq("blueprint_id", blueprintId)
      .eq("id", t.id)
      .eq("updated_at", t.updated_at)
      .select("id");
    fail(claimErr);
    if (!claimed?.length) continue; // someone else got it, or it changed

    const restore = async () => {
      await admin
        .from(TABLE)
        .update({
          due_on: t.due_on,
          done_at: t.done_at,
          last_done_at: t.last_done_at,
          sent_on: t.sent_on,
          updated_at: t.updated_at,
        })
        .eq("blueprint_id", blueprintId)
        .eq("id", t.id);
    };

    const { data: item, error: itemErr } = await admin
      .from("items")
      .insert({
        blueprint_id: blueprintId,
        user_id: blueprint.owner_id,
        box: "DROP",
        title: t.title,
        notes: fieldNoteNotes(t, opts.siteUrl, opts.today),
        // a to-do the hub sent keeps its source and key, so closing it by key also closes this note
        ...(t.external_key ? { tag: t.source, source: t.source, external_key: t.external_key } : {}),
        urgent: false,
        must: false,
        should: false,
        pinned: false,
      })
      .select("id")
      .single();
    if (itemErr || !item?.id) {
      await restore();
      throw new Error(itemErr?.message ?? "Couldn't add the Field Note");
    }

    await admin.from("captures").insert({
      blueprint_id: blueprintId,
      user_id: blueprint.owner_id,
      raw: t.title,
      source: "future_tasks",
      item_id: item.id,
    });
    await admin
      .from(TABLE)
      .update({ last_item_id: item.id })
      .eq("blueprint_id", blueprintId)
      .eq("id", t.id);

    sent.push(t);
  }
  return sent;
}

/** Posts one Slack message for the tasks just sent. Quiet when there are none. */
export async function notifySlack(
  sent: FutureTask[],
  today: string,
  siteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const msg = slackMessage(sent, today, siteUrl);
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!msg || !url) return false;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error(`Slack said ${res.status}`);
  return true;
}

/** The morning job: every blueprint with something due. */
export async function sendAllDue(
  admin: Db,
  opts: { siteUrl: string; today?: string; fetchImpl?: typeof fetch },
): Promise<{ ok: boolean; sent: number; errors: string[] }> {
  const today = opts.today ?? futureTasksToday();
  const errors: string[] = [];
  const { data, error } = await admin
    .from(TABLE)
    .select("blueprint_id")
    .is("done_at", null)
    .lte("due_on", today);
  if (error) return { ok: false, sent: 0, errors: [error.message] };

  const blueprintIds = [
    ...new Set(((data ?? []) as { blueprint_id: string }[]).map((r) => r.blueprint_id)),
  ];
  let total = 0;
  for (const blueprintId of blueprintIds) {
    try {
      const sent = await sendDueForBlueprint(admin, blueprintId, {
        today,
        siteUrl: opts.siteUrl,
      });
      total += sent.length;
      try {
        await notifySlack(sent, today, opts.siteUrl, opts.fetchImpl);
      } catch (e) {
        errors.push(
          `${blueprintId} slack: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } catch (e) {
      errors.push(`${blueprintId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: errors.length === 0, sent: total, errors };
}
