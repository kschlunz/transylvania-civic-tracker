import type { BudgetBreakdownData } from "@/lib/budget-breakdown-types";

const CHART_COLORS = [
  "#2D5A3D", // brand primary green
  "#4A6741", // medium green
  "#1B4F72", // blue
  "#6B3A5D", // purple
  "#8B4513", // brown
  "#94A3B8", // slate
];

function formatCompactCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatFullCurrency(val: number): string {
  return val.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface BudgetBreakdownChartProps {
  title: string;
  subtitle: string;
  data: BudgetBreakdownData;
}

export default function BudgetBreakdownChart({
  title,
  subtitle,
  data,
}: BudgetBreakdownChartProps) {
  const maxAmount = Math.max(...data.rows.map((r) => r.amount), 1);

  return (
    <figure className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5 md:p-6">
      <figcaption className="mb-6">
        <h3 className="font-headline text-xl md:text-2xl text-primary">{title}</h3>
        <p className="text-sm text-on-surface-variant mt-1">{subtitle}</p>
      </figcaption>

      <ul className="space-y-3 md:space-y-2.5">
        {data.rows.map((row, i) => {
          const color = CHART_COLORS[i % CHART_COLORS.length];
          const widthPct = (row.amount / maxAmount) * 100;
          return (
            <li
              key={row.category}
              className="grid grid-cols-1 md:grid-cols-[minmax(0,11rem)_1fr_auto] gap-1 md:gap-4 md:items-center"
            >
              <div className="text-[13px] md:text-sm font-medium text-on-surface md:text-right leading-tight">
                {row.category}
              </div>
              <div
                className="relative h-6 md:h-7 bg-surface-container-low rounded-sm overflow-hidden"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
              <div className="text-xs md:text-sm font-bold text-on-surface md:whitespace-nowrap tabular-nums">
                <span title={formatFullCurrency(row.amount)}>
                  {formatCompactCurrency(row.amount)}
                </span>{" "}
                <span className="font-normal text-on-surface-variant">
                  ({row.percentage.toFixed(1)}%)
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-[11px] font-label text-on-surface-variant/70 italic leading-relaxed">
        Source: FY27 Recommended Budget, presented May 26, 2026 · Recommended — not yet adopted.
      </p>
    </figure>
  );
}
