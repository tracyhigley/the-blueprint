// 10-Day Plan — replaces This Week. Ten working days (Sundays skipped) from a
// start date. Each day: one Press project (3 hours) and two projects from
// other buildings (3 hours), or "No Project Work Today", or "Maintenance
// Tasks Only Today". Each slot gets a "worked on it" check so progress shows;
// a project marked Complete stays on the page, struck through.

import { getBuildings } from "@/lib/categories";
import { getProjects, getTenDayPlan } from "@/lib/projects";
import { getItemsByBox } from "@/lib/data";
import { todayYmd } from "@/lib/day-timezone";
import {
  PRESS_BUILDING_KEY,
  countSlots,
  emptyDay,
  formatPlanDate,
  planDates,
} from "@/lib/ten-day-plan";
import {
  TenDayPlanDay,
  type MaintGroup,
  type PlanProject,
} from "@/components/ten-day-plan-day";
import { TenDayPlanStartButton } from "@/components/ten-day-plan-start-button";

export default async function TenDayPlanPage() {
  const [buildings, projects, plan, counterItems] = await Promise.all([
    getBuildings(),
    getProjects(),
    getTenDayPlan(),
    getItemsByBox("COUNTER"),
  ]);
  const today = todayYmd();
  const buildingByKey = new Map(buildings.map((b) => [b.key, b]));

  const planProjects: PlanProject[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    buildingLabel: buildingByKey.get(p.building)?.label ?? "Uncategorized",
    buildingColor: buildingByKey.get(p.building)?.color,
    complete: p.phase === "complete",
    priority: p.priority,
    daysToBuild: p.daysToBuild,
  }));
  const byId = new Map(planProjects.map((p) => [p.id, p]));

  // Only projects under construction can be picked, best priority first
  // (unset last), then by name.
  const pickable = projects
    .filter((p) => p.phase === "building")
    .sort(
      (a, b) =>
        (a.priority ?? 99) - (b.priority ?? 99) || a.title.localeCompare(b.title),
    );
  const pressChoices = pickable
    .filter((p) => p.building === PRESS_BUILDING_KEY)
    .map((p) => byId.get(p.id)!);
  const otherChoices = pickable
    .filter((p) => p.building !== PRESS_BUILDING_KEY)
    .map((p) => byId.get(p.id)!);

  // Open Maint Tasks by building — same filter the old This Week page used
  // (no project-linked items, custom blocks, done items, or the daily
  // Wellness Center habits).
  const groups = new Map<string, MaintGroup>();
  for (const it of counterItems) {
    if (
      it.sourceTaskId ||
      it.tag === "CUSTOM_BLOCK" ||
      it.state === "done" ||
      it.tag?.startsWith("DAILY_WELLNESS_CENTER:") ||
      !it.area
    )
      continue;
    const b = buildingByKey.get(it.area);
    const g = groups.get(it.area) ?? {
      label: b?.label ?? "Uncategorized",
      color: b?.color,
      tasks: [],
    };
    g.tasks.push({ id: it.id, title: it.title, minutes: it.minutes ?? null });
    groups.set(it.area, g);
  }
  const maintGroups = Array.from(groups.values());

  if (!plan.start) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-10">
        <div className="eyebrow">— 10-Day Plan —</div>
        <h1 className="serif-h mt-2 text-[34px] leading-tight md:text-[44px]">
          The next ten days.
        </h1>
        <p className="mt-2 mb-6 text-[16px] leading-relaxed text-ink-dim">
          Ten working days, Sundays skipped. Each day: one Press project and
          two projects from your other buildings.
        </p>
        <TenDayPlanStartButton label="Start my 10-day plan today" />
      </div>
    );
  }

  const dates = planDates(plan.start);
  const { worked, total } = countSlots(plan);
  const finished = today > dates[dates.length - 1];

  // "Day 2 of 5": how many times this project has been picked so far in the
  // plan, counting this slot — recomputed from what's saved.
  const seen = new Map<string, number>();
  const dayNumbersByDate = new Map<
    string,
    Record<string, { projectId: string; n: number }>
  >();
  for (const date of dates) {
    const day = plan.days[date];
    const out: Record<string, { projectId: string; n: number }> = {};
    if (day && !day.mode) {
      const slots: [string, { projectId: string } | null][] = [
        ["press", day.press],
        ["0", day.others[0]],
        ["1", day.others[1]],
      ];
      for (const [key, slot] of slots) {
        if (!slot) continue;
        const n = (seen.get(slot.projectId) ?? 0) + 1;
        seen.set(slot.projectId, n);
        out[key] = { projectId: slot.projectId, n };
      }
    }
    dayNumbersByDate.set(date, out);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-10">
      <div className="eyebrow">— 10-Day Plan —</div>
      <h1 className="serif-h mt-2 text-[34px] leading-tight md:text-[44px]">
        {formatPlanDate(dates[0])} – {formatPlanDate(dates[dates.length - 1])}
      </h1>

      <div className="mt-4 rounded-sm border border-paper-line bg-paper-panel/40 px-4 py-4 md:px-6">
        <div className="text-[17px] text-ink">
          {worked} of {total} project slots worked on
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-line">
          <div
            className="h-full bg-brass transition-all"
            style={{ width: total ? `${(worked / total) * 100}%` : "0%" }}
          />
        </div>
        {finished && (
          <p className="mt-3 text-[15px] text-ink-dim">
            This plan is finished — ready for the next ten days?
          </p>
        )}
        <div className="mt-3">
          <TenDayPlanStartButton
            label="Start a new plan today"
            confirmFirst={!finished}
          />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-sm border border-paper-line">
        {dates.map((date, i) => (
          <div
            key={date}
            className={i > 0 ? "border-t border-paper-line" : undefined}
          >
            <TenDayPlanDay
              date={date}
              isToday={date === today}
              initialDay={plan.days[date] ?? emptyDay()}
              pressChoices={pressChoices}
              otherChoices={otherChoices}
              projects={planProjects}
              dayNumbers={dayNumbersByDate.get(date) ?? {}}
              maintGroups={maintGroups}
            />
          </div>
        ))}
      </div>

      {plan.past.length > 0 && (
        <div className="mt-8">
          <div className="eyebrow">— Past plans —</div>
          <ul className="mt-3 space-y-1.5 text-[15px] text-ink-dim">
            {[...plan.past].reverse().map((p) => (
              <li key={p.start}>
                {formatPlanDate(p.start)} – {formatPlanDate(p.end)}: {p.worked}{" "}
                of {p.total} project slots worked on
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
