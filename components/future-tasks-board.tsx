"use client";

// Future Tasks page body: the add/edit form and the task lists. Every
// action POSTs to /api/future-tasks/… and then reloads the page. All text
// is rendered through React, so whatever was typed is escaped.

import { useRef, useState } from "react";
import clsx from "clsx";
import { Card } from "@/components/ui";
import {
  REPEATS,
  TITLE_MAX,
  LINK_MAX,
  NOTES_MAX,
  type FutureTask,
  type PageGroups,
  isoToEasternYmd,
  prettyDate,
  whenLine,
} from "@/lib/future-tasks";

type FormState = {
  title: string;
  show_on: string;
  repeat: string;
  link: string;
  notes: string;
  building: string;
};

const EMPTY: FormState = {
  title: "",
  show_on: "",
  repeat: "none",
  link: "",
  notes: "",
  building: "",
};

const inputCls =
  "w-full rounded-sm border border-paper-line bg-paper-bg/60 px-2.5 py-1.5 text-[14px] text-ink outline-none transition focus:border-brass focus:bg-paper-bg/80";
const labelCls =
  "font-mono text-[9px] uppercase tracking-[0.18em] text-ink-mute";
const smallBtn =
  "rounded-sm border border-paper-line px-2.5 py-1 font-mono text-[10px] tracking-wider text-ink-mute transition hover:border-brass/50 hover:text-brass disabled:opacity-50";

async function post(
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!json) return { ok: false, error: "something went wrong — try again" };
    return json;
  } catch {
    return {
      ok: false,
      error: "couldn't reach the server — check your connection",
    };
  }
}

