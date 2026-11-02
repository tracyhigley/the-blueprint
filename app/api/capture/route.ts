import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const Body = z.object({
  text: z.string().min(1).max(2000),
  source: z.enum(["siri", "shortcut", "pwa", "mailslot"]).default("shortcut"),
  userId: z.string().uuid(),
});

/** Bearer matches `settings.capture_token` for a blueprint the user belongs to, or legacy `CAPTURE_TOKEN` env + user’s default blueprint. */
async function resolveBlueprintId(
  bearerToken: string,
  userId: string,
): Promise<string | null> {
  const trimmed = bearerToken.trim();
  if (!trimmed) return null;

  const sb = supabaseAdmin();

  const { data: settingsHit } = await sb
    .from("settings")
    .select("blueprint_id")
    .eq("capture_token", trimmed)
    .maybeSingle();

  if (settingsHit?.blueprint_id) {
    const { data: member } = await sb
      .from("blueprint_members")
      .select("blueprint_id")
      .eq("blueprint_id", settingsHit.blueprint_id)
      .eq("user_id", userId)
      .maybeSingle();
    return member?.blueprint_id ?? null;
  }

  const envTok = process.env.CAPTURE_TOKEN?.trim();
  if (envTok && trimmed === envTok) {
    const { data: membership } = await sb
      .from("blueprint_members")
      .select("blueprint_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return membership?.blueprint_id ?? null;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const bearerToken = auth.replace(/^Bearer\s+/i, "").trim();
  if (!bearerToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const blueprintId = await resolveBlueprintId(bearerToken, parsed.userId);
  if (!blueprintId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: item, error } = await sb
    .from("items")
    .insert({
      blueprint_id: blueprintId,
      user_id: parsed.userId,
      box: "DROP",
      title: parsed.text.trim(),
      urgent: false,
      must: false,
      should: false,
      pinned: false,
    })
    .select()
    .single();

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  await sb.from("captures").insert({
    blueprint_id: blueprintId,
    user_id: parsed.userId,
    raw: parsed.text,
    source: parsed.source,
    item_id: item.id,
  });

  return Response.json({ ok: true, itemId: item.id });
}
