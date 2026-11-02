import Link from "next/link";
import Image from "next/image";
import { getDocuments } from "@/lib/categories";
import { fiftyFdDocumentHref } from "@/lib/document-folders";
import { getSettings } from "@/lib/data";
import { HomeLink } from "@/components/home-link";
import { supabaseServer } from "@/lib/supabase/server";
import { TopBarNav } from "./top-bar-nav";
import { MobileNav } from "./mobile-nav";
import { SealToggle } from "./seal-toggle";

// Top bar is a Server Component so we can read settings (sealed flag).
// The nav itself is a Client Component because it needs usePathname.
// We render nothing for unauthed users — login/onboarding stand alone.

export async function TopBar() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data: membership } = await sb
    .from("blueprint_members")
    .select("blueprint_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const [settings, documents] = await Promise.all([
    getSettings(),
    getDocuments(),
  ]);
  const sealed = !!settings?.sealed;
  const fiftyFdHref = fiftyFdDocumentHref(documents);

  return (
    <header className="relative z-10 flex items-center justify-between gap-3 border-b border-paper-line/50 bg-paper-bg/85 px-4 py-3 backdrop-blur md:px-10 md:py-4">
      <HomeLink className="flex shrink-0 items-center gap-2.5 md:gap-3">
        <Image
          src="/brand-icon.png"
          alt=""
          width={560}
          height={560}
          priority
          className="h-11 w-11 md:h-14 md:w-14"
        />
        <span className="font-serif text-xl leading-none text-ink md:text-2xl">
          The Blueprint
        </span>
      </HomeLink>

      <TopBarNav fiftyFdHref={fiftyFdHref} />
      <MobileNav fiftyFdHref={fiftyFdHref} />

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/field-notes/add"
          className="rounded-sm border border-gold/40 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] text-gold hover:bg-gold/10"
          title="Jot a field note"
        >
          + JOT
        </Link>
        <SealToggle sealed={sealed} />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-paper-line bg-paper-panel text-brass-bright hover:border-brass"
          >
            T
          </button>
        </form>
      </div>
    </header>
  );
}
