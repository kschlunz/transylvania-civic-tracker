export type BreakdownType = "expense_by_function" | "revenue_by_category";

export interface BudgetBreakdownRow {
  id: string;
  cycleId: string;
  breakdownType: BreakdownType;
  category: string;
  amount: number;
  sortOrder: number;
}

export interface BudgetBreakdownChartRow {
  category: string;
  amount: number;
  percentage: number;
}

export interface BudgetBreakdownData {
  rows: BudgetBreakdownChartRow[];
  total: number;
  breakdownType: BreakdownType;
}
