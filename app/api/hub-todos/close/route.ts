import { NextResponse } from "next/server";
import { KEY_RE, SOURCE_RE } from "@/lib/hub-todos";
import { closeHubTodo } from "@/lib/hub-todos-db";
import { bad, body, failed, hubContext, reject } from "@/lib/hub-todos-api";

export const runtime = "nodejs";

/** Tick a to-do off. Body: { source, key }. Closing one that is already closed (or never existed) is fine. */
export async function POST(req: Request) {
  const no = reject(req);
  if (no) return no;
  try {
    const b = await body(req);
    if (typeof b.source !== "string" || !SOURCE_RE.test(b.source) || typeof b.key !== "string" || !KEY_RE.test(b.key))
      return bad("source and key are required");
    const { admin, blueprintId } = await hubContext();
    return NextResponse.json({ ok: true, closed: await closeHubTodo(admin, blueprintId, { source: b.source, key: b.key }) });
  } catch (e) {
    return failed(e);
  }
}
