import type { BudgetBreakdownData, BudgetBreakdownChartRow } from "@/lib/budget-breakdown-types";
import type { BudgetMilestone } from "@/lib/budget-cycle-types";

const TOP_N = 6;

interface DisplayRow {
  category: string;
  amount: number;
  percentage: number;
}

export interface BuildFy27EmailArgs {
  expenseBreakdown: BudgetBreakdownData | null;
  revenueBreakdown: BudgetBreakdownData | null;
  upcomingMilestones: BudgetMilestone[];
  siteUrl: string;
  publicHearingDate: string | null;
}

export interface BuiltEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

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

function formatShortDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Collapse a breakdown's rows into top-N + "All other" for email readability.
 */
function toDisplayRows(data: BudgetBreakdownData): DisplayRow[] {
  const sorted = [...data.rows].sort((a, b) => b.amount - a.amount);
  let displayed: BudgetBreakdownChartRow[];

  if (sorted.length <= TOP_N) {
    displayed = sorted;
  } else {
    const top = sorted.slice(0, TOP_N);
    const rest = sorted.slice(TOP_N);
    const restAmount = rest.reduce((s, r) => s + r.amount, 0);
    const restPct = rest.reduce((s, r) => s + r.percentage, 0);
    displayed = [
      ...top,
      { category: "All other", amount: restAmount, percentage: restPct },
    ];
  }

  return displayed.map((r) => ({
    category: r.category,
    amount: r.amount,
    percentage: r.percentage,
  }));
}

function buildTableRow(row: DisplayRow): string {
  const valueText = `${formatCompactCurrency(row.amount)} (${row.percentage.toFixed(1)}%)`;
  const fullValueText = `${formatFullCurrency(row.amount)} (${row.percentage.toFixed(1)}%)`;

  return `<tr>
    <td style="padding:8px 12px 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#1C2B1F;line-height:1.4;border-bottom:1px solid #e8e4df;vertical-align:top;">${escapeHtml(row.category)}</td>
    <td title="${escapeHtml(fullValueText)}" style="padding:8px 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;font-weight:bold;color:#1C2B1F;text-align:right;white-space:nowrap;border-bottom:1px solid #e8e4df;vertical-align:top;">${escapeHtml(valueText)}</td>
  </tr>`;
}

function buildChartHtml(title: string, subtitle: string, data: BudgetBreakdownData): string {
  const rows = toDisplayRows(data);
  return `<div style="margin:0 0 28px;">
  <h2 style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#1C2B1F;">${escapeHtml(title)}</h2>
  <p style="margin:0 0 14px;font-family:sans-serif;font-size:12px;color:#8B7355;text-transform:uppercase;letter-spacing:1.5px;font-weight:bold;">${escapeHtml(subtitle)}</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">
    ${rows.map(buildTableRow).join("\n")}
  </table>
  <p style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:11px;color:#8B7355;font-style:italic;line-height:1.5;">
    Source: FY27 Recommended Budget, presented May 26, 2026 · Recommended — not yet adopted.
  </p>
</div>`;
}

function buildMilestoneRow(m: BudgetMilestone, isPublicHearing: boolean): string {
  const dateLabel = formatShortDate(m.milestoneDate);
  const location = m.location ? ` · ${escapeHtml(m.location)}` : "";
  const inputBadge =
    m.isPublicInput || isPublicHearing
      ? ` <strong style="color:#2D5A3D;">← public input</strong>`
      : "";
  return `<tr>
    <td style="padding:6px 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#1C2B1F;line-height:1.5;border-bottom:1px solid #e8e4df;">
      <strong>${escapeHtml(dateLabel)}</strong> — ${escapeHtml(m.title)}${location}${inputBadge}
    </td>
  </tr>`;
}

function buildMilestonesSectionHtml(
  milestones: BudgetMilestone[],
  publicHearingDate: string | null,
): string {
  if (milestones.length === 0) return "";
  const rows = milestones
    .map((m) => buildMilestoneRow(m, publicHearingDate !== null && m.milestoneDate === publicHearingDate))
    .join("\n");
  return `<div style="margin:0 0 28px;">
  <h2 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#1C2B1F;">What&rsquo;s next</h2>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">
    ${rows}
  </table>
</div>`;
}

function buildChartText(title: string, data: BudgetBreakdownData): string {
  const rows = toDisplayRows(data);
  const lines = rows.map(
    (r) => `  ${r.category}: ${formatFullCurrency(r.amount)} (${r.percentage.toFixed(1)}%)`,
  );
  return `${title.toUpperCase()}\n${lines.join("\n")}\nSource: FY27 Recommended Budget, presented May 26, 2026 — Recommended, not yet adopted.\n`;
}

function buildMilestonesText(
  milestones: BudgetMilestone[],
  publicHearingDate: string | null,
): string {
  if (milestones.length === 0) return "";
  const lines = milestones.map((m) => {
    const isPH = publicHearingDate !== null && m.milestoneDate === publicHearingDate;
    const tag = m.isPublicInput || isPH ? " [public input]" : "";
    const loc = m.location ? ` · ${m.location}` : "";
    return `  • ${formatShortDate(m.milestoneDate)} — ${m.title}${loc}${tag}`;
  });
  return `WHAT'S NEXT\n${lines.join("\n")}\n`;
}

