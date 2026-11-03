import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/auth/session";

export const runtime = "nodejs";

// A wrong email and a wrong password look the same on purpose.
const NO = () => NextResponse.json({ ok: false, error: "That email and password don't match." }, { status: 401 });

export async function POST(req: Request) {
  let email = "";
  let password = "";
  try {
    const b = await req.json();
    email = String(b.email ?? "").trim().toLowerCase();
    password = String(b.password ?? "");
  } catch {
    return NO();
  }
  if (!email || !password) return NO();

  const { data } = await supabaseAdmin().from("users_login").select("id, email, password_hash").eq("email", email).maybeSingle();
  const ok = data?.password_hash ? await bcrypt.compare(password, data.password_hash) : await bcrypt.compare(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
  if (!data || !ok) {
    await new Promise((r) => setTimeout(r, 400)); // slows down guessing
    return NO();
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(data.id, data.email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
