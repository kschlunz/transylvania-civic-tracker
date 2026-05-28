import type { BudgetMilestone } from "@/lib/budget-cycle-types";

interface BudgetCycleTimelineProps {
  milestones: BudgetMilestone[];
}

function formatMilestoneDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BudgetCycleTimeline({ milestones }: BudgetCycleTimelineProps) {
  if (milestones.length === 0) {
    return <p className="text-on-surface-variant text-sm italic">No milestones recorded.</p>;
  }

  return (
    <ol className="relative space-y-6 before:absolute before:left-3 md:before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-outline-variant/30">
      {milestones.map((m) => {
        const completed = m.isComplete;
        const isPublic = m.isPublicInput;

        const dotClasses = completed
          ? "bg-primary border-primary text-on-primary"
          : isPublic
            ? "bg-secondary-fixed border-secondary text-on-secondary-fixed"
            : "bg-surface-container-low border-outline-variant/40 text-on-surface-variant";

        const titleClasses = completed
          ? "text-on-surface-variant"
          : isPublic
            ? "text-primary"
            : "text-on-surface";

        return (
          <li key={m.id} className="relative pl-10 md:pl-14">
            <div
              className={`absolute left-0 top-1 w-6 h-6 md:w-8 md:h-8 rounded-full border-2 flex items-center justify-center ${dotClasses}`}
            >
              {completed ? (
                <span className="material-symbols-outlined text-[14px] md:text-[18px]">check</span>
              ) : isPublic ? (
                <span className="material-symbols-outlined text-[14px] md:text-[18px]">campaign</span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-current opacity-40" />
              )}
            </div>

            <div className="flex flex-col md:flex-row md:items-baseline md:gap-3 mb-1">
              <span className="text-[11px] font-label font-bold uppercase tracking-widest text-secondary">
                {formatMilestoneDate(m.milestoneDate)}
              </span>
              {isPublic && !completed && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary text-on-secondary rounded-full text-[9px] font-bold uppercase tracking-tighter w-fit">
                  <span className="material-symbols-outlined text-[12px]">campaign</span>
                  Public input opportunity
                </span>
              )}
            </div>

            <h3 className={`font-headline text-lg md:text-xl mb-1 ${titleClasses}`}>{m.title}</h3>

            {m.description && (
              <p className="text-sm text-on-surface-variant leading-relaxed mb-2">
                {m.description}
              </p>
            )}

            {m.location && (
              <p className="text-xs text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">location_on</span>
                {m.location}
              </p>
            )}

            {m.livestreamUrl && (
              <a
                href={m.livestreamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs font-label font-bold uppercase tracking-wider text-primary hover:opacity-70 transition-opacity"
              >
                <span className="material-symbols-outlined text-sm">live_tv</span>
                Watch online
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}
