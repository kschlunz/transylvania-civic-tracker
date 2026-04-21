import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const ADMIN_USER_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
const TEST_EMAIL = "schlunzk@gmail.com";

interface DigestRequest {
  meetingId: string;
  testMode?: boolean;
}

interface MeetingData {
  id: string;
  date: string;
  type: string;
  tldr: string;
  duration: string;
  keyVotes: Array<{ description: string; result: string }>;
  followUps: Array<{ description: string; type: string }>;
}

interface FollowUpStats {
  open: number;
  overdue: number;
  resolved: number;
  ongoing: number;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildEmailHtml(meeting: MeetingData, stats: FollowUpStats, siteUrl: string): string {
  const meetingUrl = `${siteUrl}/meetings/${meeting.id}`;

  const votesHtml = meeting.keyVotes
    .slice(0, 5)
    .map(
      (v) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #e8e4df;font-size:12px;color:#2D5A3D;font-weight:bold;text-transform:uppercase;white-space:nowrap;vertical-align:top;padding-right:12px;font-family:sans-serif;">${v.result}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e8e4df;font-size:14px;color:#1C2B1F;line-height:1.4;">${v.description}</td>
        </tr>`
    )
    .join("");

  const newFollowUps = meeting.followUps || [];
  const commitmentHtml = newFollowUps.length > 0
    ? `<div style="margin-bottom:24px;">
        <h3 style="font-size:12px;color:#8B7355;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px;font-family:sans-serif;font-weight:bold;border-bottom:1px solid #D4A843;padding-bottom:8px;">
          New Commitments from This Meeting
        </h3>
        <ul style="margin:0;padding:0 0 0 16px;color:#3D3D3D;font-size:14px;line-height:1.6;">
          ${newFollowUps.slice(0, 5).map((fu) => `<li style="margin-bottom:6px;">${fu.description}</li>`).join("")}
        </ul>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F5F2ED;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <!-- Header -->
    <div style="border-bottom:3px double #1C2B1F;padding-bottom:16px;margin-bottom:24px;">
      <h1 style="margin:0;font-size:28px;color:#1C2B1F;font-style:italic;">Civic Ledger</h1>
      <p style="margin:4px 0 0;font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:2px;font-family:sans-serif;">Transylvania County · Non-Partisan Civic Tracker</p>
    </div>

    <!-- Meeting Summary -->
    <div style="margin-bottom:24px;">
      <p style="font-size:12px;color:#8B7355;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;font-family:sans-serif;font-weight:bold;">
        ${meeting.type.charAt(0).toUpperCase() + meeting.type.slice(1)} Meeting · ${meeting.duration || ""}
      </p>
      <h2 style="margin:0 0 12px;font-size:24px;color:#1C2B1F;">
        ${formatDate(meeting.date)}
      </h2>
      <p style="font-size:16px;color:#3D3D3D;line-height:1.6;margin:0;font-style:italic;">
        ${meeting.tldr}
      </p>
      <p style="margin:12px 0 0;">
        <a href="${meetingUrl}" style="color:#2D5A3D;font-size:13px;font-weight:bold;font-family:sans-serif;text-decoration:none;">Read full meeting details →</a>
      </p>
    </div>

    <!-- Key Votes -->
    ${meeting.keyVotes.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="font-size:12px;color:#8B7355;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px;font-family:sans-serif;font-weight:bold;border-bottom:1px solid #D4A843;padding-bottom:8px;">
        Key Votes
      </h3>
      <table style="width:100%;border-collapse:collapse;">
        ${votesHtml}
      </table>
    </div>` : ""}

    <!-- New Commitments -->
    ${commitmentHtml}

    <!-- Accountability Snapshot -->
    <div style="background:#ffffff;border:1px solid #e8e4df;border-radius:8px;padding:20px;margin-bottom:24px;">
      <h3 style="font-size:12px;color:#8B7355;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 16px;font-family:sans-serif;font-weight:bold;">
        Accountability Snapshot
      </h3>
      <table style="width:100%;"><tr>
        <td style="text-align:center;padding:4px 8px;">
          <div style="font-size:28px;color:#1C2B1F;font-weight:bold;">${stats.open}</div>
          <div style="font-size:10px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;font-family:sans-serif;">Open</div>
        </td>
        <td style="text-align:center;padding:4px 8px;border-left:1px solid #e8e4df;">
          <div style="font-size:28px;color:#B91C1C;font-weight:bold;">${stats.overdue}</div>
          <div style="font-size:10px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;font-family:sans-serif;">Overdue</div>
        </td>
        <td style="text-align:center;padding:4px 8px;border-left:1px solid #e8e4df;">
          <div style="font-size:28px;color:#2D5A3D;font-weight:bold;">${stats.resolved}</div>
          <div style="font-size:10px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;font-family:sans-serif;">Resolved</div>
        </td>
      </tr></table>
      <p style="margin:12px 0 0;text-align:center;">
        <a href="${siteUrl}/follow-ups" style="color:#2D5A3D;font-size:12px;font-weight:bold;font-family:sans-serif;text-decoration:none;">Track all commitments →</a>
      </p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${meetingUrl}" style="display:inline-block;background:#1C2B1F;color:#F5F2ED;padding:14px 32px;text-decoration:none;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;font-family:sans-serif;border-radius:4px;">
        View Full Meeting Record
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e8e4df;padding-top:16px;font-size:12px;color:#8B7355;line-height:1.6;">
      <p style="margin:0 0 8px;">
        <a href="${siteUrl}" style="color:#1C2B1F;font-weight:bold;text-decoration:none;">Civic Ledger</a> — Non-partisan civic accountability for Transylvania County.
      </p>
      <p style="margin:0;font-size:11px;">
        Data sourced from official county meeting minutes using AI-assisted processing.
        <a href="${siteUrl}/methodology" style="color:#8B7355;">How we process data</a> ·
        <a href="${siteUrl}/start-here" style="color:#8B7355;">About this project</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildEmailText(meeting: MeetingData, stats: FollowUpStats, siteUrl: string): string {
  const votes = meeting.keyVotes
    .slice(0, 5)
    .map((v) => `  [${v.result}] ${v.description}`)
    .join("\n");

  const commitments = (meeting.followUps || [])
    .slice(0, 5)
    .map((fu) => `  • ${fu.description}`)
    .join("\n");

  return `CIVIC LEDGER — What your commissioners did on ${formatShortDate(meeting.date)}
${meeting.type.charAt(0).toUpperCase() + meeting.type.slice(1)} Meeting · ${meeting.duration || ""}

${meeting.tldr}

${votes ? `KEY VOTES:\n${votes}\n` : ""}
${commitments ? `NEW COMMITMENTS:\n${commitments}\n` : ""}
ACCOUNTABILITY SNAPSHOT: ${stats.open} open · ${stats.overdue} overdue · ${stats.resolved} resolved

View full meeting: ${siteUrl}/meetings/${meeting.id}
Track commitments: ${siteUrl}/follow-ups

---
Civic Ledger — Non-partisan civic accountability for Transylvania County.
${siteUrl}`;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("x-admin-user-id");
  if (!authHeader || authHeader !== ADMIN_USER_ID) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let body: DigestRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.meetingId) {
    return Response.json({ error: "meetingId is required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch meeting data
  const { data: meetingRow, error: meetingError } = await supabase
    .from("meetings")
    .select("id, date, type, tldr, duration, key_votes, follow_ups")
    .eq("id", body.meetingId)
    .single();

  if (meetingError || !meetingRow) {
    return Response.json({ error: `Meeting not found: ${body.meetingId}` }, { status: 404 });
  }

  const meeting: MeetingData = {
    id: meetingRow.id as string,
    date: (meetingRow.date as string).slice(0, 10),
    type: (meetingRow.type as string) || "regular",
    tldr: (meetingRow.tldr as string) || "",
    duration: (meetingRow.duration as string) || "",
    keyVotes: (meetingRow.key_votes as MeetingData["keyVotes"]) || [],
    followUps: (meetingRow.follow_ups as MeetingData["followUps"]) || [],
  };

  // Fetch follow-up stats
  const { data: allFUs } = await supabase.from("follow_ups").select("status, type, date_raised");
  const now = Date.now();
  const THRESHOLDS: Record<string, number> = { action_item: 60, report: 90, long_term: 180, ongoing: Infinity };

  const fuStats: FollowUpStats = { open: 0, overdue: 0, resolved: 0, ongoing: 0 };
  for (const fu of allFUs || []) {
    const status = fu.status as string;
    const type = (fu.type as string) || "action_item";
    if (status === "resolved" || status === "dropped") {
      fuStats.resolved++;
    } else if (type === "ongoing") {
      fuStats.ongoing++;
    } else {
      fuStats.open++;
      const days = Math.floor((now - new Date((fu.date_raised as string) + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24));
      if (days > (THRESHOLDS[type] || 60)) fuStats.overdue++;
    }
  }

  // Determine recipients
  let emails: string[];
  if (body.testMode) {
    emails = [TEST_EMAIL];
    console.log(`Test mode: sending to ${TEST_EMAIL} only`);
  } else {
    const { data: subscribers, error: subError } = await supabase
      .from("subscribers")
      .select("email");
    if (subError) {
      return Response.json({ error: "Failed to fetch subscribers: " + subError.message }, { status: 500 });
    }
    emails = (subscribers || []).map((s) => s.email as string);
    if (emails.length === 0) {
      return Response.json({ sent: 0, message: "No subscribers found" });
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://civicledger.org";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const resend = new Resend(resendKey);
  const html = buildEmailHtml(meeting, fuStats, siteUrl);
  const text = buildEmailText(meeting, fuStats, siteUrl);
  const subject = `What your commissioners did on ${formatShortDate(meeting.date)}`;

  let sent = 0;
  const errors: string[] = [];

  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    try {
      await resend.batch.send(
        batch.map((to) => ({
          from: fromEmail,
          to,
          subject,
          html,
          text,
        }))
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
    testMode: body.testMode || false,
    errors: errors.length > 0 ? errors : undefined,
  });
}
