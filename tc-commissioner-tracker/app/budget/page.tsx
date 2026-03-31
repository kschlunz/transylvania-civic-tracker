"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line,
  PieChart, Pie,
} from "recharts";
import budgetJson from "@/data/budget-fy26.json";
import {
  categorizeLineItem,
  SPENDING_CATEGORY_LABELS,
  SPENDING_CATEGORY_COLORS,
  FISCAL_YEAR_LABELS,
} from "@/lib/budget-types";
import type { BudgetData, DepartmentSummary, SpendingCategory } from "@/lib/budget-types";
import Pagination, { paginate } from "@/components/Pagination";

const budget = budgetJson as BudgetData;

const DEPT_COLORS = [
  "#2D5A3D", "#4A6741", "#8B4513", "#1B4F72", "#6B3A5D",
  "#4A6741", "#8B6914", "#2E4057", "#6B4226", "#3D5A80",
  "#7B2D26", "#2D6A4F", "#5C4033", "#1A535C", "#6D597A",
];

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatFullCurrency(val: number): string {
  return val.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Custom tooltip for bar chart
function DeptTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { department: string; fy26Projection: number; percentChange: number } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 shadow-md text-sm">
      <p className="font-bold text-primary">{d.department}</p>
      <p>FY26 Projected: {formatFullCurrency(d.fy26Projection)}</p>
      <p className={d.percentChange >= 0 ? "text-error" : "text-secondary"}>
        {d.percentChange >= 0 ? "+" : ""}{d.percentChange.toFixed(1)}% vs FY25 budget
      </p>
    </div>
  );
}

