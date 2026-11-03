// Turns the Supabase-style calls the app already uses (from/select/eq/…) into
// plain SQL. Pure — no database here — so it is easy to test. The pool and
// the per-request user live in lib/db/client.ts.

export type TableInfo = { columns: Record<string, { type: string }>; pk: string[] };
export type Meta = Record<string, TableInfo>;

export type Where = { col: string; op: string; value?: unknown };
export type QueryState = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  cols: string;
  payload?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  ignoreDuplicates?: boolean;
  wheres: Where[];
  orFilters: string[];
  orders: { col: string; ascending: boolean; nullsFirst?: boolean }[];
  limit?: number;
  returning: boolean;
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function q(name: string): string {
  if (!IDENT.test(name)) throw new Error(`bad name: ${name}`);
  return `"${name}"`;
}

/** Split "a, b, blueprint:blueprints(id, name)" on commas outside brackets. */
export function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** "blueprint:blueprints(id, name)" becomes a sub-select through blueprint_id. */
function selectList(cols: string): string {
  return splitTop(cols)
    .map((c) => {
      if (c === "*") return "t.*";
      const emb = c.match(/^([A-Za-z_]\w*):([A-Za-z_]\w*)\(([^)]*)\)$/);
      if (emb) {
        const [, alias, table, inner] = emb;
        const fk = `${table.replace(/s$/, "")}_id`;
        const innerCols = splitTop(inner).map(q).join(", ");
        return `(select to_jsonb(e) from (select ${innerCols} from public.${q(table)} where id = t.${q(fk)}) e) as ${q(alias)}`;
      }
      return `t.${q(c)}`;
    })
    .join(", ");
}

function isJson(meta: Meta, table: string, col: string): boolean {
  const t = meta[table]?.columns[col]?.type;
  return t === "json" || t === "jsonb";
}

/** jsonb columns need their value as a JSON string (arrays would become SQL arrays). */
export function param(meta: Meta, table: string, col: string, v: unknown): unknown {
  if (v === undefined) return null;
  if (v !== null && isJson(meta, table, col)) return JSON.stringify(v);
  return v;
}

const OPS: Record<string, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "like",
  ilike: "ilike",
};

function cond(meta: Meta, table: string, w: Where, params: unknown[], negate = false): string {
  const col = `t.${q(w.col)}`;
  const push = (v: unknown) => {
    params.push(param(meta, table, w.col, v));
    return `$${params.length}`;
  };
  const wrap = (s: string) => (negate ? `not (${s})` : s);
  if (w.op === "is") {
    const v = w.value;
    if (v !== null && v !== true && v !== false) throw new Error("bad is()");
    return wrap(`${col} is ${v === null ? "null" : String(v)}`);
  }
  if (w.op === "in") {
    params.push(w.value);
    return wrap(`${col} = any($${params.length})`);
  }
  if (w.op === "contains") {
    return wrap(`${col} @> ${push(w.value)}${isJson(meta, table, w.col) ? "::jsonb" : ""}`);
  }
  if (OPS[w.op]) return wrap(`${col} ${OPS[w.op]} ${push(w.value)}`);
  throw new Error(`unsupported filter: ${w.op}`);
}

/** "state.is.null,state.neq.done" (PostgREST or-syntax). */
function orClause(meta: Meta, table: string, expr: string, params: unknown[]): string {
  const parts = splitTop(expr).map((p) => {
    const [col, op, ...rest] = p.split(".");
    const raw = rest.join(".");
    const value = raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : raw;
    return cond(meta, table, { col, op, value }, params);
  });
  return `(${parts.join(" or ")})`;
}

function whereSql(meta: Meta, s: QueryState, params: unknown[]): string {
  const parts = s.wheres.map((w) =>
    w.op.startsWith("not:")
      ? cond(meta, s.table, { ...w, op: w.op.slice(4) }, params, true)
      : cond(meta, s.table, w, params),
  );
  for (const o of s.orFilters) parts.push(orClause(meta, s.table, o, params));
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}

function payloadRows(s: QueryState): Record<string, unknown>[] {
  return Array.isArray(s.payload) ? s.payload : s.payload ? [s.payload] : [];
}

export function buildSql(meta: Meta, s: QueryState): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const tbl = `public.${q(s.table)}`;
  const target = `${tbl} as t`; // the alias lets `returning` reuse the select list
  const ret = s.returning ? ` returning ${selectList(s.cols)}` : "";

  if (s.op === "select") {
    let text = `select ${selectList(s.cols)} from ${target}${whereSql(meta, s, params)}`;
    if (s.orders.length) {
      text += ` order by ${s.orders
        .map(
          (o) =>
            `t.${q(o.col)} ${o.ascending ? "asc" : "desc"}${o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"}`,
        )
        .join(", ")}`;
    }
    if (s.limit !== undefined) text += ` limit ${Math.max(0, Math.floor(s.limit))}`;
    return { text, params };
  }

  if (s.op === "insert" || s.op === "upsert") {
    const rs = payloadRows(s);
    if (!rs.length) return { text: "select 1 where false", params };
    const keys = [...new Set(rs.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)))];
    const vals = rs.map(
      (r) =>
        `(${keys
          .map((k) => {
            if (r[k] === undefined) return "default";
            params.push(param(meta, s.table, k, r[k]));
            return `$${params.length}`;
          })
          .join(", ")})`,
    );
    let text = `insert into ${target} (${keys.map(q).join(", ")}) values ${vals.join(", ")}`;
    if (s.op === "upsert") {
      const conflict = s.onConflict ? s.onConflict.split(",").map((c) => c.trim()) : (meta[s.table]?.pk ?? []);
      if (!conflict.length) throw new Error(`upsert on ${s.table} needs onConflict`);
      const sets = keys.filter((k) => !conflict.includes(k));
      text += ` on conflict (${conflict.map(q).join(", ")}) do ${
        sets.length && !s.ignoreDuplicates ? `update set ${sets.map((k) => `${q(k)} = excluded.${q(k)}`).join(", ")}` : "nothing"
      }`;
    }
    return { text: text + ret, params };
  }

  if (s.op === "update") {
    const p = (s.payload ?? {}) as Record<string, unknown>;
    const keys = Object.keys(p).filter((k) => p[k] !== undefined);
    if (!keys.length) throw new Error("update with nothing to change");
    const sets = keys.map((k) => {
      params.push(param(meta, s.table, k, p[k]));
      return `${q(k)} = $${params.length}`;
    });
    return { text: `update ${target} set ${sets.join(", ")}${whereSql(meta, s, params)}${ret}`, params };
  }

  return { text: `delete from ${target}${whereSql(meta, s, params)}${ret}`, params };
}
