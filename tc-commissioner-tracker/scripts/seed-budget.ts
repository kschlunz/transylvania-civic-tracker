/**
 * Seed budget data from JSON into Supabase.
 *
 * Usage:
 *   npx tsx scripts/seed-budget.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import budgetData from "../src/data/budget-fy26.json";

config({ path: resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface DeptJson {
  department: string;
  totalsByYear: {
    fy22: number;
    fy23: number;
    fy24: number;
    fy25Actuals: number;
    fy25Budget: number;
    fy26Projection: number;
  };
  percentChange: number;
  lineItems: Array<{
    accountCode: string;
    accountName: string;
    fy22: number;
    fy23: number;
    fy24: number;
    fy25Actuals: number;
    fy25Budget: number;
    fy26Projection: number;
    percentChange: number;
  }>;
}

async function main() {
  const departments = (budgetData as { departments: DeptJson[] }).departments;
  console.log(`Seeding ${departments.length} departments...`);

  let deptCount = 0;
  let itemCount = 0;

  for (const dept of departments) {
    // Upsert department
    const { data: deptRow, error: deptError } = await supabase
      .from("budget_departments")
      .upsert(
        {
          name: dept.department,
          fy22_total: dept.totalsByYear.fy22,
          fy23_total: dept.totalsByYear.fy23,
          fy24_total: dept.totalsByYear.fy24,
          fy25_actuals: dept.totalsByYear.fy25Actuals,
          fy25_budget: dept.totalsByYear.fy25Budget,
          fy26_projection: dept.totalsByYear.fy26Projection,
          percent_change: dept.percentChange,
        },
        { onConflict: "name" }
      )
      .select("id")
      .single();

    if (deptError) {
      console.error(`Error upserting department "${dept.department}":`, deptError.message);
      continue;
    }

    deptCount++;
    const deptId = deptRow.id;

    // Delete existing line items for this department (fresh seed)
    await supabase.from("budget_line_items").delete().eq("department_id", deptId);

    // Insert line items in batches
    const batchSize = 50;
    for (let i = 0; i < dept.lineItems.length; i += batchSize) {
      const batch = dept.lineItems.slice(i, i + batchSize).map((item) => ({
        department_id: deptId,
        account_code: item.accountCode,
        account_name: item.accountName,
        fy22: item.fy22,
        fy23: item.fy23,
        fy24: item.fy24,
        fy25_actuals: item.fy25Actuals,
        fy25_budget: item.fy25Budget,
        fy26_projection: item.fy26Projection,
        percent_change: item.percentChange,
      }));

      const { error: itemError } = await supabase.from("budget_line_items").insert(batch);
      if (itemError) {
        console.error(`Error inserting items for "${dept.department}":`, itemError.message);
      } else {
        itemCount += batch.length;
      }
    }

    console.log(`  ${dept.department}: ${dept.lineItems.length} items`);
  }

  console.log(`\nDone! ${deptCount} departments, ${itemCount} line items seeded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