export function FutureTasksBoard({
  groups,
  today,
  buildings = [],
}: {
  groups: PageGroups;
  today: string;
  buildings?: { key: string; label: string }[];
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set =
    (k: keyof FormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function run(path: string, body?: unknown) {
    setBusy(true);
    setStatus(null);
    const res = await post(path, body);
    if (res.ok) {
      window.location.reload();
      return true;
    }
    setStatus(res.error ?? "something went wrong — try again");
    setBusy(false);
    return false;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setStatus("type what the task is");
    if (form.repeat !== "none" && !form.show_on)
      return setStatus("a repeating task needs a first date");
    await run(
      editingId ? `/api/future-tasks/${editingId}/edit` : "/api/future-tasks",
      form,
    );
  }

  function startEdit(t: FutureTask) {
    setEditingId(t.id);
    setForm({
      title: t.title,
      show_on: t.due_on ?? "",
      repeat: t.repeat,
      link: t.link ?? "",
      notes: t.notes ?? "",
      building: t.building ?? "",
    });
    setStatus(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setStatus(null);
  }

  const total =
    groups.upcoming.length + groups.recurring.length + groups.done.length;

  return (
    <>
      <form
        ref={formRef}
        onSubmit={submit}
        className="border-paper-line/60 bg-paper-panel/40 mt-6 scroll-mt-24 rounded-sm border p-4 md:p-5"
      >
        <h2 className="serif-h text-ink text-[20px]">
          {editingId ? "Change a task" : "Add a task"}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className={labelCls}>What to do</span>
            <input
              className={inputCls}
              value={form.title}
              onChange={set("title")}
              maxLength={TITLE_MAX + 50}
              autoFocus={!editingId}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Show it on</span>
            <input
              type="date"
              // Hide the browser's "mm/dd/yyyy" hint while empty so the
              // field doesn't look filled in; it shows again on focus.
              className={clsx(
                inputCls,
                !form.show_on && "focus:text-ink! text-transparent!",
              )}
              value={form.show_on}
              onChange={set("show_on")}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Repeat</span>
            <select
              className={inputCls}
              value={form.repeat}
              onChange={set("repeat")}
            >
              {REPEATS.map((r) => (
                <option key={r.key} value={r.key} className="bg-paper-bg">
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {buildings.length > 0 && (
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className={labelCls}>Building</span>
              <select
                className={inputCls}
                value={form.building}
                onChange={set("building")}
              >
                <option value="" className="bg-paper-bg">
                  No building
                </option>
                {buildings.map((b) => (
                  <option key={b.key} value={b.key} className="bg-paper-bg">
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className={labelCls}>Link</span>
            <input
              className={inputCls}
              value={form.link}
              onChange={set("link")}
              maxLength={LINK_MAX}
              placeholder="https://… or /page-in-the-app"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className={labelCls}>Notes</span>
            <textarea
              className={clsx(inputCls, "min-h-[72px]")}
              value={form.notes}
              onChange={set("notes")}
              maxLength={NOTES_MAX}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="brass-button px-4 py-2 font-mono text-[10px] tracking-[0.18em] disabled:opacity-60"
          >
            {editingId ? "SAVE CHANGES" : "ADD TASK"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className={smallBtn}
              disabled={busy}
            >
              CANCEL
            </button>
          )}
          <span className="text-ink-mute text-[12px]">
            No date = someday: it waits here and never shows up on its own.
          </span>
        </div>
        {status && (
          <p role="status" className="text-rust mt-3 text-[13px]">
            {status}
          </p>
        )}
      </form>

      {total === 0 ? (
        <p className="text-ink-mute mt-8 text-[14px]">
          No tasks yet. Add one above.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          <TaskCard
            title="Upcoming"
            hint="Each one goes into Field Notes on its day, with a Slack alert. No date = someday."
            tasks={groups.upcoming}
            today={today}
            busy={busy}
            onEdit={startEdit}
            run={run}
          />
          <TaskCard
            title="Recurring"
            hint="Each one goes into Field Notes on its day, then moves to its next date."
            tasks={groups.recurring}
            today={today}
            busy={busy}
            onEdit={startEdit}
            run={run}
          />
          <TaskCard
            title="Done"
            hint="Sent to Field Notes or marked done. Deleted for good after 10 days."
            tasks={groups.done}
            today={today}
            busy={busy}
            onEdit={startEdit}
            run={run}
            done
          />
        </div>
      )}
    </>
  );
}

function TaskCard({
  title,
  hint,
  tasks,
  today,
  busy,
  onEdit,
  run,
  done,
}: {
  title: string;
  hint: string;
  tasks: FutureTask[];
  today: string;
  busy: boolean;
  onEdit: (t: FutureTask) => void;
  run: (path: string, body?: unknown) => Promise<boolean>;
  done?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <Card accent={done ? undefined : "brass"} className="p-4 pl-5">
      <div className="flex items-baseline gap-2">
        <h3 className="serif-h text-ink text-[18px]">{title}</h3>
        <span className="text-brass font-mono text-[11px]">{tasks.length}</span>
      </div>
      <p className="text-ink-mute text-[12px]">{hint}</p>
      <ul className="divide-paper-line/50 mt-2 divide-y">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            t={t}
            today={today}
            busy={busy}
            onEdit={onEdit}
            run={run}
            done={done}
          />
        ))}
      </ul>
    </Card>
  );
}

function TaskRow({
  t,
  today,
  busy,
  onEdit,
  run,
  done,
}: {
  t: FutureTask;
  today: string;
  busy: boolean;
  onEdit: (t: FutureTask) => void;
  run: (path: string, body?: unknown) => Promise<boolean>;
  done?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const meta = done
    ? `${t.sent_on ? "Sent to Field Notes" : "Marked done"} ${prettyDate(isoToEasternYmd(t.done_at!))}`
    : whenLine(t, today);

  return (
    <li className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div
          className={clsx(
            "paper-task-title font-semibold",
            done && "text-ink-mute line-through",
          )}
        >
          {t.title}
        </div>
        <div className="text-ink-mute font-mono text-[11px]">
          {meta}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {done ? (
          <button
            className={smallBtn}
            disabled={busy}
            onClick={() => run(`/api/future-tasks/${t.id}/undo`)}
          >
            PUT BACK
          </button>
        ) : (
          <>
            <button
              className={smallBtn}
              disabled={busy}
              onClick={() => run(`/api/future-tasks/${t.id}/done`)}
            >
              DONE
            </button>
            <button
              className={smallBtn}
              disabled={busy}
              onClick={() => onEdit(t)}
            >
              EDIT
            </button>
          </>
        )}
        <button
          className={clsx(smallBtn, armed && "border-rust text-rust")}
          disabled={busy}
          onClick={() =>
            armed ? run(`/api/future-tasks/${t.id}/delete`) : setArmed(true)
          }
          onBlur={() => setArmed(false)}
        >
          {armed ? "CLICK AGAIN TO DELETE" : "DELETE"}
        </button>
      </div>
    </li>
  );
}
