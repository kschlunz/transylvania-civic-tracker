import { Resend } from "resend";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { buildFy27BudgetEmail } from "@/emails/fy27-budget-email";
import type {
  BudgetBreakdownData,
  BreakdownType,
  BudgetBreakdownChartRow,
} from "@/lib/budget-breakdown-types";
import type {
  BudgetCycle,
  BudgetMilestone,
  BudgetCycleStage,
} from "@/lib/budget-cycle-types";

const ADMIN_USER_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
const TEST_EMAIL_FALLBACK = "schlunzk@gmail.com";

interface SendBudgetEmailRequest {
  testMode?: boolean;
  to?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

function getServerSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

interface PreparedData {
  cycle: BudgetCycle | null;
  upcomingMilestones: BudgetMilestone[];
  expenseBreakdown: BudgetBreakdownData | null;
  revenueBreakdown: BudgetBreakdownData | null;
}

async function loadBreakdown(
  supabase: SupabaseClient,
  cycleId: string,
  breakdownType: BreakdownType,
): Promise<BudgetBreakdownData | null> {
  const { data, error } = await supabase
    .from("budget_breakdowns")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("breakdown_type", breakdownType)
    .order("sort_order", { ascending: true });
  if (error || !data || data.length === 0) return null;
  const rows = (data as AnyRow[]).map((r) => ({
    category: String(r.category),
    amount: Number(r.amount),
  }));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const chartRows: BudgetBreakdownChartRow[] = rows.map((r) => ({
    category: r.category,
    amount: r.amount,
    percentage: total > 0 ? (r.amount / total) * 100 : 0,
  }));
  return { rows: chartRows, total, breakdownType };
}

async function loadAllData(supabase: SupabaseClient): Promise<PreparedData> {
  const { data: cycleRowRaw } = await supabase
    .from("budget_cycles")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cycleRow = cycleRowRaw as AnyRow | null;
  if (!cycleRow) {
    return { cycle: null, upcomingMilestones: [], expenseBreakdown: null, revenueBreakdown: null };
  }

  const cycle: BudgetCycle = {
    id: String(cycleRow.id),
    fiscalYear: String(cycleRow.fiscal_year),
    label: String(cycleRow.label),
    jurisdiction: String(cycleRow.jurisdiction || "Transylvania County"),
    currentStage: cycleRow.current_stage as BudgetCycleStage,
    cycleStart: cycleRow.cycle_start ? String(cycleRow.cycle_start) : null,
    adoptionDate: cycleRow.adoption_date ? String(cycleRow.adoption_date) : null,
    fiscalYearStart: cycleRow.fiscal_year_start ? String(cycleRow.fiscal_year_start) : null,
    isActive: Boolean(cycleRow.is_active),
  };

  const today = new Date().toISOString().slice(0, 10);
  const [milestonesRes, expenseBreakdown, revenueBreakdown] = await Promise.all([
    supabase
      .from("budget_cycle_milestones")
      .select("*")
      .eq("cycle_id", cycle.id)
      .gte("milestone_date", today)
      .order("milestone_date", { ascending: true })
      .limit(4),
    loadBreakdown(supabase, cycle.id, "expense_by_function"),
    loadBreakdown(supabase, cycle.id, "revenue_by_category"),
  ]);

  const upcomingMilestones: BudgetMilestone[] = ((milestonesRes.data || []) as AnyRow[]).map(
    (m) => ({
      id: String(m.id),
      cycleId: String(m.cycle_id),
      milestoneDate: String(m.milestone_date).slice(0, 10),
      title: String(m.title),
      description: m.description ? String(m.description) : null,
      stage: (m.stage as BudgetCycleStage) || null,
      isPublicInput: Boolean(m.is_public_input),
      isComplete: Boolean(m.is_complete),
      location: m.location ? String(m.location) : null,
      livestreamUrl: m.livestream_url ? String(m.livestream_url) : null,
      sortOrder: Number(m.sort_order) || 0,
    }),
  );

  return { cycle, upcomingMilestones, expenseBreakdown, revenueBreakdown };
}

function checkAuth(request: NextRequest): Response | null {
  const authHeader = request.headers.get("x-admin-user-id");
  if (!ADMIN_USER_ID) {
    return Response.json({ error: "ADMIN_USER_ID not configured" }, { status: 500 });
  }
  if (!authHeader || authHeader !== ADMIN_USER_ID) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const supabase = getServerSupabase();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://civicledger.co";
  const data = await loadAllData(supabase);

  if (!data.cycle) {
    return Response.json(
      {
        error:
          "No active budget cycle found. Apply the budget_cycles + budget_breakdowns migrations and seed FY27 data first.",
      },
      { status: 400 },
    );
  }
  if (!data.expenseBreakdown && !data.revenueBreakdown) {
    return Response.json(
      {
        error:
          "No budget breakdowns found. Apply supabase/migrations/20260528_budget_breakdowns.sql first.",
      },
      { status: 400 },
    );
  }

  const email = buildFy27BudgetEmail({
    expenseBreakdown: data.expenseBreakdown,
    revenueBreakdown: data.revenueBreakdown,
    upcomingMilestones: data.upcomingMilestones,
    siteUrl,
    publicHearingDate: data.cycle.adoptionDate,
  });

  return Response.json(email);
}

export async function POST(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let body: SendBudgetEmailRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://civicledger.co";
  const data = await loadAllData(supabase);

  if (!data.cycle) {
    return Response.json(
      {
        error:
          "No active budget cycle found. Apply the budget_cycles + budget_breakdowns migrations and seed FY27 data first.",
      },
      { status: 400 },
    );
  }
  if (!data.expenseBreakdown && !data.revenueBreakdown) {
    return Response.json(
      {
        error:
          "No budget breakdowns found. Apply supabase/migrations/20260528_budget_breakdowns.sql first.",
      },
      { status: 400 },
    );
  }

  const email = buildFy27BudgetEmail({
    expenseBreakdown: data.expenseBreakdown,
    revenueBreakdown: data.revenueBreakdown,
    upcomingMilestones: data.upcomingMilestones,
    siteUrl,
    publicHearingDate: data.cycle.adoptionDate,
  });

  // Determine recipients
  let emails: string[];
  if (body.to && body.to.length > 0) {
    emails = body.to;
    console.log(`One-off send to ${emails.length} recipient(s): ${emails.join(", ")}`);
  } else if (body.testMode) {
    const testAddr = process.env.RESEND_TEST_EMAIL || TEST_EMAIL_FALLBACK;
    emails = [testAddr];
    console.log(`Test mode: sending to ${testAddr} only`);
  } else {
    const { data: subscribers, error: subError } = await supabase
      .from("subscribers")
      .select("email");
    if (subError) {
      return Response.json(
        { error: "Failed to fetch subscribers: " + subError.message },
        { status: 500 },
      );
    }
    emails = ((subscribers || []) as AnyRow[])
      .map((s) => String(s.email || ""))
      .filter(Boolean);
    if (emails.length === 0) {
      return Response.json({ sent: 0, message: "No subscribers found" });
    }
  }

  const rawFromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromEmail = rawFromEmail.includes("<") ? rawFromEmail : `Civic Ledger <${rawFromEmail}>`;
  const resend = new Resend(resendKey);

  let sent = 0;
  const errors: string[] = [];

  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    try {
      await resend.batch.send(
        batch.map((to) => ({
          from: fromEmail,
          to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })),
      );
      sent += batch.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Batch ${Math.floor(i / 50) + 1}: ${msg}`);
    }
  }

  return Response.json({
    sent,
    total: emails.length,
    subject: email.subject,
    testMode: body.testMode || false,
    errors: errors.length > 0 ? errors : undefined,
  });
}
