import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { deleteOldDone, sendAllDue } from "@/lib/future-tasks-db";
import { getSiteUrlFromEnv } from "@/lib/site-url";

export const runtime = "nodejs";

// The daily morning job (see vercel.json). It used to import Google
// Calendar events into Field Notes; that's retired (Oct 2026) in favor of
// Future Tasks. The path keeps its old name so the Vercel cron config and
// CRON_SECRET don't need touching.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!secret || auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Today's Future Tasks go into Field Notes, plus one Slack alert per
  // blueprint.
  try {
    const futureTasks = await sendAllDue(supabaseAdmin(), {
      siteUrl: getSiteUrlFromEnv(),
    });
    // Done Future Tasks older than 10 days are deleted (Tracy, 2026-11-05).
    let deletedDone = 0;
    try {
      deletedDone = await deleteOldDone(supabaseAdmin());
    } catch (e) {
      console.warn("future tasks cleanup", e);
    }
    return NextResponse.json({ futureTasks, deletedDone });
  } catch (e) {
    return NextResponse.json(
      {
        futureTasks: {
          ok: false,
          sent: 0,
          errors: [e instanceof Error ? e.message : String(e)],
        },
      },
      { status: 500 },
    );
  }
}
