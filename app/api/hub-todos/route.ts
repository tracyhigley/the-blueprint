import { NextResponse } from "next/server";
import { validateHubTodo } from "@/lib/hub-todos";
import { listHubTodos, upsertHubTodo } from "@/lib/hub-todos-db";
import { bad, body, failed, hubContext, reject } from "@/lib/hub-todos-api";

export const runtime = "nodejs";

/** Add or update a to-do. Body: { source, key, title, due_on?, link?, notes?, reopen? } */
export async function POST(req: Request) {
  const no = reject(req);
  if (no) return no;
  try {
    const v = validateHubTodo(await body(req));
    if (!v.ok) return bad(v.error);
    const { admin, blueprintId, ownerId } = await hubContext();
    const result = await upsertHubTodo(admin, blueprintId, ownerId, v.value);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return failed(e);
  }
}

/** Open hub to-dos. Optional ?source=finance. */
export async function GET(req: Request) {
  const no = reject(req);
  if (no) return no;
  try {
    const source = new URL(req.url).searchParams.get("source") ?? undefined;
    const { admin, blueprintId } = await hubContext();
    return NextResponse.json({ ok: true, todos: await listHubTodos(admin, blueprintId, source) });
  } catch (e) {
    return failed(e);
  }
}
