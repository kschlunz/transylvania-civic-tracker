"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { features } from "@/lib/feature-flags";
import { getActiveBudgetCycleAsync } from "@/lib/data";
import type { ActiveCycleSnapshot } from "@/lib/budget-cycle-types";
import BudgetCycleStepper from "./BudgetCycleStepper";

function formatPublicInputDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export default function BudgetCycleCard() {
  const [snapshot, setSnapshot] = useState<ActiveCycleSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!features.budgetCycleTracker) {
      setLoaded(true);
      return;
    }
    getActiveBudgetCycleAsync()
      .then((s) => setSnapshot(s))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!features.budgetCycleTracker) return null;
  if (!loaded) {
    return (
      <section className="bg-surface-container-low p-6 md:p-8 rounded-lg">
        <div className="h-3 w-24 bg-on-surface/10 rounded animate-pulse mb-3" />
        <div className="h-6 w-56 bg-on-surface/10 rounded animate-pulse mb-6" />
        <div className="h-7 w-full bg-on-surface/10 rounded animate-pulse" />
      </section>
    );
  }
  if (!snapshot) return null;

  const { cycle, nextPublicInput, daysUntilAdoption } = snapshot;

  return (
    <section className="bg-surface-container-low p-6 md:p-8 rounded-lg border border-outline-variant/20">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-label font-bold uppercase tracking-widest text-secondary mb-1">
            County Budget
          </p>
          <h2 className="font-headline text-2xl md:text-3xl text-primary">
            {cycle.label}
          </h2>
        </div>
        {daysUntilAdoption !== null && (
          <p className="text-xs font-label font-bold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
            {daysUntilAdoption} {daysUntilAdoption === 1 ? "day" : "days"} until adoption
          </p>
        )}
      </div>

      <div className="mb-6">
        <BudgetCycleStepper currentStage={cycle.currentStage} variant="compact" />
      </div>

      {nextPublicInput ? (
        <div className="border-t border-outline-variant/30 pt-5 space-y-2">
          <p className="text-[10px] font-label font-bold uppercase tracking-widest text-secondary">
            Next public input
          </p>
          <p className="font-headline text-lg md:text-xl text-primary">
            {nextPublicInput.title} — {formatPublicInputDate(nextPublicInput.milestoneDate)}
          </p>
          {nextPublicInput.location && (
            <p className="text-sm text-on-surface-variant">
              {nextPublicInput.location}
            </p>
          )}
          {nextPublicInput.livestreamUrl && (
            <a
              href={nextPublicInput.livestreamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-label font-bold uppercase tracking-wider text-primary hover:opacity-70 transition-opacity"
            >
              <span className="material-symbols-outlined text-sm">live_tv</span>
              Watch online
            </a>
          )}
        </div>
      ) : (
        <div className="border-t border-outline-variant/30 pt-5">
          <p className="text-sm text-on-surface-variant italic">
            No upcoming public-input opportunities scheduled.
          </p>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-outline-variant/20">
        <Link
          href={`/budget/${cycle.fiscalYear.toLowerCase()}`}
          className="inline-flex items-center gap-1 text-xs font-label font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
        >
          See the {cycle.fiscalYear} budget process
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
    </section>
  );
}
