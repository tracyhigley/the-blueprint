"use client";
// One day on the 10-Day Plan. A normal day has three slots: one Press project
// and two projects from any buildings (3 hours each section). Two buttons turn
// the day into "No Project Work Today" or "Maintenance Tasks Only Today".
// Each slot has a "worked on it" check; a project that's been marked Complete
// shows struck through wherever it was picked.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTenDayPlanDay } from "@/lib/plan-actions";
import {
  emptyDay,
  formatPlanDate,
  type PlanDay,
  type PlanDayMode,
  type PlanSlot,
} from "@/lib/ten-day-plan";

export type PlanProject = {
  id: string;
  title: string;
  buildingLabel: string;
  buildingColor?: string;
  complete: boolean;
  planning: boolean;
  priority: number | null;
  daysToBuild: number | null;
};

export type MaintGroup = {
  label: string;
  color?: string;
  tasks: { id: string; title: string; minutes: number | null }[];
};

type SlotKey = "press" | 0 | 1;

function SlotRow({
  slot,
  choices,
  projectById,
  dayNumber,
  onPick,
  onToggleWorked,
  onClear,
  disabled,
}: {
  slot: PlanSlot | null;
  choices: PlanProject[];
  projectById: Map<string, PlanProject>;
  /** "Day 2 of 5" — which day of the build this slot is, when known. */
  dayNumber: { n: number; of: number | null } | null;
  onPick: (projectId: string) => void;
  onToggleWorked: () => void;
  onClear: () => void;
  disabled: boolean;
}) {
  if (!slot) {
    return (
      <select
        value=""
        disabled={disabled}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="w-full max-w-md rounded-sm border border-paper-line bg-paper-bg/60 px-3.5 py-2.5 text-[16px] text-ink outline-none transition focus:border-brass disabled:opacity-50"
      >
        <option value="">— choose a project —</option>
        {choices.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.priority ? ` (Priority ${p.priority})` : ""}
            {p.planning ? " · planning" : ""}
            {p.buildingLabel && choices.some((c) => c.buildingLabel !== p.buildingLabel)
              ? ` — ${p.buildingLabel}`
              : ""}
          </option>
        ))}
      </select>
    );
  }

  const project = projectById.get(slot.projectId);
  const color = project?.buildingColor ?? "#b5853a";
  return (
    <div
      className="flex items-start gap-3 rounded-sm border-l-[5px] bg-paper-bg/20 px-3.5 py-2.5"
      style={{ borderLeftColor: color }}
    >
      <input
        type="checkbox"
        checked={slot.worked}
        disabled={disabled}
        onChange={onToggleWorked}
        aria-label="Worked on it"
        className="mt-1 h-5 w-5 shrink-0 accent-[#b5853a]"
      />
      <div className="min-w-0 flex-1">
        <div
          className={
            "text-[16px] " +
            (project?.complete ? "text-ink-mute line-through" : "text-ink")
          }
        >
          {project?.title ?? "(project no longer exists)"}
        </div>
        <div className="mt-0.5 text-[13px] text-ink-mute">
          {project?.buildingLabel}
          {dayNumber
            ? ` · Day ${dayNumber.n}${dayNumber.of ? ` of ${dayNumber.of}` : ""}`
            : ""}
          {project?.planning ? " · planning" : ""}
          {project?.complete ? " · finished" : ""}
          {slot.worked ? " · worked on it" : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        aria-label="Remove this project from the day"
        className="shrink-0 px-1 text-[18px] leading-none text-ink-mute hover:text-ink disabled:opacity-50"
      >
        ×
      </button>
    </div>
  );
}

