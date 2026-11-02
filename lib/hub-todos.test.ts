import { describe, expect, it } from "vitest";
import { tokenMatches, validateHubTodo } from "./hub-todos";
import { closeHubTodo, listHubTodos, upsertHubTodo } from "./hub-todos-db";

// ---------- tiny in-memory stand-in for the Supabase client ----------

type Row = Record<string, unknown>;

function fakeDb() {
  const tables: Record<string, Row[]> = { future_tasks: [], items: [] };
  let n = 0;
  function from(table: string) {
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    let mode: "many" | "maybe" = "many";
    const filters: ((r: Row) => boolean)[] = [];
    const q = {
      select() {
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
      eq(k: string, v: unknown) {
        filters.push((r) => r[k] === v);
        return q;
      },
      is(k: string, v: unknown) {
        filters.push((r) => (r[k] ?? null) === v);
        return q;
      },
      not(k: string, _op: string, v: unknown) {
        filters.push((r) => (r[k] ?? null) !== v);
        return q;
      },
      maybeSingle() {
        mode = "maybe";
        return q;
      },
      then(resolve: (x: { data: unknown; error: null }) => void) {
        const rows = tables[table];
        let out: Row[];
        if (op === "insert") {
          const dup = rows.some(
            (r) => payload.external_key && r.blueprint_id === payload.blueprint_id && r.source === payload.source && r.external_key === payload.external_key,
          );
          if (dup) throw new Error("duplicate key");
          const row = { id: `id-${++n}`, done_at: null, deleted_at: null, state: null, ...payload };
          rows.push(row);
          out = [row];
        } else {
          out = rows.filter((r) => filters.every((f) => f(r)));
          if (op === "update") out.forEach((r) => Object.assign(r, payload));
        }
        const copy = out.map((r) => ({ ...r }));
        resolve({ data: mode === "maybe" ? (copy[0] ?? null) : copy, error: null });
      },
    };
    return q;
  }
  return { from, tables };
}

const BP = "blueprint-1";
const OWNER = "owner-1";
const todo = (over: Record<string, unknown> = {}) => {
  const v = validateHubTodo({ source: "finance", key: "categorize-backlog:swb", title: "Categorize 12 transactions", ...over });
  if (!v.ok) throw new Error(v.error);
  return v.value;
};

describe("checking what the hub sends", () => {
  it("accepts a title with a source and key", () => {
    expect(validateHubTodo({ source: "finance", key: "bank-stuck:3", title: "Bank 3 needs a look" }).ok).toBe(true);
  });
  it("refuses a missing or odd source, key or title", () => {
    expect(validateHubTodo({ key: "k", title: "x" }).ok).toBe(false);
    expect(validateHubTodo({ source: "Finance!", key: "k", title: "x" }).ok).toBe(false);
    expect(validateHubTodo({ source: "finance", key: "has space", title: "x" }).ok).toBe(false);
    expect(validateHubTodo({ source: "finance", key: "k", title: "  " }).ok).toBe(false);
    expect(validateHubTodo({ source: "finance", key: "k", title: "x", due_on: "2026-02-31" }).ok).toBe(false);
  });
  it("only opens for the right token, and stays sealed without one", () => {
    const t = "a-long-enough-secret-token-123";
    expect(tokenMatches(`Bearer ${t}`, t)).toBe(true);
    expect(tokenMatches("Bearer wrong-wrong-wrong-wrong-12", t)).toBe(false);
    expect(tokenMatches(null, t)).toBe(false);
    expect(tokenMatches(`Bearer ${t}`, undefined)).toBe(false);
    expect(tokenMatches("Bearer short", "short")).toBe(false);
  });
});

describe("sending the same to-do twice", () => {
  it("adds an undated one to Field Notes tagged with its source, then updates it instead of adding another", async () => {
    const db = fakeDb();
    expect(await upsertHubTodo(db, BP, OWNER, todo())).toBe("created");
    expect(await upsertHubTodo(db, BP, OWNER, todo({ title: "Categorize 9 transactions" }))).toBe("updated");
    expect(db.tables.items).toHaveLength(1);
    expect(db.tables.items[0]).toMatchObject({ box: "DROP", tag: "finance", title: "Categorize 9 transactions", user_id: OWNER });
    expect(db.tables.future_tasks).toHaveLength(0);
  });
  it("puts a dated one in Future Tasks", async () => {
    const db = fakeDb();
    await upsertHubTodo(db, BP, OWNER, todo({ key: "promo-reapply:5", due_on: "2026-12-01" }));
    expect(db.tables.future_tasks[0]).toMatchObject({ due_on: "2026-12-01", repeat: "none", source: "finance" });
    expect(db.tables.items).toHaveLength(0);
  });
  it("keeps the same key from different sources apart", async () => {
    const db = fakeDb();
    await upsertHubTodo(db, BP, OWNER, todo());
    await upsertHubTodo(db, BP, OWNER, todo({ source: "author" }));
    expect(db.tables.items).toHaveLength(2);
  });
});

describe("closing", () => {
  it("ticks the to-do off, and a repeat close is harmless", async () => {
    const db = fakeDb();
    await upsertHubTodo(db, BP, OWNER, todo());
    expect(await closeHubTodo(db, BP, { source: "finance", key: "categorize-backlog:swb" })).toBe(1);
    expect(db.tables.items[0].state).toBe("done");
    expect(await closeHubTodo(db, BP, { source: "finance", key: "categorize-backlog:swb" })).toBe(1); // already done: still found, nothing breaks
    expect(await closeHubTodo(db, BP, { source: "finance", key: "never-existed" })).toBe(0);
  });
  it("closes a dated one that has not been sent yet, so it never goes to Field Notes", async () => {
    const db = fakeDb();
    await upsertHubTodo(db, BP, OWNER, todo({ due_on: "2026-12-01" }));
    expect(await closeHubTodo(db, BP, { source: "finance", key: "categorize-backlog:swb" })).toBe(1);
    expect(db.tables.future_tasks[0].done_at).toBeTruthy();
  });
  it("does not re-add a ticked-off to-do unless the hub says reopen", async () => {
    const db = fakeDb();
    await upsertHubTodo(db, BP, OWNER, todo());
    await closeHubTodo(db, BP, { source: "finance", key: "categorize-backlog:swb" });
    expect(await upsertHubTodo(db, BP, OWNER, todo())).toBe("closed");
    expect(db.tables.items[0].state).toBe("done");
    expect(await upsertHubTodo(db, BP, OWNER, todo({ reopen: true }))).toBe("created");
    expect(db.tables.items[0].state).toBeNull();
    expect(db.tables.items).toHaveLength(1);
  });
});

describe("reading what is open", () => {
  it("lists open hub to-dos only, optionally by source, and not Tracy's own items", async () => {
    const db = fakeDb();
    db.tables.items.push({ id: "mine", blueprint_id: BP, title: "Buy milk", box: "DROP", external_key: null, state: null, deleted_at: null });
    await upsertHubTodo(db, BP, OWNER, todo());
    await upsertHubTodo(db, BP, OWNER, todo({ key: "late", due_on: "2026-12-01" }));
    await upsertHubTodo(db, BP, OWNER, todo({ source: "author", key: "reader-mail" }));
    await closeHubTodo(db, BP, { source: "author", key: "reader-mail" });
    const all = await listHubTodos(db, BP);
    expect(all.map((t) => `${t.source}:${t.key}:${t.status}`).sort()).toEqual(["finance:categorize-backlog:swb:open", "finance:late:waiting"]);
    expect(await listHubTodos(db, BP, "author")).toEqual([]);
    expect(await listHubTodos(db, "other-blueprint")).toEqual([]);
  });
});
