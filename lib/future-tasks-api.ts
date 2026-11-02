// Shared bits for the /api/future-tasks routes: sign-in check, the
// current blueprint, JSON replies, and "send it now if it's already due".

import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { getSiteUrlFromEnv } from "@/lib/site-url";
import { futureTasksToday } from "@/lib/future-tasks";
import { notifySlack, sendDueForBlueprint, TaskGone } from "@/lib/future-tasks-db";

export class BadInput extends Error {}

export async function requireCtx() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new BadInput("sign in first");
  const { data } = await sb
    .from("blueprint_members")
    .select("blueprint_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.blueprint_id)
    throw new BadInput("no blueprint found for this account");
  return { sb, userId: user.id as string, blueprintId: data.blueprint_id as string };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export function ok(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...extra });
}

export function errorReply(e: unknown) {
  if (e instanceof BadInput || e instanceof TaskGone) {
    const status =
      e instanceof BadInput && e.message === "sign in first" ? 401 : 400;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
  console.error("future-tasks", e);
  return NextResponse.json(
    { ok: false, error: "something went wrong — try again" },
    { status: 500 },
  );
}

/**
 * A task added (or edited/put back) with a date of today or earlier goes
 * straight to Field Notes instead of waiting for tomorrow morning's job.
 * Failures here never undo the save; the morning job will pick it up.
 */
export async function sendNowIfDue(blueprintId: string): Promise<number> {
  try {
    const admin = supabaseAdmin();
    const today = futureTasksToday();
    const siteUrl = getSiteUrlFromEnv();
    const sent = await sendDueForBlueprint(admin, blueprintId, { today, siteUrl });
    if (sent.length) {
      try {
        await notifySlack(sent, today, siteUrl);
      } catch (e) {
        console.error("future-tasks slack", e);
      }
    }
    return sent.length;
  } catch (e) {
    console.error("future-tasks send", e);
    return 0;
  }
}