export function TenDayPlanDay({
  date,
  isToday,
  initialDay,
  pressChoices,
  otherChoices,
  projects,
  dayNumbers,
  maintGroups,
}: {
  date: string;
  isToday: boolean;
  initialDay: PlanDay | null;
  pressChoices: PlanProject[];
  otherChoices: PlanProject[];
  projects: PlanProject[];
  dayNumbers: Record<string, { projectId: string; n: number }>;
  maintGroups: MaintGroup[];
}) {
  const [day, setDay] = useState<PlanDay>(initialDay ?? emptyDay());
  const [pending, startTransition] = useTransition();
  const projectById = new Map(projects.map((p) => [p.id, p]));

  function save(next: PlanDay) {
    const prev = day;
    setDay(next);
    startTransition(async () => {
      try {
        await saveTenDayPlanDay(date, next);
      } catch (e: any) {
        setDay(prev);
        toast.error(e?.message ?? "Couldn't save that.");
      }
    });
  }

  function toggleMode(mode: PlanDayMode) {
    save({ ...day, mode: day.mode === mode ? null : mode });
  }

  function getSlot(key: SlotKey): PlanSlot | null {
    return key === "press" ? day.press : day.others[key];
  }

  function setSlot(key: SlotKey, slot: PlanSlot | null) {
    if (key === "press") save({ ...day, press: slot });
    else {
      const others = [...day.others];
      others[key] = slot;
      save({ ...day, others });
    }
  }

  function renderSlot(key: SlotKey, choices: PlanProject[]) {
    const slot = getSlot(key);
    const dn = dayNumbers[String(key)];
    const project = slot ? projectById.get(slot.projectId) : null;
    return (
      <SlotRow
        key={String(key)}
        slot={slot}
        choices={choices}
        projectById={projectById}
        dayNumber={
          slot && dn && dn.projectId === slot.projectId
            ? { n: dn.n, of: project?.daysToBuild ?? null }
            : null
        }
        onPick={(projectId) => setSlot(key, { projectId, worked: false })}
        onToggleWorked={() => slot && setSlot(key, { ...slot, worked: !slot.worked })}
        onClear={() => setSlot(key, null)}
        disabled={pending}
      />
    );
  }

  const modeButton = (mode: PlanDayMode, label: string) => (
    <button
      type="button"
      onClick={() => toggleMode(mode)}
      disabled={pending}
      aria-pressed={day.mode === mode}
      className={
        "rounded-sm border px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.12em] transition disabled:opacity-50 " +
        (day.mode === mode
          ? "border-brass bg-brass/15 text-brass"
          : "border-paper-line text-ink-mute hover:text-ink")
      }
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 bg-paper-panel/40 px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="serif-h text-[22px] text-ink">
          {formatPlanDate(date)}
          {isToday && (
            <span className="ml-3 rounded-sm bg-brass/20 px-2 py-0.5 align-middle font-mono text-[11px] uppercase tracking-[0.14em] text-brass">
              Today
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {modeButton("none", "No Project Work Today")}
          {modeButton("maint", "Maintenance Tasks Only Today")}
        </div>
      </div>

      {day.mode === "none" && (
        <p className="text-[15px] text-ink-mute">No project work today.</p>
      )}

      {day.mode === "maint" && (
        <div>
          <p className="text-[15px] text-ink-dim">Maintenance tasks only today.</p>
          {maintGroups.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[14px] text-ink-mute">
                Show open maint tasks (
                {maintGroups.reduce((n, g) => n + g.tasks.length, 0)})
              </summary>
              <div className="mt-2 space-y-3">
                {maintGroups.map((g) => (
                  <div key={g.label}>
                    <div
                      className="font-mono text-[12px] uppercase tracking-[0.14em]"
                      style={{ color: g.color ?? "#b5853a" }}
                    >
                      {g.label}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {g.tasks.map((t) => (
                        <li key={t.id} className="text-[15px] text-ink-dim">
                          • {t.title}
                          {t.minutes ? (
                            <span className="ml-1.5 text-[13px] text-ink-mute">
                              ({t.minutes}m)
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <p className="mt-1 text-[14px] text-ink-mute">
              No open maint tasks right now.
            </p>
          )}
        </div>
      )}

      {!day.mode && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2.5">
            <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">
              Press project (3 hours)
            </div>
            {renderSlot("press", pressChoices)}
          </div>
          <div className="space-y-2.5">
            <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">
              Other buildings (3 hours)
            </div>
            {renderSlot(0, otherChoices)}
            {renderSlot(1, otherChoices)}
          </div>
        </div>
      )}
    </div>
  );
}
