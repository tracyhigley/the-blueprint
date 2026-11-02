// Shared bits for the /api/hub-todos routes: the hub's bearer token, the
// blueprint it writes to, and JSON replies. Sealed until both
// HUB_TODO_TOKEN and HUB_TODO_BLUEPRINT_ID are set on the server.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { tokenMatches } from "@/lib/hub-todos";

export function reject(req: Request): NextResponse | null {
  if (!process.env.HUB_TODO_TOKEN || !process.env.HUB_TODO_BLUEPRINT_ID)
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (!tokenMatches(req.headers.get("authorization"), process.env.HUB_TODO_TOKEN))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return null;
}

export async function hubContext() {
  const admin = supabaseAdmin();
  const blueprintId = process.env.HUB_TODO_BLUEPRINT_ID!;
  const { data, error } = await admin.from("blueprints").select("owner_id").eq("id", blueprintId).maybeSingle();
  if (error || !data?.owner_id) throw new Error("the hub's blueprint was not found");
  return { admin, blueprintId, ownerId: data.owner_id as string };
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

export function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export function failed(e: unknown) {
  console.error("hub-todos", e);
  return NextResponse.json({ ok: false, error: "something went wrong" }, { status: 500 });
}
