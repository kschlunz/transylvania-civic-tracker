"use client";

import { useMemo } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { features } from "@/lib/feature-flags";
import { schoolBondInvestigation } from "@/data/investigations/school-bond";
import type { TimelineEntry } from "@/data/investigations/school-bond";
import { useMeetings } from "@/lib/meetings-context";
import { getBudgetContext } from "@/lib/budget-context";
import BudgetContextBadge from "@/components/BudgetContextBadge";
import budgetJson from "@/data/budget-fy26.json";
import type { BudgetData } from "@/lib/budget-types";

if (!features.investigations) {
  // This runs at module level — if flag is off, the page will 404
}

const budget = budgetJson as BudgetData;
const inv = schoolBondInvestigation;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function TimelineItem({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const statusColor = entry.status === "confirmed"
    ? "bg-primary"
    : entry.status === "gap"
      ? "bg-error/60"
      : "bg-outline-variant";

  return (
    <div className={`relative pl-10 md:pl-14 ${isLast ? "" : "pb-10 md:pb-14"}`}>
      {/* Vertical line */}
      {!isLast && (
        <div className="absolute left-[11px] md:left-[15px] top-6 bottom-0 w-px bg-outline-variant/30" />
      )}
      {/* Dot */}
      <div className={`absolute left-0 md:left-1 top-1.5 w-[23px] h-[23px] md:w-[29px] md:h-[29px] rounded-full ${statusColor} ring-4 ring-surface flex items-center justify-center`}>
        {entry.status === "gap" && (
          <span className="material-symbols-outlined text-white text-[12px] md:text-[14px]">help_outline</span>
        )}
        {entry.status === "confirmed" && (
          <span className="material-symbols-outlined text-white text-[12px] md:text-[14px]">check</span>
        )}
        {entry.status === "question" && (
          <span className="material-symbols-outlined text-white text-[12px] md:text-[14px]">question_mark</span>
        )}
      </div>

      {/* Content */}
      <div>
        <span className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant">
          {formatDate(entry.date)}
        </span>
        <h3 className="font-headline text-xl md:text-2xl font-bold text-primary mt-1 mb-2">{entry.title}</h3>
        <p className="text-on-surface-variant text-sm md:text-base leading-relaxed">{entry.description}</p>

        {/* Source */}
        {(entry.sourceUrl || entry.sourceMeetingId || entry.sourceLabel) && (
          <div className="mt-3">
            {entry.sourceMeetingId ? (
              <Link
                href={`/meetings/${entry.sourceMeetingId}`}
                className="inline-flex items-center gap-1 text-[10px] font-label font-bold uppercase tracking-widest text-secondary hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">description</span>
                View meeting record
              </Link>
            ) : entry.sourceUrl ? (
              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-label font-bold uppercase tracking-widest text-secondary hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                {entry.sourceLabel || "View source"}
              </a>
            ) : entry.sourceLabel ? (
              <span className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant">
                Source: {entry.sourceLabel}
              </span>
            ) : null}
          </div>
        )}

        {/* Vote detail */}
        {entry.voteDetail && (
          <div className="mt-3 bg-secondary-fixed/30 px-4 py-2.5 rounded text-sm italic text-on-surface-variant">
            {entry.voteDetail}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SchoolBondInvestigation() {
  if (!features.investigations) notFound();

  const { meetings } = useMeetings();

  // Find related meetings by keyword search
  const relatedMeetings = useMemo(() => {
    const keywords = /school bond|school construction|bond sale|bond referendum|school facilit|school capital|TCS.*bond|bond.*school/i;
    return meetings
      .filter((m) => {
        if (keywords.test(m.tldr)) return true;
        for (const vote of m.keyVotes) {
          if (keywords.test(vote.description)) return true;
          if (vote.background && keywords.test(vote.background)) return true;
        }
        for (const activity of Object.values(m.commissionerActivity)) {
          for (const topic of activity.topics) {
            if (keywords.test(topic.text)) return true;
          }
        }
        return false;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [meetings]);

  // Budget context
  const k12Context = getBudgetContext("K-12 public school education");
  const debtContext = getBudgetContext("debt service");
  const leasesDept = budget.departments.find((d) => d.department === "Long Term Leases");

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-8">
        <Link href="/" className="hover:text-primary transition-colors">Home</Link>
        <span>/</span>
        <Link href="/investigations" className="hover:text-primary transition-colors">Investigations</Link>
        <span>/</span>
        <span className="text-primary">School Bond</span>
      </div>

      {/* Header */}
      <header className="mb-12 md:mb-16 border-b border-outline-variant/20 pb-10 md:pb-14">
        <div className="flex items-center gap-2 mb-4">
          <span className="bg-error/10 text-error px-3 py-1 rounded-full text-[10px] font-label font-bold uppercase tracking-widest">
            Investigation
          </span>
          <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-label font-bold uppercase tracking-widest">
            {inv.status === "in-progress" ? "In Progress" : "Published"}
          </span>
        </div>
        <h1 className="font-headline text-4xl md:text-6xl font-bold text-primary leading-tight mb-4">
          {inv.title}
        </h1>
        <p className="font-headline text-xl md:text-2xl text-on-surface-variant italic leading-relaxed mb-6">
          {inv.subtitle}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant">
          <span>Last updated: {formatFullDate(inv.lastUpdated)}</span>
          <span className="hidden md:inline">·</span>
          <span className="text-[10px]">Compiled from publicly available county meeting minutes, budget documents, and official records.</span>
        </div>
      </header>

      {/* Summary */}
      <section className="mb-12 md:mb-16">
        <p className="text-on-surface text-base md:text-lg leading-relaxed">
          {inv.summary}
        </p>
      </section>

      {/* Timeline */}
      <section className="mb-12 md:mb-16">
        <h2 className="font-headline text-3xl font-bold italic text-primary mb-8 flex items-center gap-3">
          <span className="w-8 h-px bg-primary" />
          Timeline
        </h2>
        <div>
          {inv.timeline.map((entry, i) => (
            <TimelineItem key={entry.date + i} entry={entry} isLast={i === inv.timeline.length - 1} />
          ))}
        </div>
      </section>

      {/* Budget Context */}
      <section className="mb-12 md:mb-16">
        <h2 className="font-headline text-3xl font-bold italic text-primary mb-8 flex items-center gap-3">
          <span className="w-8 h-px bg-primary" />
          Budget Context
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {k12Context && (
            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-secondary text-lg">school</span>
                <span className="font-headline text-lg font-bold text-primary">{k12Context.department}</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(k12Context.fy26Total)}</p>
              <p className={`text-sm font-bold ${k12Context.percentChange >= 0 ? "text-error" : "text-secondary"}`}>
                {k12Context.percentChange >= 0 ? "+" : ""}{k12Context.percentChange.toFixed(1)}% vs FY25
              </p>
              {k12Context.contextSentence && (
                <p className="text-xs text-secondary italic mt-2">{k12Context.contextSentence}</p>
              )}
              <Link href={k12Context.budgetUrl} className="inline-flex items-center gap-1 text-[10px] font-label font-bold uppercase tracking-widest text-primary mt-3 hover:underline">
                Explore K-12 budget <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
              </Link>
            </div>
          )}

          {leasesDept && (
            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-secondary text-lg">receipt_long</span>
                <span className="font-headline text-lg font-bold text-primary">Long Term Leases</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(leasesDept.totalsByYear.fy26Projection)}</p>
              <p className={`text-sm font-bold ${leasesDept.percentChange >= 0 ? "text-error" : "text-secondary"}`}>
                {leasesDept.percentChange >= 0 ? "+" : ""}{leasesDept.percentChange.toFixed(1)}% vs FY25
              </p>
              <p className="text-xs text-secondary italic mt-2">
                Debt service payments jumped 878% year-over-year, reflecting new bond obligations.
              </p>
              <Link href={`/budget?dept=${encodeURIComponent("Long Term Leases")}`} className="inline-flex items-center gap-1 text-[10px] font-label font-bold uppercase tracking-widest text-primary mt-3 hover:underline">
                Explore debt service <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
              </Link>
            </div>
          )}

          {debtContext && (
            <BudgetContextBadge context={debtContext} />
          )}
        </div>
      </section>

      {/* Open Questions */}
      <section className="mb-12 md:mb-16">
        <h2 className="font-headline text-3xl font-bold italic text-primary mb-8 flex items-center gap-3">
          <span className="w-8 h-px bg-primary" />
          Accountability Gaps
        </h2>
        <p className="text-on-surface-variant text-sm mb-6">
          These are open questions this investigation aims to answer. They are presented as questions — not conclusions — in the interest of civic transparency.
        </p>
        <div className="space-y-4">
          {inv.openQuestions.map((question, i) => (
            <div key={i} className="flex items-start gap-4 bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5">
              <span className="bg-error/10 text-error w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-headline font-bold text-sm">
                {i + 1}
              </span>
              <p className="text-on-surface text-sm md:text-base leading-relaxed">{question}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Related Meetings */}
      {relatedMeetings.length > 0 && (
        <section className="mb-12 md:mb-16">
          <h2 className="font-headline text-3xl font-bold italic text-primary mb-8 flex items-center gap-3">
            <span className="w-8 h-px bg-primary" />
            Related Meeting Records
          </h2>
          <div className="space-y-3">
            {relatedMeetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/meetings/${meeting.id}`}
                className="flex items-start gap-4 bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5 hover:shadow-md transition-all group"
              >
                <span className="material-symbols-outlined text-secondary text-lg shrink-0 mt-0.5">event</span>
                <div className="flex-1 min-w-0">
                  <p className="font-headline text-lg font-bold text-primary group-hover:underline">
                    {formatFullDate(meeting.date)}
                  </p>
                  <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{meeting.tldr}</p>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-sm shrink-0 mt-1">chevron_right</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Source Documents */}
      <section className="mb-12 md:mb-16">
        <h2 className="font-headline text-3xl font-bold italic text-primary mb-8 flex items-center gap-3">
          <span className="w-8 h-px bg-primary" />
          Sources & Methodology
        </h2>
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-lg p-6 md:p-8 space-y-4 text-sm text-on-surface-variant leading-relaxed">
          <p>
            This investigation is compiled from publicly available sources including:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <a href="https://www.transylvaniacounty.org/meetings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Transylvania County Board of Commissioners meeting minutes
              </a>
            </li>
            <li>
              FY2025-2026 Recommended Budget (Expense Full Report)
              {" · "}
              <Link href="/budget" className="text-primary hover:underline">View in Budget Explorer</Link>
            </li>
            <li>North Carolina State Board of Elections — 2018 bond referendum results</li>
            <li>Federal Reserve Economic Data (FRED) — municipal bond yield historical data</li>
          </ul>
          <p className="pt-2 border-t border-outline-variant/20">
            All data on Civic Ledger is extracted from official county records using AI-assisted processing and reviewed by volunteers.
            This investigation presents facts and open questions — not conclusions or accusations. For the official record, refer to the
            county&apos;s published documents.
            {" "}
            <Link href="/methodology" className="text-primary hover:underline">Learn about our methodology</Link>.
          </p>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="border-t border-outline-variant/20 pt-8 text-center">
        <p className="text-on-surface-variant text-sm mb-4">
          Have information about the school bond timeline?
        </p>
        <a
          href="mailto:tips@civicledger.org?subject=School%20Bond%20Investigation"
          className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-lg font-label font-bold text-sm hover:bg-primary-container transition-colors"
        >
          <span className="material-symbols-outlined text-sm">mail</span>
          Share a tip
        </a>
      </div>
    </div>
  );
}
