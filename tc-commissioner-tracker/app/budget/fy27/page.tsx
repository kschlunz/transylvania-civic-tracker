import Link from "next/link";
import { getActiveBudgetCycleAsync } from "@/lib/data";
import { STAGE_LABELS } from "@/lib/budget-cycle-types";
import BudgetCycleStepper from "@/components/BudgetCycleStepper";
import BudgetCycleTimeline from "@/components/BudgetCycleTimeline";
import BudgetDocumentList from "@/components/BudgetDocumentList";

export const revalidate = 300;

function formatLongDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BudgetFy27Page() {
  const snapshot = await getActiveBudgetCycleAsync();

  if (!snapshot || snapshot.cycle.fiscalYear.toLowerCase() !== "fy27") {
    return (
      <div className="px-4 md:px-8 py-16 max-w-3xl mx-auto">
        <h1 className="font-headline text-3xl md:text-5xl text-primary mb-4">
          FY27 County Budget
        </h1>
        <p className="text-on-surface-variant text-base leading-relaxed">
          The FY27 budget cycle has not yet been recorded in our tracker.
          Check back closer to budget season.
        </p>
        <Link
          href="/budget"
          className="inline-flex items-center gap-1 mt-6 text-xs font-label font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Back to budget explorer
        </Link>
      </div>
    );
  }

  const { cycle, milestones, documents, nextPublicInput, daysUntilAdoption } = snapshot;

  return (
    <div className="px-4 md:px-8 py-8 md:py-12 max-w-4xl mx-auto">
      {/* Header */}
      <header className="mb-10 md:mb-12 border-b border-outline-variant/20 pb-8 md:pb-10">
        <span className="text-on-surface-variant font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
          Budget Process · {cycle.jurisdiction}
        </span>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
          <h1 className="font-headline text-4xl md:text-6xl font-bold text-primary leading-tight">
            {cycle.label}
          </h1>
          <span className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[11px] font-bold uppercase tracking-tighter w-fit">
            {STAGE_LABELS[cycle.currentStage]}
          </span>
        </div>
        <p className="text-on-surface-variant text-sm md:text-base max-w-2xl leading-relaxed">
          Follow the Transylvania County budget process for the {cycle.fiscalYear === "FY27" ? "2026–2027" : cycle.fiscalYear} fiscal year — from
          early planning through the public hearing and adoption.
        </p>
      </header>

      {/* Stepper */}
      <section className="mb-12">
        <BudgetCycleStepper currentStage={cycle.currentStage} variant="full" />
      </section>

      {/* Status callout */}
      {nextPublicInput && (
        <section className="mb-12">
          <div className="bg-secondary-fixed border-l-4 border-secondary rounded-r-lg p-5 md:p-6">
            <p className="text-[10px] font-label font-bold uppercase tracking-widest text-secondary mb-2">
              Next opportunity for public input
            </p>
            <h2 className="font-headline text-2xl md:text-3xl text-primary mb-2">
              {nextPublicInput.title}
            </h2>
            <p className="text-on-surface mb-1">{formatLongDate(nextPublicInput.milestoneDate)}</p>
            {nextPublicInput.location && (
              <p className="text-sm text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">location_on</span>
                {nextPublicInput.location}
              </p>
            )}
            {nextPublicInput.livestreamUrl && (
              <a
                href={nextPublicInput.livestreamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-xs font-label font-bold uppercase tracking-wider text-primary hover:opacity-70 transition-opacity"
              >
                <span className="material-symbols-outlined text-sm">live_tv</span>
                Watch online
              </a>
            )}
            {daysUntilAdoption !== null && (
              <p className="mt-3 text-xs font-label font-bold uppercase tracking-wider text-on-surface-variant">
                {daysUntilAdoption} {daysUntilAdoption === 1 ? "day" : "days"} until adoption
              </p>
            )}
          </div>
        </section>
      )}

      {/* Timeline */}
      <section className="mb-16">
        <h2 className="font-headline text-3xl text-primary mb-2">Process Timeline</h2>
        <p className="text-sm text-on-surface-variant mb-8 max-w-2xl">
          Every milestone in the {cycle.fiscalYear} budget cycle, drawn from the county&apos;s published budget calendar.
        </p>
        <BudgetCycleTimeline milestones={milestones} />
      </section>

      {/* Documents */}
      <section className="mb-16">
        <h2 className="font-headline text-3xl text-primary mb-2">Published Documents</h2>
        <p className="text-sm text-on-surface-variant mb-8 max-w-2xl">
          Each budget document is labeled with its status so you always know whether you&apos;re looking at a proposal or a final decision.
        </p>
        <BudgetDocumentList documents={documents} />
      </section>

      {/* Footer explanation */}
      <footer className="border-t border-outline-variant/20 pt-8 text-sm text-on-surface-variant leading-relaxed">
        <p className="mb-3">
          <strong className="text-on-surface">About document statuses:</strong>{" "}
          <span className="font-bold">Planning</span> documents are early framing.{" "}
          <span className="font-bold">Recommended</span> is the County Manager&apos;s proposal — not yet law.{" "}
          <span className="font-bold">Adopted</span> is the final budget passed by commissioners and in effect for the fiscal year.
        </p>
        <Link
          href="/budget"
          className="inline-flex items-center gap-1 text-xs font-label font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Back to budget explorer
        </Link>
      </footer>
    </div>
  );
}
