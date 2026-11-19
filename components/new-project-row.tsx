"use client";
// Inline "+ New idea" capture on a building page. New projects always
// start as ideas — resting, demanding nothing.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createProject } from "@/lib/plan-actions";

export function NewProjectRow({
  building,
  strategy,
}: {
  building: string;
  strategy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    const clean = title.trim();
    if (!clean) return;
    setTitle("");
    startTransition(async () => {
      try {
        await createProject(building, clean, "idea", strategy ?? null);
        toast.success("Idea saved — resting safely.");
      } catch (e: any) {
        setTitle(clean);
        toast.error(e?.message ?? "Couldn't save the idea.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-brass/40 px-3.5 py-1.5 text-[13px] text-brass/80 transition hover:border-brass hover:text-brass"
      >
        + New idea
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
        placeholder="Name the idea…"
        className="w-[220px] rounded-full border border-paper-line bg-paper-bg/60 px-3.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-mute/60 focus:border-brass"
      />
      <button
        onClick={add}
        disabled={pending || !title.trim()}
        className="brass-button px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] disabled:opacity-50"
      >
        ADD
      </button>
    </span>
  );
}
