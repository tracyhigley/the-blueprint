// Inside one building — its projects grouped by phase. Ideas render as
// compact pills (one line of attention each); active work gets full cards.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getBuildings, buildingSlug } from "@/lib/categories";
import { getProjectsByBuilding, type Project } from "@/lib/projects";
import { NewProjectRow } from "@/components/new-project-row";
import { fmtHoursFromMinutes } from "@/lib/format-hours";
import { groupIdeasByStrategy, NO_STRATEGY_KEY } from "@/lib/idea-groups";

export default async function BuildingPage({
  params,
}: {
  params: Promise<{ building: string }>;
}) {
  const { building: slug } = await params;
  const buildings = await getBuildings();
  const building = buildings.find((b) => buildingSlug(b.key) === slug);
  if (!building) notFound();

  const projects = await getProjectsByBuilding(building.key);
  const byPhase = (phase: Project["phase"]) =>
    projects.filter((p) => p.phase === phase);

  const active = byPhase("building");
  const planning = byPhase("planning");
  const ideas = byPhase("idea");
  const complete = byPhase("complete");

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 md:px-10">
      <Link
        href="/project-plans"
        className="font-mono text-[10px] tracking-[0.2em] text-ink-mute hover:text-brass"
      >
        ← MASTER PROJECT PLANS
      </Link>
      <h1 className="serif-h mt-3 text-[28px] leading-tight md:text-[36px]">
        {building.label}
      </h1>
      {building.meta ? (
        <p className="mt-1 text-[13px] italic text-ink-dim">{building.meta}</p>
      ) : null}

      <SectionHeader
        label={`Under construction${active.length > 0 ? ` · ${active.length}` : ""}`}
        accent
      />
      {active.length === 0 ? (
        <p className="text-[13px] text-ink-mute">
          Nothing under construction here right now.
        </p>
      ) : (
        <div className="space-y-2">
          {active.map((p) => (
            <ProjectCard key={p.id} project={p} accent />
          ))}
        </div>
      )}

      <SectionHeader label="Planning" />
      {planning.length === 0 ? (
        <p className="text-[13px] text-ink-mute">Nothing on the drafting table.</p>
      ) : (
        <div className="space-y-2">
          {planning.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <SectionHeader label="Ideas · resting" />
      {building.strategies ? (
        // Collapsed by default so a long list of ideas stays out of sight
        // until she's picking from one strategy.
        <div className="space-y-2">
          {groupIdeasByStrategy(ideas, building.strategies).map((g) => (
            <details
              key={g.key}
              className="group rounded-sm border border-paper-line bg-paper-panel/40 px-4 py-2.5"
            >
              <summary className="cursor-pointer list-none text-[14px] text-ink marker:hidden">
                <span className="mr-2 text-brass/70 transition group-open:rotate-90 inline-block">
                  ▸
                </span>
                {g.label}
                <span className="ml-2 font-mono text-[10px] text-ink-mute">
                  {g.projects.length}
                </span>
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-2 pb-1">
                {g.projects.map((p) => (
                  <IdeaPill key={p.id} project={p} />
                ))}
                <NewProjectRow
                  building={building.key}
                  strategy={g.key === NO_STRATEGY_KEY ? undefined : g.key}
                />
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {ideas.map((p) => (
            <IdeaPill key={p.id} project={p} />
          ))}
          <NewProjectRow building={building.key} />
        </div>
      )}

      {complete.length > 0 ? (
        <>
          <SectionHeader label="Completed" />
          <div className="divide-y divide-paper-line/60">
            {complete.map((p) => (
              <Link
                key={p.id}
                href={`/project-plans/project/${p.id}`}
                className="flex items-baseline justify-between gap-3 py-2 text-[13px] text-ink-mute transition hover:text-ink"
              >
                <span>
                  <span className="mr-2 text-teal">✓</span>
                  {p.title}
                </span>
                {p.completedAt ? (
                  <span className="shrink-0 font-mono text-[10px] text-ink-mute/70">
                    {new Date(p.completedAt).toLocaleDateString([], {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function IdeaPill({ project }: { project: Project }) {
  return (
    <Link
      href={`/project-plans/project/${project.id}`}
      className="rounded-full border border-paper-line bg-paper-bg-2 px-3.5 py-1.5 text-[13px] text-ink-dim transition hover:border-brass/60 hover:text-ink"
    >
      {project.title}
    </Link>
  );
}

function SectionHeader({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <div
      className={`mt-10 mb-3 font-mono text-[10px] uppercase tracking-[0.2em] ${accent ? "text-brass" : "text-ink-mute"}`}
    >
      {label}
    </div>
  );
}

function ProjectCard({
  project,
  accent,
}: {
  project: Project;
  accent?: boolean;
}) {
  const lastLog = project.log.at(-1);
  const totalMinutes = project.tasks
    .filter((t) => !t.done)
    .reduce((sum, t) => sum + (t.minutes ?? 0), 0);
  return (
    <Link
      href={`/project-plans/project/${project.id}`}
      className={`block rounded-sm border bg-paper-panel px-4 py-3 transition hover:border-brass/60 ${
        accent ? "border-paper-line border-l-[3px] border-l-brass" : "border-paper-line"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="paper-task-title text-ink">{project.title}</span>
        <span className="font-mono text-[10px] text-ink-mute">
          {lastLog ? `last note ${lastLog.date}` : ""}
          {lastLog && totalMinutes > 0 ? " · " : ""}
          {totalMinutes > 0
            ? `${fmtHoursFromMinutes(totalMinutes)} hrs`
            : ""}
        </span>
      </div>
      {project.doneLooksLike ? (
        <div className="mt-1 text-[12px] text-ink-dim">
          Done looks like: {project.doneLooksLike}
        </div>
      ) : null}
    </Link>
  );
}
