"use client";

import { useRouter } from "next/navigation";
import { markPreferTodayOverDropLanding } from "@/lib/nav-client";
import { useShortcut } from "@/lib/shortcuts";

// Registers the global navigation + capture shortcuts.
// Mounted once in app/layout.tsx.
export function GlobalShortcuts() {
  const router = useRouter();
  const go = (path: string) => () => router.push(path);

  useShortcut(
    "g d",
    () => {
      markPreferTodayOverDropLanding();
      router.push("/");
    },
    { label: "Today (Docket)", group: "Navigate" },
  );
  useShortcut("g r", go("/field-notes"), { label: "Field Notes", group: "Navigate" });
  useShortcut("g t", go("/future-tasks"), { label: "Future Tasks", group: "Navigate" });
  useShortcut("g w", go("/ten-day-plan"), { label: "10-Day Plan", group: "Navigate" });
  useShortcut("g c", go("/maint-tasks"), { label: "Maint Tasks", group: "Navigate" });
  useShortcut("g a", go("/project-tasks"), { label: "Project Tasks", group: "Navigate" });
  useShortcut("g e", go("/documents"), { label: "NOTES", group: "Navigate" });
  useShortcut("g p", go("/project-plans"), { label: "Bldg Plans", group: "Navigate" });
  useShortcut("g u", go("/project-plans/active"), { label: "All Plans", group: "Navigate" });
  useShortcut("g f", go("/project-plans/completed"), { label: "Completed Projects", group: "Navigate" });
  useShortcut("g s", go("/settings"), { label: "Settings", group: "Navigate" });
  useShortcut("g b", go("/build?step=1"), { label: "Build day", group: "Navigate" });

  // Quick-add (n) opens the same surface as ⌘K. CmdK component listens
  // for a custom event so this stays decoupled.
  useShortcut(
    "n",
    () => window.dispatchEvent(new CustomEvent("app:open-cmdk")),
    { label: "Quick add (Field Notes)", group: "Capture" },
  );

  return null;
}
