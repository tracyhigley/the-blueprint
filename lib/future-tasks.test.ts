import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type FutureTask,
  type Repeat,
  cleanLink,
  dueTasks,
  groupTasks,
  nextAfter,
  repeatRule,
  slackMessage,
  stepRepeat,
  whenLine,
  validateTask,
  futureTasksToday,
} from "./future-tasks";
import {
  addTask,
  deleteOldDone,
  deleteTask,
  editTask,
  getTask,
  listTasks,
  markDone,
  putBack,
  sendAllDue,
  sendDueForBlueprint,
} from "./future-tasks-db";
import { FutureTasksBoard } from "@/components/future-tasks-board";

// ---------- tiny in-memory stand-in for the Supabase client ----------

type Row = Record<string, unknown>;

function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    future_tasks: [],
    items: [],
    captures: [],
    blueprints: [],
    ...seed,
  };
  // When set, plain reads of future_tasks see this old snapshot (a second
  // run that read the list before the first one finished).
  const state: { stale: Row[] | null } = { stale: null };
  let n = 0;
  const newId = () =>
    `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

  function from(table: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    let returning = false;
    let mode: "many" | "single" | "maybe" = "many";
    const filters: ((r: Row) => boolean)[] = [];
    const q = {
      select() {
        if (op !== "select") returning = true;
        return q;
      },
      insert(p: Row) {
        op = "insert";
        payload = p;
        return q;
      },
      update(p: Row) {
        op = "update";
        payload = p;
        return q;
      },
      delete() {
        op = "delete";
        return q;
      },
      eq(k: string, v: unknown) {
        filters.push((r) => r[k] === v);
        return q;
      },
      is(k: string, v: unknown) {
        filters.push((r) => (r[k] ?? null) === v);
        return q;
      },
      lt(k: string, v: string) {
        filters.push((r) => r[k] != null && (r[k] as string) < v);
        return q;
      },
      not(k: string, op: string, v: unknown) {
        filters.push((r) => op === "is" && v === null && (r[k] ?? null) !== null);
        return q;
      },
      lte(k: string, v: string) {
        filters.push((r) => r[k] != null && (r[k] as string) <= v);
        return q;
      },
      single() {
        mode = "single";
        return q;
      },
      maybeSingle() {
        mode = "maybe";
        return q;
      },
      then(
        resolve: (x: {
          data: unknown;
          error: null | { message: string };
        }) => void,
      ) {
        const rows = (tables[table] ??= []);
        let out: Row[] = [];
        if (op === "insert") {
          const now = new Date().toISOString();
          const row: Row = {
            id: newId(),
            created_at: now,
            updated_at: now,
            due_on: null,
            repeat: "none",
            anchor_day: null,
            link: null,
            notes: null,
            done_at: null,
            last_done_at: null,
            sent_on: null,
            ...payload,
          };
          if (table !== "future_tasks")
            for (const k of Object.keys(row))
              if (!(k in payload) && k !== "id") delete row[k];
          rows.push(row);
          out = [row];
        } else {
          const source =
            op === "select" && table === "future_tasks" && state.stale
              ? state.stale
              : rows;
          const hit = source.filter((r) => filters.every((f) => f(r)));
          if (op === "update") hit.forEach((r) => Object.assign(r, payload));
          if (op === "delete")
            tables[table] = rows.filter((r) => !hit.includes(r));
          out = hit;
        }
        const copy = out.map((r) => ({ ...r }));
        const data =
          mode === "many"
            ? op === "select" || returning
              ? copy
              : null
            : (copy[0] ?? null);
        resolve({
          data,
          error: mode === "single" && !copy[0] ? { message: "no row" } : null,
        });
      },
    };
    return q;
  }
  return { from, tables, state };
}

const V = "blueprint-1";
const OTHER = "blueprint-2";
const USER = "user-1";

function task(over: Partial<FutureTask>): FutureTask {
  return {
    id: "t",
    title: "Task",
    due_on: null,
    repeat: "none",
    anchor_day: null,
    link: null,
    notes: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    done_at: null,
    last_done_at: null,
    sent_on: null,
    ...over,
  };
}

// ---------- repeats ----------

describe("repeat stepping", () => {
  const cases: [Repeat, string, string][] = [
    ["weekly", "2026-10-24", "2026-10-31"],
    ["biweekly", "2026-10-24", "2026-11-07"],
    ["monthly", "2026-10-24", "2026-11-24"],
    ["quarterly", "2026-10-24", "2027-01-24"],
    ["every90days", "2026-10-26", "2027-01-24"],
    ["semiannual", "2026-10-24", "2027-04-24"],
    ["yearly", "2026-10-24", "2027-10-24"],
  ];
  it.each(cases)("%s steps %s → %s", (r, from, to) => {
    expect(stepRepeat(from, r)).toBe(to);
  });

  it("monthly on the 31st clamps and comes back", () => {
    let d = "2027-01-31";
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) seen.push((d = stepRepeat(d, "monthly", 31)));
    expect(seen).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("3- and 6-month repeats clamp to the month end and return", () => {
    expect(stepRepeat("2026-08-31", "quarterly", 31)).toBe("2026-11-30");
    expect(stepRepeat("2026-11-30", "quarterly", 31)).toBe("2027-02-28");
    expect(stepRepeat("2027-02-28", "quarterly", 31)).toBe("2027-05-31");
    expect(stepRepeat("2026-08-31", "semiannual", 31)).toBe("2027-02-28");
    expect(stepRepeat("2027-02-28", "semiannual", 31)).toBe("2027-08-31");
  });

  it("yearly Feb 29 lands on Feb 28, then back to Feb 29 in a leap year", () => {
    expect(stepRepeat("2028-02-29", "yearly", 29)).toBe("2029-02-28");
    expect(stepRepeat("2031-02-28", "yearly", 29)).toBe("2032-02-29");
  });

  it("sent three months late comes back once, after today", () => {
    expect(nextAfter("2026-07-15", "monthly", 15, "2026-10-24")).toBe(
      "2026-11-15",
    );
    expect(nextAfter("2026-10-24", "weekly", 24, "2026-10-24")).toBe(
      "2026-10-31",
    );
  });
});

// ---------- form checks ----------

describe("form checks and link cleanup", () => {
  it("squeezes spaces and requires a title", () => {
    const v = validateTask({ title: "  Renew   the\tdomain  " });
    expect(v.ok && v.value.title).toBe("Renew the domain");
    expect(validateTask({ title: "   " })).toEqual({
      ok: false,
      error: "type what the task is",
    });
  });

  it("caps the title at 200", () => {
    const v = validateTask({ title: "x".repeat(201) });
    expect(v).toEqual({
      ok: false,
      error: "keep the task to 200 characters; put the rest in Notes",
    });
  });

  it("a repeating task needs a first date", () => {
    expect(validateTask({ title: "Pay", repeat: "monthly" })).toEqual({
      ok: false,
      error: "a repeating task needs a first date",
    });
    const v = validateTask({
      title: "Pay",
      repeat: "monthly",
      show_on: "2026-01-31",
    });
    expect(v.ok && v.value.anchor_day).toBe(31);
  });

  it("rejects bad dates, repeats and long notes; keeps line breaks", () => {
    expect(validateTask({ title: "a", show_on: "2026-02-30" }).ok).toBe(false);
    expect(validateTask({ title: "a", repeat: "daily" }).ok).toBe(false);
    expect(validateTask({ title: "a", notes: "x".repeat(2001) }).ok).toBe(
      false,
    );
    const v = validateTask({ title: "a", notes: "one\r\ntwo\n" });
    expect(v.ok && v.value.notes).toBe("one\ntwo");
  });

  it("cleans links", () => {
    expect(cleanLink("shopify.com/x")).toEqual({
      ok: true,
      value: "https://shopify.com/x",
    });
    expect(cleanLink("https://a.com/b?c=1")).toEqual({
      ok: true,
      value: "https://a.com/b?c=1",
    });
    expect(cleanLink("/maint-tasks")).toEqual({
      ok: true,
      value: "/maint-tasks",
    });
    expect(cleanLink("")).toEqual({ ok: true, value: null });
    for (const bad of [
      "javascript:alert(1)",
      "mailto:a@b.com",
      "//evil.com",
      "a b.com",
      "data:text/html,x",
      "x".repeat(501),
    ]) {
      expect(cleanLink(bad).ok, bad).toBe(false);
    }
  });
});

// ---------- what's due ----------

describe("what goes to Field Notes", () => {
  it("only today's and earlier open tasks", () => {
    const today = "2026-10-24";
    const ts = [
      task({ id: "past", due_on: "2026-10-20" }),
      task({ id: "today", due_on: today }),
      task({ id: "future", due_on: "2026-10-25" }),
      task({ id: "someday" }),
      task({
        id: "done",
        due_on: "2026-10-20",
        done_at: "2026-10-20T10:00:00Z",
      }),
      task({ id: "already", due_on: today, sent_on: today }),
    ];
    expect(dueTasks(ts, today).map((t) => t.id)).toEqual(["past", "today"]);
  });

  it("today is US Eastern, not UTC", () => {
    // 2:30 am UTC on Oct 25 is still Oct 24 in New York
    expect(futureTasksToday(new Date("2026-10-25T02:30:00Z"))).toBe(
      "2026-10-24",
    );
  });
});

// ---------- page ----------

describe("page", () => {
  const today = "2026-10-24";
  const now = new Date("2026-10-24T16:00:00Z");

  it("splits into Upcoming and Recurring, and hides done ones after 10 days", () => {
    const g = groupTasks(
      [
        task({ id: "c2", due_on: "2026-12-01" }),
        task({ id: "c1", due_on: "2026-11-01" }),
        task({ id: "s" }),
        task({ id: "w", due_on: "2026-10-24" }),
        task({ id: "r2", due_on: "2026-11-20", repeat: "monthly" }),
        task({ id: "r1", due_on: "2026-10-30", repeat: "weekly" }),
        task({ id: "d1", done_at: "2026-10-20T12:00:00Z" }),
        task({ id: "edge", done_at: "2026-10-14T16:00:01Z" }),
        task({ id: "old", done_at: "2026-10-14T15:59:59Z" }),
      ],
      today,
      now,
    );
    // every non-recurring task is Upcoming: dated by date (incl. due today), someday last
    expect(g.upcoming.map((t) => t.id)).toEqual(["w", "c1", "c2", "s"]);
    expect(g.recurring.map((t) => t.id)).toEqual(["r1", "r2"]);
    expect(g.done.map((t) => t.id)).toEqual(["d1", "edge"]);
  });

  it("describes when a task occurs", () => {
    const rec = (repeat: Repeat, due_on: string, anchor_day: number | null = null) =>
      task({ repeat, due_on, anchor_day });
    // 2026-11-09 is a Monday
    expect(repeatRule(rec("weekly", "2026-11-09"))).toBe("Every Monday");
    expect(repeatRule(rec("biweekly", "2026-11-09"))).toBe("Every other Monday");
    expect(repeatRule(rec("monthly", "2026-11-03", 3))).toBe("Every month on the 3rd");
    expect(repeatRule(rec("monthly", "2026-11-22", 22))).toBe("Every month on the 22nd");
    expect(repeatRule(rec("quarterly", "2026-11-11", 11))).toBe("Every 3 months on the 11th");
    expect(repeatRule(rec("every90days", "2026-11-09"))).toBe("Every 90 days");
    expect(repeatRule(rec("yearly", "2026-11-03"))).toBe("Every year on Nov 3");
    expect(whenLine(rec("weekly", "2026-11-09"), "2026-11-05")).toBe("Every Monday · next Mon Nov 9");
    expect(whenLine(rec("weekly", "2026-11-05"), "2026-11-05")).toBe("Every Thursday · due today");
    expect(whenLine(task({ due_on: "2026-11-09" }), "2026-11-05")).toBe("Mon Nov 9");
    expect(whenLine(task({ due_on: "2026-11-05" }), "2026-11-05")).toBe("Today");
    expect(whenLine(task({ due_on: "2026-11-02" }), "2026-11-05")).toBe("Was due Mon Nov 2");
    expect(whenLine(task({}), "2026-11-05")).toBe("Someday");
    expect(whenLine(rec("yearly", "2027-11-01"), "2026-11-05")).toBe("Every year on Nov 1 · next Mon Nov 1, 2027");
  });

  it("keeps the building only when one was sent, and checks its shape", () => {
    const ok = (b: unknown) => validateTask({ title: "x", building: b });
    expect(validateTask({ title: "x" })).toMatchObject({ ok: true });
    expect("building" in (validateTask({ title: "x" }) as { value: object }).value).toBe(false);
    expect((ok("THE_PRESS") as { value: { building: unknown } }).value.building).toBe("THE_PRESS");
    expect((ok("") as { value: { building: unknown } }).value.building).toBeNull();
    expect((ok(null) as { value: { building: unknown } }).value.building).toBeNull();
    expect(ok("bad key; drop").ok).toBe(false);
    expect(ok(5).ok).toBe(false);
  });

  it("escapes what was typed", () => {
    const html = renderToStaticMarkup(
      createElement(FutureTasksBoard, {
        today,
        groups: groupTasks(
          [
            task({
              id: "x",
              title: "<script>alert(1)</script>",
              notes: "<b>hi</b>",
              due_on: "2026-11-03",
            }),
          ],
          today,
          now,
        ),
      }),
    );
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // the list shows only the title and when; notes stay stored but are not on this page
    expect(html).not.toContain("hi&lt;/b&gt;");
    expect(html).toContain("Upcoming");
    expect(html).not.toContain("Recurring");
  });

  it("shows only the title and when, in two sections, with a building dropdown in the form", () => {
    const html = renderToStaticMarkup(
      createElement(FutureTasksBoard, {
        today,
        buildings: [
          { key: "THE_PRESS", label: "The Press" },
          { key: "THE_LIBRARY", label: "The Library" },
        ],
        groups: groupTasks(
          [
            task({ id: "a", title: "Order labels", due_on: "2026-11-09", notes: "secret details", link: "https://x.example.com", building: "THE_PRESS" }),
            task({ id: "b", title: "Pay quarterly tax", due_on: "2026-11-09", repeat: "weekly", notes: "more details" }),
          ],
          today,
          now,
        ),
      }),
    );
    expect(html).toContain("Upcoming");
    expect(html).toContain("Recurring");
    expect(html).toContain("Order labels");
    expect(html).toContain("Mon Nov 9");
    expect(html).toContain("Every Monday · next Mon Nov 9");
    expect(html).not.toContain("secret details");
    expect(html).not.toContain("more details");
    expect(html).not.toContain("link ↗");
    expect(html).toContain("The Press");
    expect(html).toContain("The Library");
  });

  it("shows the empty message", () => {
    const html = renderToStaticMarkup(
      createElement(FutureTasksBoard, {
        today,
        groups: groupTasks([], today, now),
      }),
    );
    expect(html).toContain("No tasks yet. Add one above.");
  });
});

// ---------- database round trip ----------

function clean(input: Parameters<typeof validateTask>[0]) {
  const v = validateTask(input);
  if (!v.ok) throw new Error(v.error);
  return v.value;
}

describe("database round trip", () => {
  it("add → edit → done (one-off) → put back → delete", async () => {
    const db = fakeDb();
    const t = await addTask(
      db,
      V,
      USER,
      clean({ title: "Renew domain", show_on: "2026-11-03" }),
    );
    expect((await listTasks(db, V)).length).toBe(1);
    expect(await listTasks(db, OTHER)).toEqual([]);

    await editTask(
      db,
      V,
      t.id,
      clean({
        title: "Renew domain now",
        show_on: "2026-11-05",
        link: "godaddy.com",
      }),
    );
    let row = await getTask(db, V, t.id);
    expect(row.title).toBe("Renew domain now");
    expect(row.link).toBe("https://godaddy.com");

    expect(await markDone(db, V, t.id, USER, "2026-10-24")).toEqual({});
    expect(await markDone(db, V, t.id, USER, "2026-10-24")).toEqual({
      already: true,
    });
    row = await getTask(db, V, t.id);
    expect(row.done_at).toBeTruthy();

    await putBack(db, V, t.id, "2026-10-24");
    row = await getTask(db, V, t.id);
    expect(row.done_at).toBeNull();
    expect(row.due_on).toBe("2026-11-05"); // future date kept

    await expect(deleteTask(db, OTHER, t.id)).rejects.toThrow(
      "that task isn't on this list any more",
    );
    await deleteTask(db, V, t.id);
    expect(await listTasks(db, V)).toEqual([]);
  });

  it("done on a repeat moves it to the next date after today", async () => {
    const db = fakeDb();
    const t = await addTask(
      db,
      V,
      USER,
      clean({ title: "Backup", show_on: "2026-07-31", repeat: "monthly" }),
    );
    expect(await markDone(db, V, t.id, USER, "2026-10-24")).toEqual({
      next: "2026-10-31",
    });
    const row = await getTask(db, V, t.id);
    expect(row.done_at).toBeNull();
    expect(row.last_done_at).toBeTruthy();
  });

  it("morning job: Field Notes once per task, one Slack message, quiet when nothing's due", async () => {
    const db = fakeDb({
      blueprints: [
        { id: V, owner_id: USER },
        { id: OTHER, owner_id: "user-2" },
      ],
    });
    const today = "2026-10-24";
    const oneOff = await addTask(
      db,
      V,
      USER,
      clean({
        title: "Call <Bob> & Sue",
        show_on: "2026-10-20",
        notes: "about the cover",
        link: "/maint-tasks",
      }),
    );
    const repeat = await addTask(
      db,
      V,
      USER,
      clean({ title: "Pay rent", show_on: today, repeat: "monthly" }),
    );
    await addTask(
      db,
      V,
      USER,
      clean({ title: "Later", show_on: "2026-10-30" }),
    );
    await addTask(db, V, USER, clean({ title: "Someday" }));
    await addTask(
      db,
      OTHER,
      "user-2",
      clean({ title: "Other blueprint", show_on: today }),
    );

    const calls: {
      url: string;
      body: { text: string; blocks: { text?: { text: string } }[] };
    }[] = [];
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
    const fetchImpl = (async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch;

    const r1 = await sendAllDue(db, {
      siteUrl: "https://bp.test",
      today,
      fetchImpl,
    });
    expect(r1).toEqual({ ok: true, sent: 3, errors: [] });
    expect(calls.length).toBe(2); // one per blueprint
    const mine = calls.find((c) => c.body.text.includes("Pay rent"))!;
    expect(mine.body.text).toMatch(/^2 future tasks added to Field Notes/);
    expect(mine.body.blocks[0].text!.text).toContain(
      "Call &lt;Bob&gt; &amp; Sue (was due Oct 20)",
    );

    const drops = db.tables.items.filter((i) => i.blueprint_id === V);
    expect(drops.map((i) => i.title).sort()).toEqual([
      "Call <Bob> & Sue",
      "Pay rent",
    ]);
    expect(drops.every((i) => i.box === "DROP")).toBe(true);
    const note = drops.find((i) => i.title === "Pay rent")!.notes as string;
    expect(note).toContain("every month; next Tue Nov 24");
    const callNote = drops.find((i) => i.title !== "Pay rent")!.notes as string;
    expect(callNote).toContain("about the cover");
    expect(callNote).toContain("https://bp.test/maint-tasks");

    expect((await getTask(db, V, oneOff.id)).done_at).toBeTruthy();
    expect((await getTask(db, V, oneOff.id)).sent_on).toBe("2026-10-20");
    expect((await getTask(db, V, repeat.id)).due_on).toBe("2026-11-24");

    // Running again the same day adds nothing and sends nothing.
    const r2 = await sendAllDue(db, {
      siteUrl: "https://bp.test",
      today,
      fetchImpl,
    });
    expect(r2.sent).toBe(0);
    expect(calls.length).toBe(2);
    expect(db.tables.items.length).toBe(3);

    // Slack message builder is quiet with nothing to say.
    expect(slackMessage([], today, "https://bp.test")).toBeNull();
  });

  it("a second run with an old copy of the list can't send a task twice", async () => {
    const db = fakeDb({ blueprints: [{ id: V, owner_id: USER }] });
    const today = "2026-10-24";
    await addTask(db, V, USER, clean({ title: "Once", show_on: today }));
    db.state.stale = db.tables.future_tasks.map((r) => ({ ...r }));
    await new Promise((r) => setTimeout(r, 5)); // so updated_at changes
    const first = await sendDueForBlueprint(db, V, {
      today,
      siteUrl: "https://bp.test",
    });
    const second = await sendDueForBlueprint(db, V, {
      today,
      siteUrl: "https://bp.test",
    });
    expect(first.length).toBe(1);
    expect(second).toEqual([]);
    expect(db.tables.items.length).toBe(1);
  });
});

describe("building and clean-up", () => {
  it("a task's building lands on its Field Note; one without a building sends nothing extra", async () => {
    const db = fakeDb({ blueprints: [{ id: V, owner_id: USER }] });
    await addTask(db, V, USER, clean({ title: "Order labels", show_on: "2026-10-24", building: "THE_PRESS" }));
    await addTask(db, V, USER, clean({ title: "No building", show_on: "2026-10-24" }));
    await sendDueForBlueprint(db, V, { today: "2026-10-24", siteUrl: "https://x.test" });
    const notes = db.tables.items as Row[];
    expect(notes.find((i) => i.title === "Order labels")).toMatchObject({ box: "DROP", area: "THE_PRESS" });
    expect("area" in (notes.find((i) => i.title === "No building") as Row)).toBe(false);
  });

  it("editing from the page can clear the building; the hub's edits don't touch it", async () => {
    const db = fakeDb();
    const t = await addTask(db, V, USER, clean({ title: "A", show_on: "2026-12-01", building: "THE_PRESS" }));
    expect((db.tables.future_tasks[0] as Row).building).toBe("THE_PRESS");
    await editTask(db, V, t.id, clean({ title: "A2", show_on: "2026-12-01" })); // no building sent
    expect((db.tables.future_tasks[0] as Row).building).toBe("THE_PRESS");
    await editTask(db, V, t.id, clean({ title: "A2", show_on: "2026-12-01", building: "" }));
    expect((db.tables.future_tasks[0] as Row).building).toBeNull();
  });

  it("deletes done tasks older than 10 days and nothing else", async () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const db = fakeDb({
      future_tasks: [
        { id: "old", done_at: "2026-10-25T11:00:00Z" },
        { id: "recent", done_at: "2026-10-26T13:00:00Z" },
        { id: "open", done_at: null },
        { id: "hub-old", done_at: "2026-09-01T00:00:00Z", external_key: "k", source: "finance" },
      ],
    });
    expect(await deleteOldDone(db, now)).toBe(2);
    expect((db.tables.future_tasks as Row[]).map((r) => r.id)).toEqual(["recent", "open"]);
  });
});
