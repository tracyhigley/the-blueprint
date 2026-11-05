// Future Tasks — to-dos that belong to a later date (or "someday"). On a
// task's day the morning job (app/api/cron/calendar-to-drop, which kept its old name) puts it into
// Field Notes and sends a Slack alert. Logic: lib/future-tasks.ts.

import { getCurrentBlueprint } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { futureTasksToday, groupTasks } from "@/lib/future-tasks";
import { listTasks } from "@/lib/future-tasks-db";
import { getBuildings } from "@/lib/categories";
import { FutureTasksBoard } from "@/components/future-tasks-board";

export const dynamic = "force-dynamic";

export default async function FutureTasksPage() {
  const blueprint = await getCurrentBlueprint();
  const today = futureTasksToday();
  const buildings = await getBuildings();
  let tasks: Awaited<ReturnType<typeof listTasks>> = [];
  if (blueprint) {
    try {
      tasks = await listTasks(await supabaseServer(), blueprint.id);
    } catch (e) {
      console.warn("future tasks load error", e);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 md:px-10">
      <h1 className="serif-h text-[28px] leading-tight md:text-[36px]">
        Future Tasks
      </h1>
      <p className="text-ink-dim mt-1 text-[13px]">
        On its day, each task goes into Field Notes early in the morning and you
        get a Slack alert in #Alerts.
      </p>
      <FutureTasksBoard
        groups={groupTasks(tasks, today)}
        today={today}
        buildings={buildings.map((b) => ({ key: b.key, label: b.label }))}
      />
    </div>
  );
}
