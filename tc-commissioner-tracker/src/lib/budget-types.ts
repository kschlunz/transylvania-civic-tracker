export interface BudgetLineItem {
  department: string;
  accountCode: string;
  accountName: string;
  fy22: number;
  fy23: number;
  fy24: number;
  fy25Actuals: number;
  fy25Budget: number;
  fy26Projection: number;
  percentChange: number;
}

export interface DepartmentSummary {
  department: string;
  totalsByYear: {
    fy22: number;
    fy23: number;
    fy24: number;
    fy25Actuals: number;
    fy25Budget: number;
    fy26Projection: number;
  };
  percentChange: number;
  lineItems: BudgetLineItem[];
}

export interface BudgetContext {
  accountCode: string;
  department: string;
  accountName: string;
  dollarChange: number;
  percentChange: number;
  context: string; // plain-English "why this matters"
}

export interface BudgetData {
  lastUpdated: string;
  sourceUrl: string;
  fiscalYear: string;
  departments: DepartmentSummary[];
  notableChangesContext?: BudgetContext[];
}

/** Categorize a line item by account name pattern */
export type SpendingCategory = "salaries" | "benefits" | "contracts" | "supplies" | "capital" | "other";

const CATEGORY_PATTERNS: [RegExp, SpendingCategory][] = [
  [/SAL|WAGES|OVERTIME|LONGEVITY|STIPEND/i, "salaries"],
  [/INSUR|FICA|RETIRE|401|DENTAL|LIFE|HEALTH|VISION|WORKER.*COMP|UNEMPLOYMENT/i, "benefits"],
  [/CONTRACT|CONSULT|PROFESSIONAL|LEGAL|AUDIT|SERVICE/i, "contracts"],
  [/SUPPLY|SUPPLIES|OFFICE|POSTAGE|PRINT|FUEL|FOOD|UNIFORM|AMMUNITION|TRAINING/i, "supplies"],
  [/VEHIC|EQUIP|CAP|CAPITAL|MACHINERY|FURNITURE|COMPUTER|TECHNOLOGY|IMPROV/i, "capital"],
];

export function categorizeLineItem(accountName: string): SpendingCategory {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(accountName)) return category;
  }
  return "other";
}

export const SPENDING_CATEGORY_LABELS: Record<SpendingCategory, string> = {
  salaries: "Salaries & Wages",
  benefits: "Benefits",
  contracts: "Contracts & Services",
  supplies: "Supplies & Operations",
  capital: "Capital & Equipment",
  other: "Other",
};

export const SPENDING_CATEGORY_COLORS: Record<SpendingCategory, string> = {
  salaries: "#2D5A3D",
  benefits: "#4A6741",
  contracts: "#8B4513",
  supplies: "#1B4F72",
  capital: "#6B3A5D",
  other: "#94A3B8",
};

export const FISCAL_YEAR_LABELS: Record<string, string> = {
  fy22: "FY 2022",
  fy23: "FY 2023",
  fy24: "FY 2024",
  fy25Actuals: "FY 2025 (Actual)",
  fy25Budget: "FY 2025 (Budget)",
  fy26Projection: "FY 2026 (Projected)",
};
