import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const ADMIN_USER_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID;

interface MeetingSummary {
  id: string;
  date: string;
  type: string;
  tldr: string;
  keyVotes: Array<{ description: string; result: string }>;
  followUpsCreated: number;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildEmailHtml(meeting: MeetingSummary, siteUrl: string): string {
  const meetingUrl = `${siteUrl}/meetings/${meeting.id}`;
  const votesHtml = meeting.keyVotes
    .slice(0, 5)
    .map(
      (v) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e8e4df;font-size:13px;color:#6B3A5D;font-weight:bold;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${v.result}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8e4df;font-size:14px;color:#1C2B1F;">${v.description}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F5F2ED;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <!-- Header -->
    <div style="border-bottom:3px double #1C2B1F;padding-bottom:16px;margin-bottom:24px;">
      <h1 style="margin:0;font-size:28px;color:#1C2B1F;font-style:italic;">Civic Ledger</h1>
      <p style="margin:4px 0 0;font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:2px;font-family:sans-serif;">Transylvania County Meeting Digest</p>
    </div>

    <!-- Meeting Summary -->
    <div style="margin-bottom:24px;">
      <p style="font-size:12px;color:#8B7355;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;font-family:sans-serif;font-weight:bold;">
        ${meeting.type.charAt(0).toUpperCase() + meeting.type.slice(1)} Meeting
      </p>
      <h2 style="margin:0 0 12px;font-size:24px;color:#1C2B1F;">
        ${formatDate(meeting.date)}
      </h2>
      <p style="font-size:16px;color:#3D3D3D;line-height:1.6;margin:0;font-style:italic;">
        ${meeting.tldr}
      </p>
    </div>

    <!-- Key Votes -->
    ${
      meeting.keyVotes.length > 0
        ? `
    <div style="margin-bottom:24px;">
      <h3 style="font-size:12px;color:#8B7355;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px;font-family:sans-serif;font-weight:bold;border-bottom:1px solid #D4A843;padding-bottom:8px;">
        Key Votes
      </h3>
      <table style="width:100%;border-collapse:collapse;">
        ${votesHtml}
      </table>
    </div>`
        : ""
    }

    <!-- Stats -->
    <div style="background:#ffffff;border:1px solid #e8e4df;border-radius:8px;padding:16px;margin-bottom:24px;">
      <table style="width:100%;"><tr>
        <td style="text-align:center;padding:8px;">
          <div style="font-size:28px;color:#1C2B1F;font-weight:bold;">${meeting.keyVotes.length}</div>
          <div style="font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;font-family:sans-serif;">Votes</div>
        </td>
        <td style="text-align:center;padding:8px;border-left:1px solid #e8e4df;">
          <div style="font-size:28px;color:#1C2B1F;font-weight:bold;">${meeting.followUpsCreated}</div>
          <div style="font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;font-family:sans-serif;">Follow-ups</div>
        </td>
      </tr></table>
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
        Data sourced from official county meeting minutes.
        <a href="${siteUrl}/methodology" style="color:#8B7355;">How we process data</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildEmailText(meeting: MeetingSummary, siteUrl: string): string {
  const votes = meeting.keyVotes
    .slice(0, 5)
    .map((v) => `  [${v.result}] ${v.description}`)
    .join("\n");

  return `CIVIC LEDGER — Meeting Digest
${meeting.type.charAt(0).toUpperCase() + meeting.type.slice(1)} Meeting: ${formatDate(meeting.date)}

${meeting.tldr}

${votes ? `KEY VOTES:\n${votes}\n` : ""}
${meeting.keyVotes.length} votes · ${meeting.followUpsCreated} follow-ups created

View full meeting: ${siteUrl}/meetings/${meeting.id}

---
Civic Ledger — Non-partisan civic accountability for Transylvania County.
${siteUrl}`;
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("x-admin-user-id");
  if (!authHeader || authHeader !== ADMIN_USER_ID) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let body: MeetingSummary;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || !body.date || !body.tldr) {
    return Response.json({ error: "Missing required fields: id, date, tldr" }, { status: 400 });
  }

  // Fetch subscribers
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: subscribers, error: subError } = await supabase
    .from("subscribers")
    .select("email");

  if (subError) {
    return Response.json({ error: "Failed to fetch subscribers: " + subError.message }, { status: 500 });
  }

  if (!subscribers || subscribers.length === 0) {
    return Response.json({ sent: 0, message: "No subscribers found" });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://civicledger.org";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "digest@civicledger.org";

  const resend = new Resend(resendKey);
  const html = buildEmailHtml(body, siteUrl);
  const text = buildEmailText(body, siteUrl);
  const subject = `Meeting Digest: ${formatDate(body.date)}`;

  // Send in batches of 50
  const emails = subscribers.map((s) => s.email);
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
    errors: errors.length > 0 ? errors : undefined,
  });
}
