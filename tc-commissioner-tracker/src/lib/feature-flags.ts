export const features = {
  investigations: process.env.NEXT_PUBLIC_FEATURE_INVESTIGATIONS === "true",
  // Default ON: only disabled when the env var is explicitly set to "false".
  budgetCycleTracker: process.env.NEXT_PUBLIC_FEATURE_BUDGET_CYCLE_TRACKER !== "false",
};
