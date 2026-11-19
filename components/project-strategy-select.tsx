"use client";
// Strategy dropdown on a Project Plan's title block. Only shown for buildings
// that have strategies set up in Settings → Buildings. Saves on change;
// "—" clears it back to "No strategy yet".

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProjectPatch } from "@/lib/plan-actions";
import type { Strategy } from "@/lib/categories";

export function ProjectStrategySelect({
  projectId,
  strategies,
  initial,
}: {
  projectId: string;
  strategies: Strategy[];
  initial: string | null;
}) {
  const [value, setValue] = useState<string | null>(initial);
  const [pending, startTransition] = useTransition();

  return (
    <label className="text-ink-mute flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase">
      Strategy
      <select
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => {
          const prev = value;
          const next = e.target.value === "" ? null : e.target.value;
          setValue(next);
          startTransition(async () => {
            try {
              await updateProjectPatch(projectId, { strategy: next });
            } catch (err: any) {
              setValue(prev);
              toast.error(err?.message ?? "Couldn't save the strategy.");
            }
          });
        }}
        className="border-paper-line bg-paper-bg text-ink hover:border-brass/40 focus:border-brass rounded-sm border px-2 py-1 font-mono text-[12px] tracking-normal outline-none disabled:opacity-50"
      >
        <option value="">—</option>
        {strategies.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
