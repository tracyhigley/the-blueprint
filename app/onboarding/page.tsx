import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { createMyBlueprint } from "@/lib/actions";

export default async function OnboardingPage() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await sb
    .from("blueprint_members")
    .select("blueprint_id")
    .limit(1)
    .maybeSingle();

  if (membership) redirect("/");

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16 md:px-10">
      <div className="eyebrow">— First run —</div>
      <h1 className="serif-h mt-2 text-[36px] leading-tight md:text-[44px]">
        Welcome to your blueprint.
      </h1>
      <p className="mt-3 text-ink-dim">
        You don&rsquo;t belong to a blueprint yet. Either start a fresh one of your own,
        or wait for someone to invite you to theirs.
      </p>

      <form
        action={async (fd) => {
          "use server";
          await createMyBlueprint((fd.get("name") as string) ?? "The Blueprint");
          redirect("/");
        }}
        className="mt-10 rounded-sm border border-paper-line bg-paper-panel/40 p-5"
      >
        <h2 className="serif-h text-[22px]">Start a new blueprint</h2>
        <p className="mt-1 text-[13px] text-ink-dim">
          You&rsquo;ll be the owner. You can invite others under Settings → Members.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <input
            name="name"
            placeholder="The Blueprint"
            defaultValue="The Blueprint"
            className="flex-1 min-w-[200px] rounded-sm border border-paper-line bg-paper-bg/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
          <button
            type="submit"
            className="brass-button px-6 py-2 font-mono text-[10px] tracking-[0.24em]"
          >
            CREATE BLUEPRINT
          </button>
        </div>
      </form>

      <div className="mt-8 rounded-sm border border-dashed border-paper-line p-5 text-[13px] text-ink-mute">
        Waiting on an invite? Ask the blueprint owner to add you under{" "}
        <span className="text-brass">Settings → Members</span>. The link will
        come to your email.
      </div>

      <div className="mt-12 flex justify-end">
        <Link
          href="/auth/signout"
          className="text-[11px] text-ink-mute underline hover:text-ink"
        >
          Sign out
        </Link>
      </div>
    </div>
  );
}
