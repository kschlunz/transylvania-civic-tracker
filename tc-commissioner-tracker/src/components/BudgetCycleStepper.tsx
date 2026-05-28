import { STEPPER_STAGES, STAGE_LABELS, type BudgetCycleStage } from "@/lib/budget-cycle-types";

interface BudgetCycleStepperProps {
  currentStage: BudgetCycleStage;
  /** "compact" tightens spacing for the dashboard card; "full" used on the detail page. */
  variant?: "compact" | "full";
}

export default function BudgetCycleStepper({ currentStage, variant = "compact" }: BudgetCycleStepperProps) {
  const currentIndex = Math.max(0, STEPPER_STAGES.indexOf(currentStage));
  const dotSize = variant === "compact" ? "w-7 h-7 text-[12px]" : "w-9 h-9 text-sm";
  const labelSize = variant === "compact" ? "text-[10px]" : "text-xs";

  return (
    <ol className="flex flex-col md:flex-row md:items-start gap-3 md:gap-0">
      {STEPPER_STAGES.map((stage, i) => {
        const completed = i < currentIndex;
        const current = i === currentIndex;
        const future = i > currentIndex;
        const isLast = i === STEPPER_STAGES.length - 1;

        const dotClasses = completed
          ? "bg-primary text-on-primary border-primary"
          : current
            ? "bg-primary/15 text-primary border-primary"
            : "bg-surface-container-low text-on-surface-variant/60 border-outline-variant/40";

        const labelClasses = completed
          ? "text-on-surface-variant"
          : current
            ? "text-primary font-bold"
            : "text-on-surface-variant/60";

        const connectorClasses = completed ? "bg-primary/60" : "bg-outline-variant/30";

        return (
          <li
            key={stage}
            className="flex md:flex-1 items-center md:items-start gap-3 md:gap-0 md:flex-col"
          >
            <div className="flex items-center gap-3 md:gap-0 md:flex-col md:w-full">
              <div className="flex items-center md:w-full">
                <div
                  className={`${dotSize} rounded-full border flex items-center justify-center font-bold shrink-0 ${dotClasses}`}
                >
                  {completed ? (
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  ) : (
                    i + 1
                  )}
                </div>
                {!isLast && (
                  <div className={`hidden md:block flex-1 h-0.5 ${connectorClasses}`} />
                )}
              </div>
              <span
                className={`${labelSize} font-label font-bold uppercase tracking-wider md:mt-2 ${labelClasses}`}
              >
                {STAGE_LABELS[stage]}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
