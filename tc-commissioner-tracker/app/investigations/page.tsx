"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { features } from "@/lib/feature-flags";
import { schoolBondInvestigation } from "@/data/investigations/school-bond";

const investigations = [schoolBondInvestigation];

export default function InvestigationsIndex() {
  if (!features.investigations) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <header className="mb-12 md:mb-16 border-b border-outline-variant/20 pb-8 md:pb-12">
        <span className="text-on-surface-variant font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
          Civic Accountability
        </span>
        <h1 className="font-headline text-4xl md:text-6xl font-bold text-primary leading-tight mb-4">
          Investigations
        </h1>
        <p className="text-on-surface-variant text-sm md:text-base max-w-2xl leading-relaxed">
          In-depth investigations into Transylvania County governance, compiled from
          official meeting minutes, budget documents, and public records. Every claim is sourced.
          Every question is asked in the interest of transparency.
        </p>
      </header>

      <div className="space-y-6">
        {investigations.map((inv) => (
          <Link
            key={inv.slug}
            href={`/investigations/${inv.slug}`}
            className="block bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-6 md:p-8 hover:shadow-lg transition-all group"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-error/10 text-error px-3 py-1 rounded-full text-[10px] font-label font-bold uppercase tracking-widest">
                Investigation
              </span>
              <span className={`px-3 py-1 rounded-full text-[10px] font-label font-bold uppercase tracking-widest ${
                inv.status === "in-progress"
                  ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                  : "bg-secondary-fixed text-on-secondary-fixed"
              }`}>
                {inv.status === "in-progress" ? "In Progress" : "Published"}
              </span>
            </div>
            <h2 className="font-headline text-2xl md:text-3xl font-bold text-primary group-hover:underline mb-2">
              {inv.title}
            </h2>
            <p className="font-headline text-lg text-on-surface-variant italic leading-relaxed mb-4">
              {inv.subtitle}
            </p>
            <div className="flex items-center gap-4 text-xs text-on-surface-variant">
              <span>{inv.timeline.length} timeline events</span>
              <span>·</span>
              <span>{inv.openQuestions.length} open questions</span>
              <span>·</span>
              <span>Updated {new Date(inv.lastUpdated + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
