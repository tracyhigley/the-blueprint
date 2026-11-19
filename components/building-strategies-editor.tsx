"use client";
// Settings → Buildings: the optional strategy groups for one building. A
// building with none looks and behaves exactly as before. Saves on its own
// button so it never touches the building names above.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveBuildingStrategies } from "@/lib/plan-actions";
import type { Strategy } from "@/lib/categories";

const LABEL_MAX = 60;

function deriveKey(label: string): string {
  return label
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 40);
}

export function BuildingStrategiesEditor({
  buildingKey,
  buildingLabel,
  initial,
}: {
  buildingKey: string;
  buildingLabel: string;
  initial: Strategy[];
}) {
  // A row keeps its key once saved, so renaming a strategy never orphans the
  // projects already filed under it. Only brand-new rows derive a key.
  const [rows, setRows] = useState<Strategy[]>(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    const seen = new Set<string>();
    const cleaned: Strategy[] = [];
    for (const r of rows) {
      const label = r.label.trim();
      if (!label) continue;
      let key = r.key || deriveKey(label) || "STRATEGY";
      while (seen.has(key)) key += "_2";
      seen.add(key);
      cleaned.push({ key, label });
    }
    setRows(cleaned);
    startTransition(async () => {
      try {
        await saveBuildingStrategies(buildingKey, cleaned);
        toast.success("Strategies saved.");
      } catch (e: any) {
        toast.error(e?.message ?? "Couldn't save the strategies.");
      }
    });
  }

  return (
    <div className="rounded-sm border border-paper-line bg-paper-panel/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass">
        {buildingLabel}
      </div>
      <div className="mt-2 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.label}
              onChange={(e) =>
                setRows(
                  rows.map((x, idx) =>
                    idx === i ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
              placeholder="Strategy name"
              maxLength={LABEL_MAX}
              className="min-w-0 flex-1 rounded-sm border border-paper-line bg-paper-bg/60 px-2 py-1 text-ink outline-none focus:border-brass"
            />
            <button
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              className="rounded-sm border border-paper-line px-2 py-1 font-mono text-[10px] tracking-wider text-ink-mute hover:border-rust hover:text-rust"
            >
              REMOVE
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          onClick={() => setRows([...rows, { key: "", label: "" }])}
          className="font-mono text-[10px] tracking-[0.2em] text-brass/80 hover:text-brass"
        >
          + ADD STRATEGY
        </button>
        <button
          onClick={save}
          disabled={pending}
          className="brass-button px-4 py-1.5 font-mono text-[10px] tracking-[0.24em] disabled:opacity-50"
        >
          SAVE
        </button>
      </div>
    </div>
  );
}
