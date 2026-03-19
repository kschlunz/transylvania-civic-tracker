import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a meeting minutes parser for the Transylvania County Board of Commissioners. Extract structured data from raw meeting minutes text.

Commissioner IDs and names:
- mccall: Teresa McCall
- chapman: Larry Chapman
- chappell: Jason Chappell
- dalton: Jake Dalton
- mckelvey: Chase McKelvey

Category IDs for tagging topics:
- fiscal: Fiscal Policy & Revenue
- schools: Schools & Capital
- safety: Public Safety
- infrastructure: Infrastructure
- econ: Economic Development
- governance: Transparency & Governance
- environment: Environment & Land
- housing: Housing
- health: Health & Human Services
- recovery: Helene Recovery
- community: Community & Culture

Extract the following from the meeting minutes:

1. Meeting metadata: date (YYYY-MM-DD), time, type (regular/special/workshop), attendees as an array of commissioner IDs, estimated audience size, duration estimate, and a TLDR summary of the meeting.

2. All key votes: description of what was voted on, result ("Unanimous" or the vote split like "4-1"), mover and seconder as commissioner IDs. For consent agenda items, use "consent agenda" for both mover and seconder.

3. For each commissioner present, extract:
   - Every topic they raised, question they asked, or position they took. Write each as a concise sentence. Tag each with one or more relevant category IDs.
   - Count of motions made and motions seconded.
   - Any external committee roles mentioned (e.g., "NCACC Tax & Finance Subcommittee").

4. All public comments: speaker full name and a summary of what they said.

Use the meeting date as the id field (e.g., "2026-02-09").

Return ONLY raw JSON. No markdown fences. No preamble. No explanation. Start with { and end with }

The JSON must match this TypeScript interface:

{
  id: string;
  date: string;
  type: string;
  time: string;
  attendees: string[];
  audienceSize: number;
  duration: string;
  tldr: string;
  keyVotes: Array<{
    description: string;
    result: string;
    mover: string;
    seconder: string;
  }>;
  commissionerActivity: Record<string, {
    topics: Array<{ text: string; categories: string[] }>;
    motionsMade: number;
    motionsSeconded: number;
    externalRoles: string[];
  }>;
  publicComments: Array<{
    speaker: string;
    summary: string;
  }>;
}`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }

  let body: { minutesText?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const { minutesText } = body;
  if (!minutesText || typeof minutesText !== "string") {
    return Response.json(
      { error: "minutesText is required and must be a string" },
      { status: 400 }
    );
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Parse the following meeting minutes and return structured JSON:\n\n${minutesText}`,
        },
        {
          role: "assistant",
          content: "{",
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json(
        { error: "No text response from Claude" },
        { status: 500 }
      );
    }

    // Prepend the "{" prefill and strip any markdown fences
    let jsonText = ("{" + textBlock.text).trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const meeting = JSON.parse(jsonText);
    return Response.json(meeting);
  } catch (error) {
    console.error("Error processing minutes:", error);

    if (error instanceof SyntaxError) {
      // Log the raw text so we can debug what Claude actually returned
      console.error("Raw Claude response that failed to parse as JSON:");
      console.error((error as SyntaxError).message);
      return Response.json(
        { error: "Failed to parse Claude response as JSON" },
        { status: 500 }
      );
    }

    return Response.json(
      { error: "Failed to process meeting minutes" },
      { status: 500 }
    );
  }
}
