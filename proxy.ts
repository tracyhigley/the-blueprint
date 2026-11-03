import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getDefaultCanonicalSiteUrl,
  isLegacyProjectHost,
} from "@/lib/site-url";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/capture",
  "/api/hub-todos", // its own bearer token, checked in the routes
  "/api/cron/calendar-to-drop",
  "/onboarding",
];

export async function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? req.nextUrl.host).split(":")[0];
  if (isLegacyProjectHost(host)) {
    const target = new URL(
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
      getDefaultCanonicalSiteUrl(),
    );
    return NextResponse.redirect(target, 308);
  }

  const res = NextResponse.next({ request: req });

  const session = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const user = session ? { id: session.uid } : null;

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p + "/"),
  );

  if (!user && !isPublic) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  // Authed but not yet a member of any blueprint → onboarding.
  if (user && !isPublic && path !== "/onboarding") {
    const { data: membership } = await supabaseAdmin()
      .from("blueprint_members")
      .select("blueprint_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      const onboarding = req.nextUrl.clone();
      onboarding.pathname = "/onboarding";
      return NextResponse.redirect(onboarding);
    }
  }

  return res;
}

// Skip middleware on Next-generated framework assets (icons, manifest)
// in addition to the usual static-asset exclusions. Without these,
// browsers requesting /icon0, /apple-icon, or /manifest.webmanifest
// before login get redirected to /login and the install / favicon
// requests fail.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon\\b|icon\\d|apple-icon|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
