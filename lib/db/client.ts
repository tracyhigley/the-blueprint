// Postgres client with the same call shape the app used with Supabase
// (from().select().eq()… returning { data, error }), so the ~170 call sites
// keep working. Two flavors:
//   - user client: every query runs as the limited `app_user` database role
//     with app.user_id set, so the row-level-security rules still decide
//     what a signed-in person can see (auth.uid() reads app.user_id).
//   - admin client: runs as the database owner, skipping those rules (the
//     old "service role"). Only for server routes that check their own token.

import { Pool, types as pgTypes } from "pg";
import { buildSql, type Meta, type QueryState, type Where } from "./sql";

type Result = { data: any; error: { message: string } | null }; // eslint-disable-line @typescript-eslint/no-explicit-any

const g = globalThis as unknown as { __bpPool?: Pool; __bpMeta?: Promise<Meta> };

/**
 * Postgres sends "2026-11-05 07:50:40.684177+01". Keep every digit (microseconds):
 * a few queries match on a timestamp they read earlier (the Future Tasks "claim"
 * uses updated_at), and rounding to milliseconds makes them miss.
 */
export function timestamptzToIso(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(?::?(\d{2}))?$/.exec(v);
  if (!m) return new Date(v).toISOString();
  return `${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}`;
}

function typeParser(oid: number, format?: unknown) {
  // numeric / bigint as numbers, timestamptz as ISO strings (full precision), date as plain "YYYY-MM-DD"
  // (what the app received from Supabase's JSON replies).
  if (oid === 1700 || oid === 701 || oid === 700) return (v: string) => parseFloat(v);
  if (oid === 20) return (v: string) => parseInt(v, 10);
  if (oid === 1184) return timestamptzToIso;
  if (oid === 1082) return (v: string) => v;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pgTypes.getTypeParser(oid, format as any);
}

export function pool(): Pool {
  if (!g.__bpPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    g.__bpPool = new Pool({
      connectionString: url,
      max: 5,
      ssl: local || process.env.DATABASE_SSL === "off" ? false : { rejectUnauthorized: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      types: { getTypeParser: typeParser } as any,
    });
  }
  return g.__bpPool;
}

async function meta(): Promise<Meta> {
  if (!g.__bpMeta) {
    g.__bpMeta = (async () => {
      const cols = await pool().query(
        `select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'`,
      );
      const pks = await pool().query(
        `select c.relname as table_name, a.attname as col
           from pg_index i join pg_class c on c.oid = i.indrelid
           join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
          where i.indisprimary and n.nspname = 'public'`,
      );
      const m: Meta = {};
      for (const r of cols.rows) (m[r.table_name] ??= { columns: {}, pk: [] }).columns[r.column_name] = { type: r.data_type };
      for (const r of pks.rows) m[r.table_name]?.pk.push(r.col);
      return m;
    })().catch((e) => {
      g.__bpMeta = undefined;
      throw e;
    });
  }
  return g.__bpMeta;
}

export type Who = { kind: "user"; userId: string | null } | { kind: "admin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run(who: Who, text: string, params: unknown[]) {
  const c = await pool().connect();
  if (who.kind === "admin") {
    try {
      return await c.query(text, params);
    } finally {
      c.release();
    }
  }
  // One trip to become app_user and say who is asking, one for the query.
  // Each statement is its own transaction, so nothing needs a commit trip.
  // Putting the connection back as it was runs in the background; if that
  // fails the connection is thrown away so no one else ever inherits it.
  const uid = who.userId ?? "";
  if (uid && !UUID.test(uid)) {
    c.release();
    throw new Error("bad user id");
  }
  let reset: Promise<unknown> | null = null;
  try {
    await c.query(`set role app_user; select set_config('app.user_id', '${uid}', false)`);
    return await c.query(text, params);
  } finally {
    reset = c.query("reset role; reset app.user_id");
    reset.then(
      () => c.release(),
      (e) => c.release(e instanceof Error ? e : new Error("reset failed")),
    );
  }
}

class Query implements PromiseLike<Result> {
  private s: QueryState;
  private mode: "many" | "single" | "maybe" = "many";
  private selected = false;

  constructor(
    private who: Who,
    table: string,
  ) {
    this.s = { table, op: "select", cols: "*", wheres: [], orFilters: [], orders: [], returning: false };
  }

  select(cols = "*") {
    this.s.cols = cols;
    if (this.s.op === "select") this.selected = true;
    else this.s.returning = true;
    return this;
  }
  insert(payload: QueryState["payload"]) {
    this.s.op = "insert";
    this.s.payload = payload;
    return this;
  }
  update(payload: QueryState["payload"]) {
    this.s.op = "update";
    this.s.payload = payload;
    return this;
  }
  upsert(payload: QueryState["payload"], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.s.op = "upsert";
    this.s.payload = payload;
    this.s.onConflict = opts?.onConflict;
    this.s.ignoreDuplicates = opts?.ignoreDuplicates;
    return this;
  }
  delete() {
    this.s.op = "delete";
    return this;
  }
  private w(col: string, op: string, value?: unknown) {
    this.s.wheres.push({ col, op, value } as Where);
    return this;
  }
  eq(col: string, v: unknown) { return this.w(col, "eq", v); }
  neq(col: string, v: unknown) { return this.w(col, "neq", v); }
  gt(col: string, v: unknown) { return this.w(col, "gt", v); }
  gte(col: string, v: unknown) { return this.w(col, "gte", v); }
  lt(col: string, v: unknown) { return this.w(col, "lt", v); }
  lte(col: string, v: unknown) { return this.w(col, "lte", v); }
  like(col: string, v: unknown) { return this.w(col, "like", v); }
  ilike(col: string, v: unknown) { return this.w(col, "ilike", v); }
  is(col: string, v: unknown) { return this.w(col, "is", v); }
  in(col: string, v: unknown[]) { return this.w(col, "in", v); }
  contains(col: string, v: unknown) { return this.w(col, "contains", v); }
  not(col: string, op: string, v: unknown) { return this.w(col, `not:${op}`, v); }
  match(o: Record<string, unknown>) {
    for (const [k, v] of Object.entries(o)) this.eq(k, v);
    return this;
  }
  or(expr: string) {
    this.s.orFilters.push(expr);
    return this;
  }
  order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.s.orders.push({ col, ascending: o?.ascending ?? true, nullsFirst: o?.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.s.limit = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private async exec(): Promise<Result> {
    try {
      const { text, params } = buildSql(await meta(), this.s);
      const r = await run(this.who, text, params);
      const wantsRows = this.s.op === "select" || this.s.returning;
      if (!wantsRows) return { data: null, error: null };
      if (this.mode === "many") return { data: r.rows, error: null };
      if (r.rows.length > 1) return { data: null, error: { message: "more than one row returned" } };
      if (r.rows.length === 0)
        return this.mode === "single"
          ? { data: null, error: { message: "no rows returned" } }
          : { data: null, error: null };
      return { data: r.rows[0], error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }

  then<A = Result, B = never>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    void this.selected;
    return this.exec().then(ok, bad);
  }
}

export type SessionUser = { id: string; email: string | null };

export function makeClient(
  who: Who,
  auth: { user: SessionUser | null; signOut: () => Promise<void> },
) {
  return {
    from: (table: string) => new Query(who, table),
    auth: {
      getUser: async () => ({ data: { user: auth.user }, error: null }),
      signOut: async () => {
        await auth.signOut();
        return { error: null };
      },
    },
  };
}

export type DbClient = ReturnType<typeof makeClient>;
