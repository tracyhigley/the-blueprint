"use client";
// Downloads every project (all buildings, all stages) as a spreadsheet file.

import { useTransition } from "react";
import { toast } from "sonner";
import { exportProjectsCsv } from "@/lib/plan-actions";

export function DownloadProjectsButton() {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        const csv = await exportProjectsCsv();
        const url = URL.createObjectURL(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `projects-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        toast.error(e?.message ?? "Couldn't make the spreadsheet.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-sm border border-brass px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-brass transition hover:bg-brass/10 disabled:opacity-50"
    >
      {pending ? "Making spreadsheet…" : "Download spreadsheet"}
    </button>
  );
}
