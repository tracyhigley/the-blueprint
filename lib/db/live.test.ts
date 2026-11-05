// Runs only when LIVE_DB_TEST_URL points at a throwaway copy built by
// scripts/railway-setup.mjs (never the real database).
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.LIVE_DB_TEST_URL;
const d = url ? describe : describe.skip;

d("against a rehearsal copy", () => {
  process.env.DATABASE_URL = url;
  afterAll(async () => {
    const { pool } = await import("./client");
    await pool().end();
  });

  async function ids() {
    const { makeClient } = await import("./client");
    const admin = makeClient({ kind: "admin" }, { user: null, signOut: async () => {} });
    const { data: members } = await admin.from("blueprint_members").select("*");
    return { admin, member: members[0], makeClient };
  }

  it("a member sees their rows, a stranger and a signed-out visitor see none", async () => {
    const { admin, member, makeClient } = await ids();
    const as = (userId: string | null) => makeClient({ kind: "user", userId }, { user: null, signOut: async () => {} });
    const total = (await admin.from("items").select("id").eq("blueprint_id", member.blueprint_id)).data.length;
    expect(total).toBeGreaterThan(0);
    expect((await as(member.user_id).from("items").select("id").eq("blueprint_id", member.blueprint_id)).data.length).toBe(total);
    expect((await as("00000000-0000-0000-0000-000000000001").from("items").select("id")).data).toEqual([]);
    expect((await as(null).from("items").select("id")).data).toEqual([]);
  });

  it("the blueprint join, dates and numbers come back in the shape the app expects", async () => {
    const { member, makeClient } = await ids();
    const sb = makeClient({ kind: "user", userId: member.user_id }, { user: null, signOut: async () => {} });
    const { data } = await sb.from("blueprint_members").select("blueprint_id, role, blueprint:blueprints(id, name)").limit(1).maybeSingle();
    expect(data.blueprint.id).toBe(data.blueprint_id);
    const day = (await sb.from("day_inputs").select("date, hours_available, created_at").limit(1).maybeSingle()).data;
    expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof day.hours_available).toBe("number");
    expect(day.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+([+-]\d{2}:\d{2}|Z)$/);
  });

  it("writes: jsonb arrays, upsert, update with returning, soft delete — and a stranger can't write", async () => {
    const { admin, member, makeClient } = await ids();
    const sb = makeClient({ kind: "user", userId: member.user_id }, { user: null, signOut: async () => {} });
    const { data: before } = await sb.from("settings").select("boxes").eq("blueprint_id", member.blueprint_id).maybeSingle();
    const r = await sb.from("settings").upsert({ blueprint_id: member.blueprint_id, boxes: before.boxes });
    expect(r.error).toBeNull();
    const { data: after } = await sb.from("settings").select("boxes").eq("blueprint_id", member.blueprint_id).maybeSingle();
    expect(after.boxes).toEqual(before.boxes);

    const ins = await sb.from("items").insert({ blueprint_id: member.blueprint_id, user_id: member.user_id, box: "DROP", title: "rehearsal test" }).select("id, title").single();
    expect(ins.error).toBeNull();
    const upd = await sb.from("items").update({ title: "rehearsal test 2" }).eq("id", ins.data.id).select("title").single();
    expect(upd.data.title).toBe("rehearsal test 2");

    const stranger = makeClient({ kind: "user", userId: "00000000-0000-0000-0000-000000000001" }, { user: null, signOut: async () => {} });
    const bad = await stranger.from("items").update({ title: "hacked" }).eq("id", ins.data.id).select("id");
    expect(bad.data).toEqual([]);
    const strangerInsert = await stranger.from("items").insert({ blueprint_id: member.blueprint_id, user_id: member.user_id, box: "DROP", title: "nope" });
    expect(strangerInsert.error).not.toBeNull();

    await admin.from("items").delete().eq("id", ins.data.id);
    expect((await admin.from("items").select("id").eq("id", ins.data.id)).data).toEqual([]);
  });

  it("the hub's to-do functions work through it (create, update, close, list)", async () => {
    const { admin, member } = await ids();
    const { upsertHubTodo, closeHubTodo, listHubTodos } = await import("../hub-todos-db");
    const t = { source: "rehearsal", key: "t:1", title: "Rehearsal to-do", due_on: null, link: null, notes: null, reopen: false };
    expect(await upsertHubTodo(admin, member.blueprint_id, member.user_id, t)).toBe("created");
    expect(await upsertHubTodo(admin, member.blueprint_id, member.user_id, { ...t, title: "Rehearsal to-do 2" })).toBe("updated");
    const listed = await listHubTodos(admin, member.blueprint_id, "rehearsal");
    expect(listed.map((x: { title: string }) => x.title)).toEqual(["Rehearsal to-do 2"]);
    await closeHubTodo(admin, member.blueprint_id, { source: "rehearsal", key: "t:1" });
    expect(await listHubTodos(admin, member.blueprint_id, "rehearsal")).toEqual([]);
    await admin.from("items").delete().eq("source", "rehearsal");
  });

  it("the morning job can claim a due Future Task (timestamps match to the microsecond)", async () => {
    const { admin, member } = await ids();
    const { sendDueForBlueprint } = await import("../future-tasks-db");
    const { data: t } = await admin
      .from("future_tasks")
      .insert({ blueprint_id: member.blueprint_id, title: "rehearsal due task", due_on: "2026-01-01", repeat: "none" })
      .select("id")
      .single();
    try {
      const sent = await sendDueForBlueprint(admin, member.blueprint_id, { today: "2026-11-05", siteUrl: "https://x.test" });
      expect(sent.map((x: { title: string }) => x.title)).toContain("rehearsal due task");
      const { data: item } = await admin.from("items").select("id").eq("title", "rehearsal due task").maybeSingle();
      expect(item?.id).toBeTruthy();
    } finally {
      await admin.from("items").delete().eq("title", "rehearsal due task");
      await admin.from("captures").delete().eq("raw", "rehearsal due task");
      await admin.from("future_tasks").delete().eq("id", t.id);
    }
  });
});
