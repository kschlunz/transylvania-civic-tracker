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

const SYSTEM_PROMPT = `You are extracting staff activity from a Transylvania County Board of Commissioners meeting. You will receive the meeting's extracted data (TLDR, votes, commissioner activity, public comments).

Identify every county staff member who presented, reported, or made recommendations to the board. Common staff include:
- Jaime Laughter (County Manager)
- Meagan O'Neal (Finance Director)
- Nathanael Carver (IT Director)
- Beecher Allison (Project Manager)
- David McNeill (Emergency Services Director)
- Trisha Hogan (Clerk to the Board)

But also include any other staff mentioned by name.

For each staff member, capture what they presented, reported on, or recommended as an array of concise strings.

Return ONLY a JSON array (no markdown fences, no preamble). Start with [ and end with ].

Each element: { "name": "Full Name", "role": "Their Title", "items": ["what they presented or reported"] }

If no staff activity is identifiable, return an empty array: []`;

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

      // Update the meeting in Supabase
      // Fetch the full row to merge staffActivity into existing data
      const { data: fullMeeting, error: fetchError } = await supabase
        .from("meetings")
        .select("*")
        .eq("id", meeting.id)
        .single();

      if (fetchError || !fullMeeting) {
        console.error(`  Failed to fetch full meeting ${meeting.id}:`, fetchError);
        continue;
      }

      // The meeting data is stored as JSONB columns, but staffActivity needs to go
      // into the row. Since there's no dedicated column, we'll store it in a way
      // the app can read. Check if there's a staff_activity column or if we need
      // to add it to an existing JSONB field.

      // Try direct column update first
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

  parts.push(`Meeting: ${meeting.id} (${meeting.date})`);
  parts.push(`\nTLDR: ${meeting.tldr}`);

  const votes = meeting.key_votes as Array<{ description: string; mover: string; seconder: string; background?: string; discussion?: string }>;
  if (votes && votes.length > 0) {
    parts.push("\nKey Votes:");
    for (const v of votes) {
      parts.push(`- ${v.description}`);
      if (v.background) parts.push(`  Background: ${v.background}`);
      if (v.discussion) parts.push(`  Discussion: ${v.discussion}`);
    }
  }

  const activity = meeting.commissioner_activity as Record<string, { topics: Array<{ text: string }> }>;
  if (activity) {
    parts.push("\nCommissioner Activity:");
    for (const [commId, data] of Object.entries(activity)) {
      if (data.topics && data.topics.length > 0) {
        parts.push(`  ${commId}:`);
        for (const t of data.topics) {
          parts.push(`    - ${t.text}`);
        }
      }
    }
  }

  const comments = meeting.public_comments as Array<{ speaker: string; summary: string }>;
  if (comments && comments.length > 0) {
    parts.push("\nPublic Comments:");
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
