import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getDefaultCanonicalSiteUrl,
  isLegacyProjectHost,
} from "@/lib/site-url";

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/reset",
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

  let res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !key) {
    return res; // env not set yet — let pages render their empty states
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        toSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    const { data: membership } = await supabase
      .from("blueprint_members")
      .select("blueprint_id")
      .order("created_at", { ascending: false })
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
