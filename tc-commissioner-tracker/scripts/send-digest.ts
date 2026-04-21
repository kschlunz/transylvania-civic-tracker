/**
 * Send a meeting digest email.
 *
 * Usage:
 *   npx tsx scripts/send-digest.ts --meeting 2026-02-23 --test                         # test email (to you only)
 *   npx tsx scripts/send-digest.ts --meeting 2026-02-23 --to alice@x.com,bob@y.com     # one-off send to specific addresses
 *   npx tsx scripts/send-digest.ts --meeting 2026-02-23                                # live send to all subscribers
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

const meetingArg = process.argv.find((a) => a.startsWith("--meeting="))?.split("=")[1] ||
  (process.argv.includes("--meeting") ? process.argv[process.argv.indexOf("--meeting") + 1] : null);
const testMode = process.argv.includes("--test");
const toArg = process.argv.find((a) => a.startsWith("--to="))?.split("=")[1] ||
  (process.argv.includes("--to") ? process.argv[process.argv.indexOf("--to") + 1] : null);
const toEmails = toArg ? toArg.split(",").map((e) => e.trim()).filter(Boolean) : [];

if (!meetingArg) {
  console.log("Usage:");
  console.log("  npx tsx scripts/send-digest.ts --meeting 2026-02-23 --test");
  console.log("  npx tsx scripts/send-digest.ts --meeting 2026-02-23 --to alice@x.com,bob@y.com");
  console.log("  npx tsx scripts/send-digest.ts --meeting 2026-02-23");
  process.exit(1);
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const adminUserId = process.env.NEXT_PUBLIC_ADMIN_USER_ID;

if (!adminUserId) {
  console.error("Missing NEXT_PUBLIC_ADMIN_USER_ID in .env.local");
  process.exit(1);
}

async function main() {
  const mode = toEmails.length > 0 ? `🎯 ONE-OFF (${toEmails.length})` : testMode ? "🧪 TEST MODE" : "📧 LIVE MODE";
  console.log(`${mode} — Meeting: ${meetingArg}\n`);

  const url = `${siteUrl}/api/send-digest`;
  console.log(`Calling: ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-user-id": adminUserId!,
    },
    body: JSON.stringify({
      meetingId: meetingArg,
      testMode: toEmails.length === 0 && testMode,
      to: toEmails.length > 0 ? toEmails : undefined,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`\n❌ Error: ${data.error}`);
    process.exit(1);
  }

  console.log(`\n✅ Sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}`);
  if (data.testMode) console.log("   (test mode — schlunzk@gmail.com only)");
  if (data.errors) {
    console.log("\n⚠️  Errors:");
    for (const e of data.errors) console.log(`   ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
