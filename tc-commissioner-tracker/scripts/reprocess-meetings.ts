import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const anthropicKey = process.env.ANTHROPIC_API_KEY!;

if (!supabaseUrl || !supabaseKey || !anthropicKey) {
  console.error("Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

const SYSTEM_PROMPT = `You are extracting county staff activity from a Transylvania County Board of Commissioners meeting.

You will receive ALL available meeting data: TLDR summary, vote descriptions with background and discussion, every commissioner topic/question/position, and public comments. Your job is to find every mention of a county staff member presenting, reporting, recommending, or being referenced.

IMPORTANT: Staff members are often mentioned INDIRECTLY in commissioner activity text. Look for these patterns:
- "The Manager reported/presented/explained/noted/recommended..."
- "Finance Director O'Neal presented the budget..."
- "Project Manager Allison provided an update on..."
- "[Department] Director [name] presented/reported..."
- "Staff recommended..." or "Staff will bring back..."
- "The county manager said..." or "Manager Laughter noted..."
- References to presentations: "budget presentation", "capital update", "Helene recovery update"
- Vote backgrounds that mention who presented an item to the board
- Commissioners asking questions OF a staff member (implies that staff member presented)
- "Clerk Hogan" or references to the clerk's role

Known Transylvania County staff (but include anyone else mentioned):
- Jaime Laughter — County Manager (often just "the Manager")
- Meagan O'Neal — Finance Director
- Nathanael Carver — IT Director
- Beecher Allison — Project Manager
- David McNeill — Emergency Services Director
- Trisha Hogan — Clerk to the Board
- Any department head, director, or named staff member

For each staff member, list EVERY item they presented, reported on, or recommended. Be thorough — if they're mentioned in connection with 5 different topics, list all 5.

Return ONLY a JSON array. No markdown fences. No preamble. Start with [ and end with ].

Each element: { "name": "Full Name", "role": "Their Title", "items": ["concise description of what they presented or reported"] }

If genuinely no staff activity is identifiable, return []. But most commission meetings have extensive staff presentations — look carefully.`;

async function main() {
  console.log("Fetching meetings from Supabase...");

  const { data: meetings, error } = await supabase
    .from("meetings")
    .select("id, date, tldr, key_votes, commissioner_activity, public_comments")
    .order("date", { ascending: true });

  if (error) {
    console.error("Failed to fetch meetings:", error);
    process.exit(1);
  }

  console.log(`Found ${meetings.length} meeting(s) to process\n`);

  for (const meeting of meetings) {
    console.log(`Processing ${meeting.id} (${meeting.date})...`);

    // Build context from existing meeting data
    const context = buildMeetingContext(meeting);

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: context },
          { role: "assistant", content: "[" },
        ],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.error(`  No text response for ${meeting.id}, skipping`);
        continue;
      }

      let jsonText = ("[" + textBlock.text).trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }

      const staffActivity = JSON.parse(jsonText);

      if (!Array.isArray(staffActivity)) {
        console.error(`  Response is not an array for ${meeting.id}, skipping`);
        continue;
      }

      console.log(`  Found ${staffActivity.length} staff member(s)`);
      for (const s of staffActivity) {
        console.log(`    - ${s.name} (${s.role}): ${s.items.length} item(s)`);
      }

      const { error: updateError } = await supabase
        .from("meetings")
        .update({ staff_activity: staffActivity })
        .eq("id", meeting.id);

      if (updateError) {
        // Column might not exist yet — try adding staffActivity into the existing data
        console.error(`  Direct update failed (${updateError.message}). Column may not exist.`);
        console.log(`  Hint: Run this SQL to add the column:`);
        console.log(`    ALTER TABLE meetings ADD COLUMN IF NOT EXISTS staff_activity JSONB DEFAULT '[]';`);
        console.log(`  Then re-run this script.`);
        process.exit(1);
      }

      console.log(`  Updated ${meeting.id} ✓`);
    } catch (err) {
      console.error(`  Error processing ${meeting.id}:`, err instanceof Error ? err.message : err);
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nDone!");
}

function buildMeetingContext(meeting: {
  id: string;
  date: string;
  tldr: string;
  key_votes: unknown;
  commissioner_activity: unknown;
  public_comments: unknown;
}): string {
  const parts: string[] = [];

  parts.push(`=== MEETING: ${meeting.id} (${meeting.date}) ===`);
  parts.push(`\nFULL MEETING SUMMARY:\n${meeting.tldr}`);

  const votes = meeting.key_votes as Array<{ description: string; mover: string; seconder: string; background?: string; discussion?: string }>;
  if (votes && votes.length > 0) {
    parts.push("\n=== KEY VOTES (look for staff who presented these items) ===");
    for (let i = 0; i < votes.length; i++) {
      const v = votes[i];
      parts.push(`\nVote ${i + 1}: ${v.description}`);
      parts.push(`  Moved by: ${v.mover}, Seconded by: ${v.seconder}`);
      if (v.background) parts.push(`  BACKGROUND (who presented and why): ${v.background}`);
      if (v.discussion) parts.push(`  DISCUSSION (commissioner questions — note who they asked): ${v.discussion}`);
    }
  }

  const activity = meeting.commissioner_activity as Record<string, { topics: Array<{ text: string; categories?: string[] }>; externalRoles?: string[] }>;
  if (activity) {
    parts.push("\n=== COMMISSIONER ACTIVITY (look for references to staff presentations, reports, and recommendations) ===");
    for (const [commId, data] of Object.entries(activity)) {
      if (data.topics && data.topics.length > 0) {
        parts.push(`\nCommissioner ${commId}:`);
        for (const t of data.topics) {
          parts.push(`  - ${t.text}`);
        }
      }
    }
  }

  const comments = meeting.public_comments as Array<{ speaker: string; summary: string }>;
  if (comments && comments.length > 0) {
    parts.push("\n=== PUBLIC COMMENTS ===");
    for (const c of comments) {
      parts.push(`- ${c.speaker}: ${c.summary}`);
    }
  }

  return parts.join("\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
