// All Plans — every project that isn't complete, in three sections
// (Under Construction, Planning, Idea). Inside each section, projects are
// grouped under a large building heading (in the settings' building order)
// and listed simply: title, plus the Priority and Days to Build set on the
// project's own page.
//
// Route stays /project-plans/active (formerly "Active Plans") so nav
// shortcuts and old links keep working.
//
// Within each building, projects sort by Priority (1 → 3, unset last).
// Ties fall back to the saved drag order (projects.active_order) for Under
// Construction — or newest-edited for the others.
// The drag handles themselves went away with the simple list (2026-10-24);
// ReorderableProjectCards is no longer used here.

import Link from "next/link";
import { getBuildings, type Strategy } from "@/lib/categories";
import { groupIdeasByStrategy } from "@/lib/idea-groups";
import { getProjects, type Project } from "@/lib/projects";
import type { ProjectPhase } from "@/lib/project-phases";
import { ProjectNumberSelect } from "@/components/project-number-select";

const SECTIONS: { phase: ProjectPhase; label: string; empty: string }[] = [
  {
    phase: "building",
    label: "Under Construction",
    empty: "Nothing under construction — the campus is at rest.",
  },
  {
    phase: "planning",
    label: "Planning",
    empty: "Nothing on the drafting table.",
  },
  { phase: "idea", label: "Idea", empty: "No ideas waiting." },
];

type BuildingGroup = {
  key: string;
  label: string;
  color?: string;
  strategies?: Strategy[];
  projects: Project[];
};

export default async function AllProjectPlansPage() {
  const [buildings, projects] = await Promise.all([
    getBuildings(),
    getProjects(),
  ]);

  function groupsFor(phase: ProjectPhase): BuildingGroup[] {
    const inPhase = projects
      .filter((p) => p.phase === phase)
      .sort((a, b) => {
        // Priority 1 → 3 first; unset priority goes last. Ties fall back
        // to the previous order below.
        const pa = a.priority ?? 99;
        const pb = b.priority ?? 99;
        if (pa !== pb) return pa - pb;
        if (phase === "building") {
          if (a.activeOrder != null && b.activeOrder != null) {
            return a.activeOrder - b.activeOrder;
          }
          if (a.activeOrder != null) return -1;
          if (b.activeOrder != null) return 1;
        }
        return (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? "");
      });
    const groups: BuildingGroup[] = buildings.map((b) => ({
      key: b.key,
      label: b.label,
      color: b.color,
      strategies: b.strategies,
      projects: inPhase.filter((p) => p.building === b.key),
    }));
    const known = new Set(buildings.map((b) => b.key));
    const other = inPhase.filter((p) => !known.has(p.building));
    if (other.length > 0) {
      groups.push({ key: "__other", label: "Uncategorized", projects: other });
    }
    return groups.filter((g) => g.projects.length > 0);
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 md:px-10">
      <Link
        href="/project-plans"
        className="text-ink-mute hover:text-brass font-mono text-[10px] tracking-[0.2em]"
      >
        ← MASTER PROJECT PLANS
      </Link>
      <h1 className="serif-h mt-3 text-[28px] leading-tight md:text-[36px]">
        All plans.
      </h1>
      <p className="text-ink-dim mt-1 text-[13px]">
        Every project under construction, in planning, or still an idea.
      </p>

      {SECTIONS.map((section) => {
        const groups = groupsFor(section.phase);
        const count = groups.reduce((n, g) => n + g.projects.length, 0);
        // Sum of Days to Build across the section; unset counts as 0.
        const totalDays = groups.reduce(
          (n, g) =>
            n + g.projects.reduce((m, p) => m + (p.daysToBuild ?? 0), 0),
          0,
        );
        return (
          <section key={section.phase} className="mt-12">
            <h2 className="serif-h border-paper-line text-brass flex items-baseline justify-between gap-4 border-b-2 pb-2 text-[30px] leading-tight md:text-[34px]">
              <span>
                {section.label}
                {count > 0 ? ` · ${count}` : ""}
              </span>
              <span className="shrink-0 text-[20px] md:text-[22px]">
                Total Days: {totalDays}
              </span>
            </h2>
            {groups.length === 0 ? (
              <p className="text-ink-mute mt-4 text-[13px]">{section.empty}</p>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="mt-6">
                  <h3 className="text-ink flex items-center gap-2.5 text-[22px] leading-tight font-bold">
                    {g.color ? (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: g.color }}
                        aria-hidden
                      />
                    ) : null}
                    {g.label}
                  </h3>
                  {section.phase === "idea" && g.strategies ? (
                    // Ideas in a building with strategies stay tucked away
                    // until she opens one.
                    <div className="mt-2 space-y-2">
                      {groupIdeasByStrategy(g.projects, g.strategies).map(
                        (sg) => (
                          <details
                            key={sg.key}
                            className="group border-paper-line rounded-sm border px-4 py-2.5"
                          >
                            <summary className="text-ink cursor-pointer list-none text-[16px] marker:hidden">
                              <span className="text-brass/70 mr-2 inline-block transition group-open:rotate-90">
                                ▸
                              </span>
                              {sg.label}
                              <span className="text-ink-mute ml-2 font-mono text-[10px]">
                                {sg.projects.length}
                              </span>
                            </summary>
                            <div className="mt-2 space-y-1.5 pb-1">
                              {sg.projects.map((p) => (
                                <ProjectRow key={p.id} project={p} />
                              ))}
                            </div>
                          </details>
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {g.projects.map((p) => (
                        <ProjectRow key={p.id} project={p} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

// Only the title is a link — the Priority / Days to Build dropdowns sit
// beside it and save in place (same component as the Project Plan page),
// and the list re-sorts by Priority once a change saves.
function ProjectRow({ project }: { project: Project }) {
  return (
    <div className="border-paper-line bg-paper-panel hover:border-brass/60 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-sm border px-4 py-2 transition">
      <Link
        href={`/project-plans/project/${project.id}`}
        className="paper-task-title text-ink hover:text-brass min-w-0"
      >
        {project.title}
      </Link>
      <div className="flex shrink-0 items-center gap-4">
        <ProjectNumberSelect
          projectId={project.id}
          field="priority"
          label="Priority"
          initial={project.priority}
        />
        <ProjectNumberSelect
          projectId={project.id}
          field="days_to_build"
          label="Days to Build"
          initial={project.daysToBuild}
        />
      </div>
    </div>
  );
}