export default function BudgetExplorer() {
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [lineItemPage, setLineItemPage] = useState(1);

  const departments = budget.departments;
  const hasDepartments = departments.length > 0;

  // Sort by FY26 projection descending for overview
  const sortedDepts = useMemo(
    () => [...departments].sort((a, b) => b.totalsByYear.fy26Projection - a.totalsByYear.fy26Projection),
    [departments]
  );

  const grandTotal = useMemo(
    () => departments.reduce((s, d) => s + d.totalsByYear.fy26Projection, 0),
    [departments]
  );

  // Bar chart data
  const barData = useMemo(
    () => sortedDepts.map((d) => ({
      department: d.department,
      fy26Projection: d.totalsByYear.fy26Projection,
      percentChange: d.percentChange,
    })),
    [sortedDepts]
  );

  // Selected department detail
  const deptDetail: DepartmentSummary | null = useMemo(
    () => departments.find((d) => d.department === selectedDept) || null,
    [departments, selectedDept]
  );

  // Year-over-year trend data
  const trendData = useMemo(() => {
    const source = deptDetail ? [deptDetail] : departments;
    const keys = ["fy22", "fy23", "fy24", "fy25Actuals", "fy25Budget", "fy26Projection"] as const;
    return keys.map((key) => ({
      year: FISCAL_YEAR_LABELS[key],
      shortYear: key.replace("fy", "FY").replace("Actuals", " Act.").replace("Budget", " Bud.").replace("Projection", " Proj."),
      total: source.reduce((s, d) => s + d.totalsByYear[key], 0),
    }));
  }, [departments, deptDetail]);

  // Notable changes — top 10 by dollar and percent
  const notableChanges = useMemo(() => {
    const allItems = departments.flatMap((d) =>
      d.lineItems.map((item) => ({
        ...item,
        dollarChange: item.fy26Projection - item.fy25Budget,
      }))
    );

    const byDollar = [...allItems]
      .sort((a, b) => Math.abs(b.dollarChange) - Math.abs(a.dollarChange))
      .slice(0, 10);

    const byPercent = [...allItems]
      .filter((i) => Math.abs(i.fy25Budget) > 1000) // skip tiny baselines
      .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
      .slice(0, 10);

    return { byDollar, byPercent };
  }, [departments]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const totals: Record<SpendingCategory, number> = {
      salaries: 0, benefits: 0, contracts: 0, supplies: 0, capital: 0, other: 0,
    };
    for (const dept of departments) {
      for (const item of dept.lineItems) {
        const cat = categorizeLineItem(item.accountName);
        totals[cat] += item.fy26Projection;
      }
    }
    return Object.entries(totals)
      .map(([key, value]) => ({
        category: key as SpendingCategory,
        label: SPENDING_CATEGORY_LABELS[key as SpendingCategory],
        value,
        color: SPENDING_CATEGORY_COLORS[key as SpendingCategory],
      }))
      .sort((a, b) => b.value - a.value);
  }, [departments]);

  const categoryTotal = categoryBreakdown.reduce((s, c) => s + c.value, 0);

  return (
    <div className="px-4 md:px-8 py-8 md:py-12 max-w-6xl mx-auto">
      {/* Header */}
      <section className="mb-10 md:mb-16 border-b border-outline-variant/20 pb-8 md:pb-12">
        <span className="text-on-surface-variant font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
          Public Finance
        </span>
        <h1 className="font-headline text-4xl md:text-6xl lg:text-7xl font-bold text-primary leading-tight mb-4">
          Budget Explorer
        </h1>
        <p className="text-on-surface-variant text-sm md:text-base max-w-2xl leading-relaxed">
          {budget.fiscalYear} Recommended Budget for Transylvania County. All figures sourced from the
          county&apos;s official budget document.
          {budget.sourceUrl && (
            <>
              {" "}
              <a href={budget.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-bold hover:underline inline-flex items-center gap-1">
                View source PDF <span className="material-symbols-outlined text-sm">open_in_new</span>
              </a>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-on-surface-variant">
          {hasDepartments && (
            <span className="font-bold text-primary text-lg md:text-2xl font-headline">
              {formatFullCurrency(grandTotal)} Total Projected
            </span>
          )}
          <span>Last updated: {new Date(budget.lastUpdated + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
        </div>
      </section>

      {!hasDepartments ? (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-6xl text-outline-variant mb-4 block">database</span>
          <h2 className="font-headline text-2xl font-bold text-primary mb-2">No Budget Data Yet</h2>
          <p className="text-on-surface-variant max-w-md mx-auto">
            Run the budget parser to populate this page:
          </p>
          <code className="block mt-4 bg-surface-container-low px-4 py-3 rounded text-sm text-left max-w-lg mx-auto">
            pip install pdfplumber<br />
            python scripts/parse-budget.py src/data/budget-fy26.pdf
          </code>
        </div>
      ) : (
        <>
          {/* Department Drill-down or Overview */}
          {selectedDept && deptDetail ? (
            /* ========== DEPARTMENT DETAIL VIEW ========== */
            <section className="mb-12">
              <button
                onClick={() => { setSelectedDept(null); setLineItemPage(1); }}
                className="flex items-center gap-1 text-sm font-label font-bold text-primary hover:underline mb-6"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                All Departments
              </button>

              <h2 className="font-headline text-3xl font-bold text-primary mb-2">{deptDetail.department}</h2>
              <div className="flex flex-wrap gap-4 text-sm text-on-surface-variant mb-8">
                <span>FY26 Projected: <strong className="text-primary">{formatFullCurrency(deptDetail.totalsByYear.fy26Projection)}</strong></span>
                <span>FY25 Budget: {formatFullCurrency(deptDetail.totalsByYear.fy25Budget)}</span>
                <span className={deptDetail.percentChange >= 0 ? "text-error font-bold" : "text-secondary font-bold"}>
                  {deptDetail.percentChange >= 0 ? "+" : ""}{deptDetail.percentChange.toFixed(1)}%
                </span>
              </div>

              {/* Year-over-year trend for this dept */}
              <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-6 mb-8">
                <h3 className="font-headline text-lg font-bold text-primary mb-4">Spending Trend</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <XAxis dataKey="shortYear" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11 }} width={70} />
                      <Tooltip formatter={(v) => formatFullCurrency(Number(v))} />
                      <Line type="monotone" dataKey="total" stroke="#2D5A3D" strokeWidth={2} dot={{ r: 4 }} name="Total" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Line items table */}
              <div id="line-items" className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-primary/20 text-left">
                      <th className="py-3 pr-4 font-label font-bold text-xs uppercase tracking-wider text-on-surface-variant">Account</th>
                      <th className="py-3 pr-4 font-label font-bold text-xs uppercase tracking-wider text-on-surface-variant">Description</th>
                      <th className="py-3 pr-4 font-label font-bold text-xs uppercase tracking-wider text-on-surface-variant text-right">FY22</th>
                      <th className="py-3 pr-4 font-label font-bold text-xs uppercase tracking-wider text-on-surface-variant text-right">FY23</th>
                      <th className="py-3 pr-4 font-label font-bold text-xs uppercase tracking-wider text-on-surface-variant text-right">FY24</th>
                      <th className="py-3 pr-4 font-label font-bold text-xs uppercase tracking-wider text-on-surface-variant text-right">FY25 Bud.</th>
                      <th className="py-3 pr-4 font-label font-bold text-xs uppercase tracking-wider text-on-surface-variant text-right">FY26 Proj.</th>
                      <th className="py-3 font-label font-bold text-xs uppercase tracking-wider text-on-surface-variant text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(deptDetail.lineItems, lineItemPage).paginated.map((item, i) => {
                      const bigChange = Math.abs(item.percentChange) > 25;
                      return (
                        <tr
                          key={item.accountCode + i}
                          className={`border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors ${
                            bigChange ? (item.percentChange > 25 ? "bg-error/5" : "bg-secondary/5") : ""
                          }`}
                        >
                          <td className="py-2.5 pr-4 text-on-surface-variant text-xs font-mono whitespace-nowrap">{item.accountCode}</td>
                          <td className="py-2.5 pr-4 font-medium">{item.accountName}</td>
                          <td className="py-2.5 pr-4 text-right text-on-surface-variant tabular-nums">{formatFullCurrency(item.fy22)}</td>
                          <td className="py-2.5 pr-4 text-right text-on-surface-variant tabular-nums">{formatFullCurrency(item.fy23)}</td>
                          <td className="py-2.5 pr-4 text-right text-on-surface-variant tabular-nums">{formatFullCurrency(item.fy24)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{formatFullCurrency(item.fy25Budget)}</td>
                          <td className="py-2.5 pr-4 text-right font-bold tabular-nums">{formatFullCurrency(item.fy26Projection)}</td>
                          <td className={`py-2.5 text-right font-bold tabular-nums ${
                            item.percentChange > 25 ? "text-error" : item.percentChange < -25 ? "text-secondary" : "text-on-surface-variant"
                          }`}>
                            {item.percentChange >= 0 ? "+" : ""}{item.percentChange.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination
                  currentPage={lineItemPage}
                  totalPages={paginate(deptDetail.lineItems, lineItemPage).totalPages}
                  onPageChange={setLineItemPage}
                  scrollTargetId="line-items"
                />
              </div>
            </section>
          ) : (
            /* ========== DEPARTMENT OVERVIEW ========== */
            <section className="mb-12">
              <h2 className="font-headline text-3xl font-bold italic mb-8">
                Department Spending — FY26 Projected
              </h2>
              <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-4 md:p-6">
                <div style={{ height: Math.max(400, sortedDepts.length * 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 20 }}>
                      <XAxis type="number" tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="department"
                        width={160}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip content={<DeptTooltip />} />
                      <Bar
                        dataKey="fy26Projection"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(_data, index) => {
                          if (typeof index === "number" && barData[index]) {
                            setSelectedDept(barData[index].department);
                            setLineItemPage(1);
                          }
                        }}
                      >
                        {barData.map((_, i) => (
                          <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

          {/* Year-over-year aggregate (when no dept selected) */}
          {!selectedDept && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
              {/* Trend chart */}
              <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-6">
                <h3 className="font-headline text-xl font-bold text-primary mb-4">All Departments — Spending Trend</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <XAxis dataKey="shortYear" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11 }} width={70} />
                      <Tooltip formatter={(v) => formatFullCurrency(Number(v))} />
                      <Line type="monotone" dataKey="total" stroke="#2D5A3D" strokeWidth={2} dot={{ r: 4 }} name="Total Spending" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category breakdown */}
              <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-6">
                <h3 className="font-headline text-xl font-bold text-primary mb-4">Spending by Category</h3>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="h-48 w-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryBreakdown}
                          dataKey="value"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={75}
                          strokeWidth={2}
                          stroke="#F5F2ED"
                        >
                          {categoryBreakdown.map((entry) => (
                            <Cell key={entry.category} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatFullCurrency(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1">
                    {categoryBreakdown.map((cat) => (
                      <div key={cat.category} className="flex items-center gap-3 text-sm">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="flex-1">{cat.label}</span>
                        <span className="font-bold tabular-nums">{formatCurrency(cat.value)}</span>
                        <span className="text-on-surface-variant text-xs tabular-nums w-12 text-right">
                          {categoryTotal > 0 ? ((cat.value / categoryTotal) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Notable Changes */}
          {!selectedDept && (
            <section className="mb-12">
              <h2 className="font-headline text-3xl font-bold italic mb-8">Notable Changes</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Biggest dollar changes */}
                <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-6">
                  <h3 className="font-headline text-lg font-bold text-primary mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">attach_money</span>
                    Largest Dollar Changes
                  </h3>
                  <div className="space-y-3">
                    {notableChanges.byDollar.map((item, i) => {
                      const dollarChange = item.fy26Projection - item.fy25Budget;
                      return (
                        <div key={`d-${i}`} className="flex items-start gap-3 text-sm">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
                            dollarChange >= 0 ? "bg-error/10 text-error" : "bg-secondary/10 text-secondary"
                          }`}>
                            {dollarChange >= 0 ? "+" : ""}{formatCurrency(dollarChange)}
                          </span>
                          <div>
                            <p className="font-medium">{item.accountName}</p>
                            <p className="text-xs text-on-surface-variant">{item.department}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Biggest percent changes */}
                <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-6">
                  <h3 className="font-headline text-lg font-bold text-primary mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">trending_up</span>
                    Largest Percentage Changes
                  </h3>
                  <div className="space-y-3">
                    {notableChanges.byPercent.map((item, i) => (
                      <div key={`p-${i}`} className="flex items-start gap-3 text-sm">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
                          item.percentChange >= 0 ? "bg-error/10 text-error" : "bg-secondary/10 text-secondary"
                        }`}>
                          {item.percentChange >= 0 ? "+" : ""}{item.percentChange.toFixed(1)}%
                        </span>
                        <div>
                          <p className="font-medium">{item.accountName}</p>
                          <p className="text-xs text-on-surface-variant">
                            {item.department} · {formatFullCurrency(item.fy25Budget)} → {formatFullCurrency(item.fy26Projection)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Department quick links (when no dept selected) */}
          {!selectedDept && (
            <section>
              <h2 className="font-headline text-3xl font-bold italic mb-8">All Departments</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedDepts.map((dept, i) => (
                  <button
                    key={dept.department}
                    onClick={() => { setSelectedDept(dept.department); setLineItemPage(1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5 text-left hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-headline text-lg font-bold text-primary group-hover:underline">{dept.department}</h3>
                      <span className="material-symbols-outlined text-on-surface-variant text-sm mt-1">chevron_right</span>
                    </div>
                    <p className="font-bold text-xl tabular-nums mt-2">{formatFullCurrency(dept.totalsByYear.fy26Projection)}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs font-bold ${dept.percentChange >= 0 ? "text-error" : "text-secondary"}`}>
                        {dept.percentChange >= 0 ? "+" : ""}{dept.percentChange.toFixed(1)}%
                      </span>
                      <span className="text-xs text-on-surface-variant">{dept.lineItems.length} line items</span>
                    </div>
                    {/* Mini bar showing relative size */}
                    <div className="h-1.5 bg-surface-container-high rounded-full mt-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${grandTotal > 0 ? (dept.totalsByYear.fy26Projection / grandTotal) * 100 : 0}%`,
                          backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length],
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
