"use client";
// Starts a fresh 10-day plan beginning today. The plan being replaced is kept
// as a one-line record under "Past plans", so nothing is lost.

import { useTransition } from "react";
import { toast } from "sonner";
import { startTenDayPlan } from "@/lib/plan-actions";

export function TenDayPlanStartButton({
  label,
  confirmFirst,
}: {
  label: string;
  confirmFirst?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (
      confirmFirst &&
      !window.confirm(
        "Start a new plan today? This one will be saved under Past plans.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await startTenDayPlan();
      } catch (e: any) {
        toast.error(e?.message ?? "Couldn't start the plan.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-sm border border-brass px-4 py-2.5 font-mono text-[13px] uppercase tracking-[0.14em] text-brass transition hover:bg-brass/10 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
