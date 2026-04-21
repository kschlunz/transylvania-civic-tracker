/**
 * Send a meeting digest email.
 *
 * Usage:
 *   npx tsx scripts/send-digest.ts --meeting 2026-02-23 --test    # send to test email only
 *   npx tsx scripts/send-digest.ts --meeting 2026-02-23            # send to all subscribers
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

const meetingArg = process.argv.find((a) => a.startsWith("--meeting="))?.split("=")[1] ||
  (process.argv.includes("--meeting") ? process.argv[process.argv.indexOf("--meeting") + 1] : null);
const testMode = process.argv.includes("--test");

if (!meetingArg) {
  console.log("Usage:");
  console.log("  npx tsx scripts/send-digest.ts --meeting 2026-02-23 --test");
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
  console.log(`${testMode ? "🧪 TEST MODE" : "📧 LIVE MODE"} — Meeting: ${meetingArg}\n`);

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
      testMode,
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
