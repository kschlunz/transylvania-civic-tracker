/**
 * Add a subscriber to the digest list.
 *
 * Usage:
 *   npx tsx scripts/add-subscriber.ts alice@example.com
 *   npx tsx scripts/add-subscriber.ts alice@x.com bob@y.com
 */

import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const emails = process.argv.slice(2).map((e) => e.trim()).filter(Boolean);

if (emails.length === 0) {
  console.log("Usage: npx tsx scripts/add-subscriber.ts email1@x.com [email2@y.com ...]");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  for (const email of emails) {
    const { error } = await supabase
      .from("subscribers")
      .upsert({ email }, { onConflict: "email" });

    if (error) {
      console.error(`❌ ${email}: ${error.message}`);
    } else {
      console.log(`✅ ${email}`);
    }
  }

  const { count } = await supabase
    .from("subscribers")
    .select("*", { count: "exact", head: true });
  console.log(`\nTotal subscribers: ${count ?? "?"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
