export type BudgetCycleStage =
  | "planning"
  | "recommended"
  | "under_revision"
  | "adopted"
  | "archived";

export type BudgetDocumentStatus =
  | "planning"
  | "recommended"
  | "under_revision"
  | "adopted"
  | "superseded";

export interface BudgetCycle {
  id: string;
  fiscalYear: string;
  label: string;
  jurisdiction: string;
  currentStage: BudgetCycleStage;
  cycleStart: string | null;
  adoptionDate: string | null;
  fiscalYearStart: string | null;
  isActive: boolean;
}

export interface BudgetMilestone {
  id: string;
  cycleId: string;
  milestoneDate: string;
  title: string;
  description: string | null;
  stage: BudgetCycleStage | null;
  isPublicInput: boolean;
  isComplete: boolean;
  location: string | null;
  livestreamUrl: string | null;
  sortOrder: number;
}

export interface BudgetDocument {
  id: string;
  cycleId: string;
  title: string;
  docStatus: BudgetDocumentStatus;
  presentedDate: string | null;
  sourceUrl: string | null;
  storagePath: string | null;
  plainSummary: string | null;
  sortOrder: number;
}

/** Ordered stages displayed in the dashboard stepper (archived excluded). */
export const STEPPER_STAGES: BudgetCycleStage[] = [
  "planning",
  "recommended",
  "under_revision",
  "adopted",
];

/** Friendly display labels for the stepper. `under_revision` becomes "Workshops". */
export const STAGE_LABELS: Record<BudgetCycleStage, string> = {
  planning: "Planning",
  recommended: "Recommended",
  under_revision: "Workshops",
  adopted: "Adoption",
  archived: "Archived",
};

export const DOCUMENT_STATUS_LABELS: Record<BudgetDocumentStatus, string> = {
  planning: "Planning",
  recommended: "Recommended",
  under_revision: "Under Revision",
  adopted: "Adopted",
  superseded: "Superseded",
};

export interface ActiveCycleSnapshot {
  cycle: BudgetCycle;
  milestones: BudgetMilestone[];
  documents: BudgetDocument[];
  nextPublicInput: BudgetMilestone | null;
  nextMilestone: BudgetMilestone | null;
  daysUntilAdoption: number | null;
  currentStageIndex: number;
}
