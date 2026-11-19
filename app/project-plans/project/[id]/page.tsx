// One building project — the title block, the four prompt sections, and
// the dated log. Everything edits in place and saves on blur.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getBuildings, buildingSlug } from "@/lib/categories";
import { getProject } from "@/lib/projects";
import { ProjectFieldEditor } from "@/components/project-field-editor";
import { ProjectPhaseControl } from "@/components/project-phase-control";
import { ProjectNumberSelect } from "@/components/project-number-select";
import { ProjectStrategySelect } from "@/components/project-strategy-select";
import { ProjectLog } from "@/components/project-log";
import { ProjectTaskEditor } from "@/components/project-task-editor";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { fmtHoursFromMinutes } from "@/lib/format-hours";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, buildings] = await Promise.all([
    getProject(id),
    getBuildings(),
  ]);
  if (!project) notFound();

  const building = buildings.find((b) => b.key === project.building);
  const backHref = building ? `/project-plans/${buildingSlug(building.key)}` : "/project-plans";
  const buildingLabel = building?.label ?? "Uncategorized";
  const totalMinutes = project.tasks
    .filter((t) => !t.done)
    .reduce((sum, t) => sum + (t.minutes ?? 0), 0);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 md:px-10">
      <Link
        href={backHref}
        className="font-mono text-[10px] tracking-[0.2em] text-ink-mute hover:text-brass"
      >
        ← {buildingLabel.toUpperCase()}
      </Link>

      {/* Title block */}
      <div className="mt-3 rounded-sm border border-paper-line-2 bg-paper-panel px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[240px] flex-1">
            <ProjectFieldEditor
              projectId={project.id}
              field="title"
              initial={project.title}
              className="serif-h w-full text-[24px] leading-tight md:text-[28px]"
              placeholder="Project name"
            />
            <div className="mt-1 font-mono text-[10px] tracking-[0.14em] text-ink-mute">
              {buildingLabel.toUpperCase()} · STARTED{" "}
              {new Date(project.createdAt)
                .toLocaleDateString([], { month: "short", year: "numeric" })
                .toUpperCase()}
              {project.completedAt
                ? ` · COMPLETED ${new Date(project.completedAt)
                    .toLocaleDateString([], { month: "short", year: "numeric" })
                    .toUpperCase()}`
                : ""}
            </div>
            <div className="mt-2 text-[13px] text-ink-dim">
              {fmtHoursFromMinutes(totalMinutes)} hours allotted
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
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
              {building?.strategies ? (
                <ProjectStrategySelect
                  projectId={project.id}
                  strategies={building.strategies}
                  initial={project.strategy}
                />
              ) : null}
            </div>
          </div>
          <ProjectPhaseControl projectId={project.id} phase={project.phase} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Section label="Why this matters">
          <ProjectFieldEditor
            projectId={project.id}
            field="why"
            initial={project.why}
            multiline
            placeholder="Two or three sentences — what makes this worth building?"
          />
        </Section>
        <Section label="What done looks like">
          <ProjectFieldEditor
            projectId={project.id}
            field="done_looks_like"
            initial={project.doneLooksLike}
            multiline
            placeholder="The finish line, in plain words. When this is true, it's complete."
          />
        </Section>
      </div>

      <div className="mt-3">
        <Section label="Tasks">
          <ProjectTaskEditor projectId={project.id} initial={project.tasks} />
        </Section>
      </div>

      <div className="mt-3">
        <Section label="The sketch">
          <ProjectFieldEditor
            projectId={project.id}
            field="sketch"
            initial={project.sketch}
            multiline
            rows={4}
            placeholder="Freeform vision — messy allowed."
          />
        </Section>
      </div>

      <div className="mt-3">
        <Section label="Systems — how this runs with less of me">
          <ProjectFieldEditor
            projectId={project.id}
            field="systems"
            initial={project.systems}
            multiline
            rows={4}
            placeholder="Delegate · automate · template · drop. How could this need less of your time?"
          />
        </Section>
      </div>

      <div className="mt-3">
        <Section label="Log">
          <ProjectLog projectId={project.id} initial={project.log} />
        </Section>
      </div>

      <div className="mt-8 flex justify-end border-t border-paper-line pt-4">
        <DeleteProjectButton projectId={project.id} backHref={backHref} />
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-paper-line bg-paper-panel px-4 py-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brass">
        {label}
      </div>
      {children}
    </div>
  );
}
