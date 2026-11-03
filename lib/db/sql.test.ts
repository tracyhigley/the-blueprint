import { describe, expect, it } from "vitest";
import { buildSql, type Meta, type QueryState } from "./sql";

const meta: Meta = {
  settings: {
    pk: ["blueprint_id"],
    columns: { blueprint_id: { type: "uuid" }, boxes: { type: "jsonb" }, sealed: { type: "boolean" } },
  },
  items: {
    pk: ["id"],
    columns: { id: { type: "uuid" }, title: { type: "text" }, today_order: { type: "integer" }, state: { type: "text" } },
  },
};
const base = (o: Partial<QueryState>): QueryState => ({
  table: "items",
  op: "select",
  cols: "*",
  wheres: [],
  orFilters: [],
  orders: [],
  returning: false,
  ...o,
});

describe("query builder to SQL", () => {
  it("builds filters, order and limit", () => {
    const r = buildSql(
      meta,
      base({
        wheres: [
          { col: "title", op: "eq", value: "x" },
          { col: "today_order", op: "not:is", value: null },
        ],
        orders: [{ col: "today_order", ascending: true }],
        limit: 5,
      }),
    );
    expect(r.text).toBe(
      'select t.* from public."items" as t where t."title" = $1 and not (t."today_order" is null) order by t."today_order" asc limit 5',
    );
    expect(r.params).toEqual(["x"]);
  });
  it("turns the blueprint:blueprints(id, name) join into a sub-select", () => {
    const r = buildSql(meta, base({ cols: "role, blueprint:blueprints(id, name)" }));
    expect(r.text).toContain(
      '(select to_jsonb(e) from (select "id", "name" from public."blueprints" where id = t."blueprint_id") e) as "blueprint"',
    );
  });
  it("handles PostgREST or()", () => {
    const r = buildSql(meta, base({ orFilters: ["state.is.null,state.neq.done"] }));
    expect(r.text).toContain('(t."state" is null or t."state" <> $1)');
    expect(r.params).toEqual(["done"]);
  });
  it("sends arrays to jsonb columns as JSON, not SQL arrays", () => {
    const r = buildSql(
      meta,
      base({ table: "settings", op: "upsert", payload: { blueprint_id: "b", boxes: [{ key: "A" }] } }),
    );
    expect(r.params[1]).toBe('[{"key":"A"}]');
    expect(r.text).toContain('on conflict ("blueprint_id") do update set "boxes" = excluded."boxes"');
  });
  it("update returns rows only when asked", () => {
    const r = buildSql(
      meta,
      base({ op: "update", payload: { title: "n" }, wheres: [{ col: "id", op: "eq", value: "1" }], returning: true }),
    );
    expect(r.text).toBe('update public."items" as t set "title" = $1 where t."id" = $2 returning t.*');
  });
  it("refuses odd column names", () => {
    expect(() => buildSql(meta, base({ wheres: [{ col: "a;drop table x", op: "eq", value: 1 }] }))).toThrow();
  });
});
