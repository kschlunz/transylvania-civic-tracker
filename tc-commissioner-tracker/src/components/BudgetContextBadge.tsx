"use client";

import { useState } from "react";
import Link from "next/link";
import type { BudgetContextResult } from "@/lib/budget-context";

function formatCompact(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export default function BudgetContextBadge({ context }: { context: BudgetContextResult }) {
  const [expanded, setExpanded] = useState(false);
  const up = context.percentChange > 1;
  const down = context.percentChange < -1;

  return (
    <>
      {/* Mobile: tap to expand */}
      <div className="md:hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setExpanded(!expanded); } }}
          className="flex items-center gap-1.5 mt-2 text-[10px] font-label font-bold text-secondary uppercase tracking-wider hover:text-primary transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[12px]">account_balance</span>
          Budget context
          <span className="material-symbols-outlined text-[12px] transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            expand_more
          </span>
        </div>
        {expanded && (
          <div className="mt-2 bg-secondary/5 border border-secondary/15 rounded-lg p-3 text-xs">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-bold text-on-surface">{context.department}</span>
              <span className="font-bold tabular-nums">{formatCompact(context.fy26Total)}</span>
              <span className={`font-bold ${up ? "text-error" : down ? "text-secondary" : "text-on-surface-variant"}`}>
                {up ? "▲" : down ? "▼" : "—"}{Math.abs(context.percentChange).toFixed(1)}%
              </span>
            </div>
            {context.contextSentence && (
              <p className="text-secondary italic leading-snug mb-2">{context.contextSentence}</p>
            )}
            <Link
              href={context.budgetUrl}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-primary font-bold hover:underline"
            >
              Explore department budget
              <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
            </Link>
          </div>
        )}
      </div>

      {/* Desktop: always visible */}
      <div className="hidden md:block mt-2 bg-secondary/5 border border-secondary/15 rounded-lg px-4 py-2.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-secondary text-sm shrink-0">account_balance</span>
          <span className="font-bold text-on-surface">{context.department}</span>
          <span className="font-bold tabular-nums">{formatCompact(context.fy26Total)}</span>
          <span className={`font-bold ${up ? "text-error" : down ? "text-secondary" : "text-on-surface-variant"}`}>
            {up ? "▲" : down ? "▼" : "—"}{Math.abs(context.percentChange).toFixed(1)}%
          </span>
          {context.contextSentence && (
            <span className="text-secondary italic flex-1 truncate">{context.contextSentence}</span>
          )}
          <Link
            href={context.budgetUrl}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary font-bold hover:underline shrink-0"
          >
            Explore
            <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
          </Link>
        </div>
      </div>
    </>
  );
}