export function buildFy27BudgetEmail(args: BuildFy27EmailArgs): BuiltEmail {
  const { expenseBreakdown, revenueBreakdown, upcomingMilestones, siteUrl, publicHearingDate } = args;

  const subject = "Transylvania County's proposed budget FY27";
  const preheader = "The FY27 recommended budget is out — see where the money goes and when you can weigh in.";
  const cleanSiteUrl = siteUrl.replace(/\/$/, "");
  const budgetUrl = `${cleanSiteUrl}/budget/fy27`;

  const expenseChartHtml = expenseBreakdown
    ? buildChartHtml("Where the money goes", "FY27 recommended spending by function", expenseBreakdown)
    : "";
  const revenueChartHtml = revenueBreakdown
    ? buildChartHtml("Where the money comes from", "FY27 recommended revenue by source", revenueBreakdown)
    : "";
  const bottomLineHtml = `<div style="margin:0 0 28px;">
  <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1C2B1F;">
    <strong>The bottom line:</strong> the budget holds the tax rate flat and the increase to 1.47% largely by deferring a needed employee pay-plan update, funding the schools and college below inflation, and relying on capital financed in earlier years. The county also flags that state decisions on SNAP, Medicaid, and teacher pay could add over <strong>$2 million</strong> in costs mid-year &mdash; more than this year&rsquo;s entire increase.
  </p>
</div>`;
  const milestonesHtml = buildMilestonesSectionHtml(upcomingMilestones, publicHearingDate);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F2ED;font-family:Georgia,'Times New Roman',serif;color:#1C2B1F;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#F5F2ED;opacity:0;">${escapeHtml(preheader)}</div>
  <table align="center" width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:600px;max-width:600px;margin:0 auto;background-color:#F5F2ED;">
    <tr>
      <td style="padding:24px 20px;">
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-bottom:3px double #1C2B1F;">
          <tr>
            <td style="padding:0 0 14px;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-style:italic;color:#1C2B1F;">Civic Ledger</p>
              <p style="margin:4px 0 0;font-family:sans-serif;font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:2px;">
                Transylvania County · <span style="color:#D4A843;">Budget Special</span>
              </p>
            </td>
          </tr>
        </table>

        <!-- Heading + intro -->
        <div style="margin:24px 0 0;">
          <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:#1C2B1F;">The FY27 County Budget Is Out</h1>
          <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1C2B1F;">
            The county&rsquo;s Recommended Budget for fiscal year 2026&ndash;2027 is out. The headline for most residents: <strong>no property tax increase is recommended</strong> &mdash; the rate stays at <strong>$0.4105 per $100</strong> of property value.
          </p>
          <p style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1C2B1F;">
            Total recommended spending is <strong>$82,536,220, up 1.47%</strong> from last year. It fully funds the schools, Blue Ridge Community College, and fire departments with no service cuts. This is the Manager&rsquo;s recommendation, not the final budget.
          </p>
        </div>

        ${expenseChartHtml}
        ${revenueChartHtml}
        ${bottomLineHtml}
        ${milestonesHtml}

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:8px 0 28px;">
          <tr>
            <td align="center" style="padding:0;">
              <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td bgcolor="#1C2B1F" style="background-color:#1C2B1F;border-radius:4px;">
                    <a href="${budgetUrl}" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:13px;font-weight:bold;color:#F5F2ED;text-decoration:none;text-transform:uppercase;letter-spacing:2px;border-radius:4px;">See the full budget breakdown</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-top:1px solid #e8e4df;">
          <tr>
            <td style="padding:16px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#8B7355;line-height:1.6;">
              <p style="margin:0 0 8px;">
                <a href="${cleanSiteUrl}" style="color:#1C2B1F;font-weight:bold;text-decoration:none;">Civic Ledger</a> &mdash; Non-partisan civic accountability for Transylvania County.
              </p>
              <p style="margin:0 0 8px;font-size:11px;">
                You&rsquo;re receiving this because you subscribed at <a href="${cleanSiteUrl}" style="color:#8B7355;">civicledger.co</a>. To stop receiving these emails, reply with &ldquo;unsubscribe&rdquo; and we&rsquo;ll remove you.
              </p>
              <p style="margin:0;font-size:11px;">
                Budget figures sourced from the FY27 Recommended Budget Book. <a href="${cleanSiteUrl}/methodology" style="color:#8B7355;">How we process data</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const expenseChartText = expenseBreakdown ? buildChartText("Where the money goes", expenseBreakdown) : "";
  const revenueChartText = revenueBreakdown ? buildChartText("Where the money comes from", revenueBreakdown) : "";
  const bottomLineText = `THE BOTTOM LINE\nThe budget holds the tax rate flat and the increase to 1.47% largely by\ndeferring a needed employee pay-plan update, funding the schools and college\nbelow inflation, and relying on capital financed in earlier years. The county\nalso flags that state decisions on SNAP, Medicaid, and teacher pay could add\nover $2 million in costs mid-year — more than this year's entire increase.\n`;
  const milestonesText = buildMilestonesText(upcomingMilestones, publicHearingDate);

  const text = `CIVIC LEDGER — BUDGET SPECIAL
Transylvania County

THE FY27 COUNTY BUDGET IS OUT

The county's Recommended Budget for fiscal year 2026–2027 is out. The headline
for most residents: no property tax increase is recommended — the rate stays
at $0.4105 per $100 of property value.

Total recommended spending is $82,536,220, up 1.47% from last year. It fully
funds the schools, Blue Ridge Community College, and fire departments with no
service cuts. This is the Manager's recommendation, not the final budget.

${expenseChartText}
${revenueChartText}
${bottomLineText}
${milestonesText}
See the full budget breakdown: ${budgetUrl}

---
Civic Ledger — Non-partisan civic accountability for Transylvania County.
You're receiving this because you subscribed at ${cleanSiteUrl}.
To stop receiving these emails, reply with "unsubscribe" and we'll remove you.
`;

  return { subject, preheader, html, text };
}
