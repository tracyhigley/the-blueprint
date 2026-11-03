// Kept at this path (and under these names) so the rest of the app didn't
// have to change when the database moved from Supabase to Railway Postgres.
// supabaseServer() = the signed-in person's client (row-level rules apply);
// supabaseAdmin() = the owner client for token-protected server routes.

import { cookies } from "next/headers";
import { makeClient } from "@/lib/db/client";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function supabaseServer() {
  const store = await cookies();
  const s = readSession(store.get(SESSION_COOKIE)?.value);
  return makeClient(
    { kind: "user", userId: s?.uid ?? null },
    {
      user: s ? { id: s.uid, email: s.email } : null,
      signOut: async () => {
        store.delete(SESSION_COOKIE);
      },
    },
  );
}

export function supabaseAdmin() {
  return makeClient({ kind: "admin" }, { user: null, signOut: async () => {} });
}
