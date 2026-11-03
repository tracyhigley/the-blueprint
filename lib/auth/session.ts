// Our own sign-in cookie: "<base64url payload>.<HMAC>" signed with SESSION_SECRET.
// Replaces Supabase's session cookie. Payload is just who and until when.

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "bp_session";
export const SESSION_DAYS = 30;

export type Session = { uid: string; email: string | null; exp: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return s;
}

function mac(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signSession(uid: string, email: string | null, now = Date.now()): string {
  const payload: Session = { uid, email, exp: now + SESSION_DAYS * 86400_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function readSession(token: string | undefined | null, now = Date.now()): Session | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const want = Buffer.from(mac(body));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    if (typeof p.uid !== "string" || typeof p.exp !== "number" || p.exp < now) return null;
    return p;
  } catch {
    return null;
  }
}
