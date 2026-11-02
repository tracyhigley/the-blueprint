// To-dos sent by the hub — pure logic (no database, no Next.js). The hub
// (finance, author, Ron) says "this needs Tracy" with a source and a key;
// the same key later means the same to-do, so nothing is added twice.
// Dated ones live in Future Tasks, undated ones in Field Notes (decision 15
// in the hub's architecture plan). The database side is lib/hub-todos-db.ts.

import { type Result, validateTask } from "./future-tasks";

export const SOURCE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,99}$/;

export type HubTodo = {
  source: string;
  key: string;
  title: string;
  due_on: string | null;
  link: string | null;
  notes: string | null;
  /** Put a to-do back on the list even if it was ticked off. The hub decides when. */
  reopen: boolean;
};

export function validateHubTodo(input: Record<string, unknown>): Result<HubTodo> {
  const source = input.source;
  if (typeof source !== "string" || !SOURCE_RE.test(source))
    return { ok: false, error: "source must be a short lowercase word like finance" };
  const key = input.key;
  if (typeof key !== "string" || !KEY_RE.test(key))
    return { ok: false, error: "key must be 1-100 letters, numbers, : . _ -" };
  const task = validateTask({
    title: input.title as string,
    show_on: input.due_on as string | null | undefined,
    repeat: "none",
    link: input.link as string | null | undefined,
    notes: input.notes as string | null | undefined,
  });
  if (!task.ok) return task;
  return {
    ok: true,
    value: {
      source,
      key,
      title: task.value.title,
      due_on: task.value.due_on,
      link: task.value.link,
      notes: task.value.notes,
      reopen: input.reopen === true,
    },
  };
}

/** True when the request's bearer token is the hub's token (and the routes are switched on). */
export function tokenMatches(authHeader: string | null, expected: string | undefined): boolean {
  if (!expected || expected.length < 20) return false; // sealed until a real token is set
  const given = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
