/**
 * Send the FY27 Budget Announcement email.
 *
 * This is a one-time announcement. Sends are IRREVERSIBLE.
 *
 * Usage:
 *   npx tsx scripts/send-budget-email.ts
 *     Dry-run (default). Queries subscribers, calls the builder to verify, prints
 *     the subject + first ~200 chars of the plain-text body, and sends NOTHING.
 *
 *   npx tsx scripts/send-budget-email.ts --test=you@example.com
 *     Sends exactly ONE email to that address (no subscriber query, no batch).
 *
 *   npx tsx scripts/send-budget-email.ts --send --confirm
 *     REAL send to all subscribers. Both flags required. Loud warning + 3-second
 *     pause before any network request goes out.
 *
 * Common flags (can combine with any mode above):
 *   --local            Target http://localhost:3000 (use when dev server is up
 *                      but prod hasn't deployed the route yet).
 *   --url=https://...  Explicitly override the API base URL.
 *
 * Pre-send checklist:
 *   1. Apply supabase/migrations/20260528_budget_breakdowns.sql (and 20260513_budget_cycles.sql).
 *   2. Open /admin/email-preview/fy27-budget and skim the rendered email.
 *   3. Run this script bare (dry-run) — sanity-check subscriber count.
 *   4. Run with --test=you@example.com — open in Gmail web, Gmail mobile, Outlook
 *      web, and Apple Mail with images OFF. Confirm bars render.
 *   5. Only then: --send --confirm.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });

const args = process.argv.slice(2);
const testArg = args.find((a) => a.startsWith("--test="))?.split("=")[1];
const urlArg = args.find((a) => a.startsWith("--url="))?.split("=")[1];
const useLocal = args.includes("--local");
const wantsSend = args.includes("--send");
const hasConfirm = args.includes("--confirm");
const wantsHelp = args.includes("--help") || args.includes("-h");

const siteUrl = urlArg
  || (useLocal ? "http://localhost:3000" : null)
  || process.env.NEXT_PUBLIC_SITE_URL
  || "http://localhost:3000";
const adminUserId = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function printHelp() {
  console.log(`
Send the FY27 Budget Announcement email.

USAGE
  npx tsx scripts/send-budget-email.ts
      Dry-run. Validates data + counts subscribers. Sends nothing.

  npx tsx scripts/send-budget-email.ts --test=you@example.com
      Sends ONE test email to the given address. No subscriber query.

  npx tsx scripts/send-budget-email.ts --send --confirm
      REAL send to all subscribers. Both flags required.

WHICH API IS HIT
  By default the script targets NEXT_PUBLIC_SITE_URL from .env.local
  (usually production). To override:

  --local            Use http://localhost:3000 (start 'npm run dev' first).
  --url=https://...  Explicitly point at any URL.

  If the route hasn't been deployed to prod yet, --local is the way to go.

PRE-SEND CHECKLIST
  1. Apply supabase/migrations/20260528_budget_breakdowns.sql.
  2. Open /admin/email-preview/fy27-budget — skim the rendered email.
  3. Run dry-run — confirm subscriber count is sane.
  4. Run --test=you@x.com — open in Gmail web + mobile, Outlook web, Apple Mail
     with images OFF. Confirm bars render.
  5. Only then run --send --confirm.
`);
}

if (wantsHelp) {
  printHelp();
  process.exit(0);
}

if (!adminUserId) {
  console.error("Missing NEXT_PUBLIC_ADMIN_USER_ID in .env.local");
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function readJsonOrExplain(res: Response, label: string): Promise<unknown> {
  const text = await res.text();
  const looksLikeHtml = text.trim().startsWith("<");
  try {
    return JSON.parse(text);
  } catch {
    console.error(`\n❌ ${label} returned a non-JSON response (${res.status}).`);
    if (looksLikeHtml) {
      console.error(`   The URL ${siteUrl} appears to be serving HTML — likely a 404 page.`);
      console.error(`   This usually means the route hasn't been deployed there yet.`);
      console.error(`   Run with --local (and 'npm run dev' in another terminal) to hit localhost,`);
      console.error(`   or deploy main to Vercel first.`);
    } else {
      console.error(`   Body: ${text.slice(0, 200)}`);
    }
    process.exit(1);
  }
}

async function previewEmail(): Promise<{ subject: string; text: string } | null> {
  const url = `${siteUrl}/api/send-budget-email`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-admin-user-id": adminUserId! },
  });
  const json = (await readJsonOrExplain(res, "Preview")) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`\n❌ Preview request failed: ${json.error || res.status}`);
    console.error(`   Is the dev server running? (npm run dev)`);
    return null;
  }
  return { subject: json.subject as string, text: json.text as string };
}

async function getSubscriberCount(): Promise<number | null> {
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase env vars — cannot count subscribers.");
    return null;
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { count, error } = await supabase
    .from("subscribers")
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error(`Failed to count subscribers: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

async function postSend(testMode: boolean, to?: string[]) {
  const url = `${siteUrl}/api/send-budget-email`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-user-id": adminUserId!,
    },
    body: JSON.stringify({ testMode, to }),
  });
  const data = (await readJsonOrExplain(res, "Send")) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`\n❌ Send failed: ${data.error || res.status}`);
    process.exit(1);
  }
  return data as {
    sent: number;
    total?: number;
    subject: string;
    errors?: string[];
  };
}

async function main() {
  // Mode 1: --test=email (parameterized single send)
  if (testArg) {
    if (!testArg.includes("@")) {
      console.error(`❌ --test value doesn't look like an email: "${testArg}"`);
      process.exit(1);
    }
    console.log(`🧪 TEST MODE — sending one email to ${testArg}`);
    console.log(`   API: ${siteUrl}\n`);
    const data = await postSend(false, [testArg]);
    console.log(`✅ Sent to ${data.sent} recipient`);
    console.log(`   Subject: ${data.subject}`);
    if (data.errors) {
      console.log("\n⚠️  Errors:");
      for (const e of data.errors) console.log(`   ${e}`);
    }
    return;
  }

  // Mode 2: --send --confirm (real send)
  if (wantsSend && hasConfirm) {
    console.log("");
    console.log("============================================================");
    console.log("🚨  REAL SEND — FY27 BUDGET EMAIL");
    console.log("    This will email ALL subscribers.");
    console.log("    Sends are IRREVERSIBLE. Pausing 3 seconds…");
    console.log(`    API: ${siteUrl}`);
    console.log("    Press Ctrl-C now to abort.");
    console.log("============================================================");
    console.log("");
    await sleep(3000);

    const count = await getSubscriberCount();
    if (count !== null) console.log(`📧 About to send to ${count} subscriber${count === 1 ? "" : "s"}…\n`);

    const data = await postSend(false);
    console.log(`✅ Sent to ${data.sent} / ${data.total} subscribers`);
    console.log(`   Subject: ${data.subject}`);
    if (data.errors) {
      console.log("\n⚠️  Errors:");
      for (const e of data.errors) console.log(`   ${e}`);
    }
    console.log("\nReminder: this is a one-time announcement. Re-running --send --confirm will re-email everyone.");
    return;
  }

  // Mode 3: --send without --confirm → refuse
  if (wantsSend && !hasConfirm) {
    console.error("❌ --send requires --confirm. Both flags must be present for the real send.");
    console.error("   Run with --help for usage.");
    process.exit(1);
  }

  // Mode 4 (default): dry-run
  console.log("🔍 DRY-RUN — no email will be sent.");
  console.log(`   API: ${siteUrl}\n`);

  const count = await getSubscriberCount();
  if (count !== null) {
    console.log(`Subscribers in database: ${count}`);
  }

  const preview = await previewEmail();
  if (!preview) {
    console.error("\nCannot generate preview — refusing to proceed.");
    process.exit(1);
  }

  console.log(`\nSubject: ${preview.subject}`);
  console.log("");
  console.log("Plain-text preview (first 200 chars):");
  console.log("----------------------------------------");
  console.log(preview.text.slice(0, 200).trimEnd() + "…");
  console.log("----------------------------------------");
  console.log("");
  console.log("Nothing was sent. To proceed:");
  console.log(`  npx tsx scripts/send-budget-email.ts --test=you@example.com   # test send`);
  console.log(`  npx tsx scripts/send-budget-email.ts --send --confirm          # real send`);
  console.log("");
  console.log("This is a one-time announcement — re-running --send will re-email everyone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
