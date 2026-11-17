/**
 * Turning a minutes PDF into a reviewed record: extract, check, revise once.
 *
 * The model is reached through the small `Llm` interface so the whole flow can
 * be tested without network access (see __tests__/extraction.test.ts).
 */
import { z } from "zod";
import { CATEGORIES } from "../../src/lib/constants";
import type { ListedMeeting } from "./county";
import type { IngestKeyVote, IngestMeeting, IngestRecord } from "./record";
import { ROSTER, seatedRoster, type RosterEntry } from "./roster";

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

/** A tool the model answers with; its input is the answer. */
export interface ResponseTool<T = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
}

/** One request to the model about one PDF. */
export interface LlmRequest<T> {
  /** Short name for logs, e.g. "extract:meeting", "review". */
  task: string;
  system: string;
  pdf: Buffer;
  instructions: string;
  /** The tool the model must answer with. */
  tool: ResponseTool<T>;
  /**
   * Every tool used for this PDF, sent unchanged with each request. Tools,
   * system prompt and PDF then form the same prefix every time, so the API
   * reads them from its cache after the first request instead of charging
   * for the whole PDF again.
   */
  toolset: ResponseTool[];
}
export type Llm = <T>(request: LlmRequest<T>) => Promise<T>;

export interface OpenFollowUp {
  id: string;
  dateRaised: string;
  owner: string;
  description: string;
  status: "open" | "in_progress";
}

export interface ActiveThread {
  id: string;
  title: string;
}

/**
 * What the model returns. Ids, dates and links are added by the pipeline, never by the model.
 *
 * Kept plain (no enums, no nullable fields): commissioner and category ids are
 * checked and normalised in code instead (normaliseExtraction and checkRecord),
 * which also tolerates a name where an id was expected.
 */
export function extractionSchema() {
  const parts = extractionParts();
  return z.object({ ...parts.meeting.shape, ...parts.people.shape, ...parts.followUps.shape });
}

/** The extraction split into three parts, one request each. */
export function extractionParts() {
  const commissioner = z.string().describe("A commissioner id from the list in the instructions.");
  const category = z.string().describe("A category id from the list in the instructions.");
  return {
    meeting: z.object({
    duration: z.string().describe('Length of the meeting, e.g. "2 hours 40 minutes", from the stated start and adjournment times. Empty string if the minutes do not give both.'),
    audienceSize: z.number().int().describe("Number of members of the public present, only if the minutes state it. Otherwise 0."),
    attendees: z.array(commissioner).describe("Commissioners recorded as present."),
    tldr: z.string().describe("Two to four plain sentences a resident could read to know what happened: the decisions made and the main subjects discussed."),
    keyVotes: z.array(
      z.object({
        description: z.string().describe("What was decided, as a short headline with the key figure if there is one."),
        consent: z.boolean().describe("True if this was approved as part of the consent agenda."),
        mover: z.string().describe('Commissioner id of the mover, or "" if the minutes name nobody.'),
        seconder: z.string().describe('Commissioner id of the seconder, or "" if the minutes name nobody.'),
        ayes: z.array(commissioner),
        nays: z.array(commissioner),
        abstained: z.array(commissioner).describe("Commissioners present but recused or abstaining."),
        absent: z.array(commissioner).describe("Commissioners not in the room for this vote."),
        rollCallKnown: z.boolean().describe("False only when the minutes give the outcome without saying how members voted and it cannot be inferred."),
        passed: z.boolean(),
        background: z.string().describe("Two or three sentences: why the item was on the agenda, who presented it, the key facts and figures."),
        discussion: z.string().describe("What commissioners said or asked before voting. Empty string if there was no discussion."),
        page: z.number().int().describe("1-indexed page of the PDF where the vote is recorded, or 0 if unsure."),
      }),
    ),
    }),
    people: z.object({
    commissionerActivity: z.array(
      z.object({
        commissioner,
        topics: z.array(z.object({ text: z.string(), categories: z.array(category) })),
        externalRoles: z.array(z.string()).describe("Outside boards or committees the minutes say this commissioner serves on."),
      }),
    ),
    publicComments: z.array(z.object({ speaker: z.string(), summary: z.string() })),
    staffActivity: z.array(
      z.object({
        name: z.string().describe("Full name as written in the minutes."),
        role: z.string().describe("Title or position."),
        items: z.array(z.string()).describe("Every topic they presented, reported on or recommended, one sentence each."),
      }),
    ),
    }),
    followUps: z.object({
    newFollowUps: z.array(
      z.object({
        owner: z.string().describe('A commissioner id, the full name of a staff member, or "staff" if no individual is named.'),
        description: z.string(),
        type: z.enum(["action_item", "report", "long_term", "ongoing"]),
        categories: z.array(category),
      }),
    ),
    followUpUpdates: z.array(
      z.object({
        id: z.string().describe("Id of an open follow-up from the list provided."),
        status: z.enum(["in_progress", "resolved"]),
        resolution: z.string().describe("One or two sentences on what happened at this meeting."),
      }),
    ),
    newThreads: z.array(
      z.object({
        id: z.string().describe('Lowercase slug of the title, e.g. "new-courthouse-project".'),
        title: z.string(),
        categories: z.array(category),
        summary: z.string().describe("What happened with this item at this meeting, one or two sentences."),
      }),
    ),
    threadUpdates: z.array(
      z.object({
        id: z.string().describe("Id of an existing thread from the list provided."),
        summary: z.string().describe("What happened with this item at this meeting, one or two sentences."),
      }),
    ),
    }),
  };
}
export type Extraction = z.infer<ReturnType<typeof extractionSchema>>;

export const ReviewSchema = z.object({
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning"]).describe('"error": the record states something the minutes contradict or do not support, or omits a vote. "warning": a judgement call a human should look at.'),
      where: z.string().describe('The part of the record concerned, e.g. "keyVotes[2].mover".'),
      problem: z.string(),
      evidence: z.string().describe("Short quote from the minutes, with page number, that shows the problem."),
    }),
  ),
});
export type Review = z.infer<typeof ReviewSchema>;

/** The tools the model answers with: one per part of the record, and one for the review. */
export function responseTools() {
  const parts = extractionParts();
  const tool = <T>(name: string, description: string, schema: z.ZodType<T>): ResponseTool<T> => ({ name, description, schema });
  return {
    meeting: tool("record_meeting", "Submit the meeting details and votes part of the record.", parts.meeting),
    people: tool("record_people", "Submit the commissioner activity, public comment and staff activity part of the record.", parts.people),
    followUps: tool("record_follow_ups", "Submit the follow-ups and topic threads part of the record.", parts.followUps),
    review: tool("submit_review", "Submit the problems found in a draft record.", ReviewSchema),
  };
}

export function buildSystemPrompt(meetingDate: string, roster: RosterEntry[] = ROSTER): string {
  return `You help maintain Civic Ledger, a public, non-partisan record of the Transylvania County (North Carolina) Board of Commissioners. Residents use it to see how their commissioners vote and whether commitments made in meetings are kept, so accuracy matters more than completeness: every statement in the record must be supported by the official minutes you are given. When the minutes are silent or ambiguous, leave the field empty or null rather than inferring.

Commissioners on the board on ${meetingDate} (use these ids):
${seatedRoster(meetingDate, roster).map((r) => `- ${r.id}: ${r.name}`).join("\n")}

Topic categories (use these ids):
${CATEGORIES.map((c) => `- ${c.id}: ${c.label}`).join("\n")}

Known county staff (include any other staff named in the minutes too): Jaime Laughter (County Manager, often "the Manager"), Meagan O'Neal (Finance Director), Nathanael Carver (IT Director), Beecher Allison (Project Manager), David McNeill (Emergency Services Director), Trisha Hogan (Clerk to the Board).

Conventions for the record:
- Votes: include every motion the board voted on, including approval of the agenda, the consent agenda (as one vote, with "consent" true) and procedural motions such as entering closed session or adjourning. When the minutes say a motion passed unanimously, list every commissioner present for that vote under ayes. When they give a split, name who voted each way. A commissioner who is present but recused or abstaining goes under abstained; absent is only for someone not in the room. When the minutes name two seconders, record the first one named and mention both in the background.
- Commissioner activity: for each commissioner present, the substantive points they raised, questions they asked and positions they took, one concise sentence each, in the past tense and attributed only as the minutes attribute them. Do not list motions here; those are captured as votes.
- Staff activity: every staff member who presented, reported or made a recommendation, with each topic they covered.
- Public comments: everyone who spoke during public comment or a public hearing, with their full name as written and a neutral summary of what they said.
- Follow-ups are commitments to do something later that a resident could check on: staff will bring an item back, a workshop will be scheduled, a report will be provided, a position will be filled. Routine next steps that are certain to happen anyway (the next regular meeting, signing an approved contract) are not follow-ups. Type: "action_item" for a one-time task, "report" when staff will research and report back, "long_term" for a multi-month project or study, "ongoing" for a recurring commitment.
- Topic threads are specific items likely to recur across meetings: capital projects, studies, policy initiatives, facility issues. Not routine approvals or one-off proclamations. Use an existing thread when the item is one already listed; start a new one only for something not yet tracked.
- Write neutrally. Describe what was said and decided without characterising motives or quality.`;
}

function formatContext(open: OpenFollowUp[], threads: ActiveThread[]): string {
  const followUps =
    open.length === 0
      ? "There are no open follow-up items from earlier meetings."
      : `Open follow-up items from earlier meetings:
${open.map((f) => `- [${f.id}] raised ${f.dateRaised}, owner ${f.owner}, currently ${f.status}: ${f.description}`).join("\n")}

If these minutes show one of them being acted on, add it to followUpUpdates: "resolved" when the commitment was fully met, "in_progress" when there was a concrete step or update. Include an item only when the minutes clearly refer to it; most meetings touch few or none.`;
  const active =
    threads.length === 0
      ? "There are no existing topic threads."
      : `Existing topic threads:
${threads.map((t) => `- [${t.id}] ${t.title}`).join("\n")}

Add a threadUpdates entry for each of these the meeting discussed.`;
  return `${followUps}\n\n${active}`;
}

function meetingLine(listed: ListedMeeting): string {
  return `These are the official minutes of the ${listed.type} meeting held on ${listed.date} ("${listed.title}").`;
}

function resultLabel(v: Extraction["keyVotes"][number]): string {
  if (!v.rollCallKnown) return v.passed ? "Passed" : "Failed";
  return v.nays.length === 0 ? "Unanimous" : `${v.ayes.length}-${v.nays.length}`;
}

/** Map what the model wrote to a seated commissioner id where it is unambiguous: "McCall", "Teresa McCall", "mccall " → "mccall". */
export function toCommissionerId(value: string, roster: RosterEntry[]): string {
  const v = value.trim().toLowerCase();
  if (!v) return "";
  if (roster.some((r) => r.id === v)) return v;
  const plain = v.replace(/^(commissioner|chair(man|woman)?|vice[- ]chair(man|woman)?)\s+/, "").replace(/[^a-z' ]/g, "").trim();
  const matches = roster.filter((r) => {
    const name = r.name.toLowerCase();
    const last = name.split(" ").at(-1)!;
    return plain === name || plain === last || plain.replace(/'/g, "") === r.id;
  });
  return matches.length === 1 ? matches[0].id : v;
}

/** Normalise ids and drop unknown categories, so the checks see the record as the site would. */
export function normaliseExtraction(extraction: Extraction, roster: RosterEntry[]): Extraction {
  const id = (v: string) => toCommissionerId(v, roster);
  const ids = (vs: string[]) => [...new Set(vs.map(id).filter(Boolean))];
  const cats = (vs: string[]) => [...new Set(vs.map((c) => c.trim().toLowerCase()).filter((c) => (CATEGORY_IDS as string[]).includes(c)))];
  return {
    ...extraction,
    attendees: ids(extraction.attendees),
    keyVotes: extraction.keyVotes.map((v) => ({
      ...v,
      mover: id(v.mover),
      seconder: id(v.seconder),
      ayes: ids(v.ayes),
      nays: ids(v.nays),
      abstained: ids(v.abstained),
      absent: ids(v.absent),
    })),
    commissionerActivity: extraction.commissionerActivity.map((a) => ({
      ...a,
      commissioner: id(a.commissioner),
      topics: a.topics.map((t) => ({ ...t, categories: cats(t.categories) })),
    })),
    newFollowUps: extraction.newFollowUps.map((f) => ({ ...f, owner: roster.some((r) => r.id === id(f.owner)) ? id(f.owner) : f.owner, categories: cats(f.categories) })),
    newThreads: extraction.newThreads.map((t) => ({ ...t, categories: cats(t.categories) })),
  };
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "thread";
}

/** Assemble the reviewed record from the model's output and the county's listing. */
export function toRecord(
  extraction: Extraction,
  listed: ListedMeeting & { minutesUrl: string },
  model: string,
  activeThreadIds: Set<string> = new Set(),
): IngestRecord {
  const keyVotes: IngestKeyVote[] = extraction.keyVotes.map((v) => ({
    description: v.description,
    result: resultLabel(v),
    // The site's convention: consent agenda items carry "consent agenda" in place of a mover and seconder.
    mover: v.consent ? "consent agenda" : v.mover,
    seconder: v.consent ? "consent agenda" : v.seconder,
    background: v.background,
    discussion: v.discussion,
    passed: v.passed,
    consent: v.consent,
    votes: v.rollCallKnown ? { ayes: v.ayes, nays: v.nays, abstained: v.abstained, absent: v.absent } : null,
    page: v.page && v.page > 0 ? v.page : null,
  }));

  const activity: IngestMeeting["commissionerActivity"] = {};
  for (const id of new Set([...extraction.attendees, ...extraction.commissionerActivity.map((a) => a.commissioner)])) {
    const found = extraction.commissionerActivity.find((a) => a.commissioner === id);
    activity[id] = {
      topics: found?.topics ?? [],
      // Counted from the votes so the two can never disagree.
      motionsMade: keyVotes.filter((v) => v.mover === id).length,
      motionsSeconded: keyVotes.filter((v) => v.seconder === id).length,
      externalRoles: found?.externalRoles ?? [],
    };
  }

  // New threads must not reuse an existing id; ones that do are treated as updates.
  const newThreads: IngestRecord["newThreads"] = [];
  const threadUpdates: IngestRecord["threadUpdates"] = [...extraction.threadUpdates];
  for (const t of extraction.newThreads) {
    const id = slugify(t.id || t.title);
    if (activeThreadIds.has(id)) threadUpdates.push({ id, summary: t.summary });
    else if (!newThreads.some((n) => n.id === id)) newThreads.push({ ...t, id });
  }

  return {
    meeting: {
      id: listed.date,
      date: listed.date,
      type: listed.type,
      time: listed.time,
      attendees: extraction.attendees,
      audienceSize: Math.max(0, extraction.audienceSize),
      duration: extraction.duration,
      tldr: extraction.tldr,
      keyVotes,
      commissionerActivity: activity,
      publicComments: extraction.publicComments,
      staffActivity: extraction.staffActivity,
      followUps: extraction.newFollowUps.map((f, i) => ({
        id: `${listed.date}-fu-${i + 1}`,
        dateRaised: listed.date,
        owner: f.owner,
        description: f.description,
        status: "open" as const,
        type: f.type,
        categories: f.categories,
        relatedMeetingId: listed.date,
      })),
      sourceUrl: listed.minutesUrl,
      ...(listed.agendaUrl ? { agendaUrl: listed.agendaUrl } : {}),
    },
    resolvedFollowUps: extraction.followUpUpdates,
    newThreads,
    threadUpdates,
    extraction: { model, extractedAt: new Date().toISOString(), revised: false, warnings: [] },
  };
}

/** Deterministic checks on a record. An empty list means it is consistent. */
export function checkRecord(
  record: IngestRecord,
  context: { openFollowUpIds: Set<string>; activeThreadIds: Set<string>; roster?: RosterEntry[] },
): string[] {
  const { meeting } = record;
  const problems: string[] = [];
  const seated = new Set(seatedRoster(meeting.date, context.roster ?? ROSTER).map((r) => r.id));
  const present = new Set(meeting.attendees);

  const checkPerson = (id: string, where: string) => {
    if (!seated.has(id)) problems.push(`${where}: "${id}" was not on the board on ${meeting.date}`);
  };

  if (new Set(meeting.attendees).size !== meeting.attendees.length) problems.push("attendees contains duplicates");
  meeting.attendees.forEach((id) => checkPerson(id, "attendees"));
  for (const id of Object.keys(meeting.commissionerActivity)) {
    if (!present.has(id)) problems.push(`commissionerActivity: "${id}" has activity but is not listed as present`);
  }

  meeting.keyVotes.forEach((vote, i) => {
    const where = `vote ${i + 1} ("${vote.description.slice(0, 50)}")`;
    if (!vote.consent) {
      for (const [label, id] of [["mover", vote.mover], ["seconder", vote.seconder]] as const) {
        if (!id) continue;
        checkPerson(id, `${where} ${label}`);
        if (!present.has(id)) problems.push(`${where}: ${label} "${id}" is not listed as present`);
      }
      if (vote.mover && vote.mover === vote.seconder) problems.push(`${where}: mover and seconder are the same person`);
    }
    if (vote.votes) {
      const { ayes, nays, abstained, absent } = vote.votes;
      const all = [...ayes, ...nays, ...abstained, ...absent];
      all.forEach((id) => checkPerson(id, `${where} roll call`));
      if (new Set(all).size !== all.length) problems.push(`${where}: a commissioner appears more than once in the roll call`);
      for (const id of [...ayes, ...nays, ...abstained]) {
        if (!present.has(id)) problems.push(`${where}: "${id}" voted but is not listed as present`);
      }
      if (vote.passed !== ayes.length > nays.length) problems.push(`${where}: "passed" disagrees with the roll call`);
      if (!vote.consent && vote.mover && nays.includes(vote.mover)) problems.push(`${where}: the mover is recorded voting against the motion`);
    }
  });

  for (const u of record.resolvedFollowUps) {
    if (!context.openFollowUpIds.has(u.id)) problems.push(`followUpUpdates: "${u.id}" is not an open follow-up`);
  }
  for (const u of record.threadUpdates) {
    if (!context.activeThreadIds.has(u.id)) problems.push(`threadUpdates: "${u.id}" is not an existing thread`);
  }
  return problems;
}

export interface ExtractionResult {
  record: IngestRecord;
  /** Everything a reviewer should look at, also stored in record.extraction.warnings. */
  warnings: string[];
}

function describeIssue(issue: Review["issues"][number]): string {
  return `${issue.where}: ${issue.problem}${issue.evidence ? ` (minutes: ${issue.evidence})` : ""}`;
}

/** Drop updates that point at unknown follow-ups or threads, keeping a note for the reviewer. */
function dropUnknownReferences(record: IngestRecord, openIds: Set<string>, threadIds: Set<string>): string[] {
  const notes: string[] = [];
  record.resolvedFollowUps = record.resolvedFollowUps.filter((u) => {
    if (openIds.has(u.id)) return true;
    notes.push(`Ignored an update to follow-up "${u.id}", which is not an open item.`);
    return false;
  });
  record.threadUpdates = record.threadUpdates.filter((u) => {
    if (threadIds.has(u.id)) return true;
    notes.push(`Ignored an update to thread "${u.id}", which does not exist.`);
    return false;
  });
  return notes;
}

/**
 * Extract a meeting from its minutes, have a second pass check the draft
 * against the PDF, and redo it once if that finds errors.
 */
export async function extractMeeting(input: {
  llm: Llm;
  model: string;
  pdf: Buffer;
  listed: ListedMeeting & { minutesUrl: string };
  openFollowUps: OpenFollowUp[];
  activeThreads: ActiveThread[];
  roster?: RosterEntry[];
}): Promise<ExtractionResult> {
  const { llm, model, pdf, listed, openFollowUps, activeThreads } = input;
  const roster = input.roster ?? ROSTER;
  const seatedIds = seatedRoster(listed.date, roster).map((r) => r.id);
  if (seatedIds.length === 0) throw new Error(`No commissioners in the roster were seated on ${listed.date}. Update scripts/ingest/roster.ts.`);
  const seated = seatedRoster(listed.date, roster);
  const tools = responseTools();
  const toolset = Object.values(tools) as ResponseTool[];
  const system = buildSystemPrompt(listed.date, roster);
  const openIds = new Set(openFollowUps.map((f) => f.id));
  const threadIds = new Set(activeThreads.map((t) => t.id));
  const context = formatContext(openFollowUps, activeThreads);

  const finish = (raw: Extraction) => {
    const record = toRecord(normaliseExtraction(raw, seated), listed, model, threadIds);
    const problems = checkRecord(record, { openFollowUpIds: openIds, activeThreadIds: threadIds, roster });
    return { record, problems };
  };

  const review = (extraction: Extraction, problems: string[]) =>
    llm({
      task: "review",
      system,
      pdf,
      tool: tools.review,
      toolset,
      instructions: `${meetingLine(listed)} Below is a draft record of this meeting prepared from them. Check the draft against the minutes and report every place where it is wrong or unsupported: a vote that is missing or invented, a wrong mover, seconder or roll call, a statement attributed to the wrong person, a figure that differs from the minutes, a public speaker or staff presenter missed or misnamed, a follow-up that is not really a commitment, or an earlier follow-up or thread marked as discussed without clear support. Read the minutes page by page rather than sampling. Report only real discrepancies; an empty list is the right answer for an accurate draft.

${context}
${problems.length > 0 ? `\nAutomated consistency checks already flagged:\n${problems.map((p) => `- ${p}`).join("\n")}\n` : ""}
Draft record:
${JSON.stringify(extraction, null, 2)}

Answer by calling ${tools.review.name}.`,
    });

  /**
   * Produce a full record in three requests, one per part, so each answer
   * stays focused. The PDF is read from the API's cache after the first
   * request, so the extra requests add little cost.
   */
  const produce = async (task: "extract" | "revise", instructions: string): Promise<Extraction> => {
    const part = <T>(name: string, tool: ResponseTool<T>, what: string) =>
      llm({ task: `${task}:${name}`, system, pdf, tool, toolset, instructions: `${instructions}\n\nFor this request, call ${tool.name} with only ${what} part of the record.` });
    const meeting = await part("meeting", tools.meeting, "the meeting details and votes");
    const people = await part("people", tools.people, "the commissioner activity, public comment and staff activity");
    const followUps = await part("followUps", tools.followUps, "the follow-ups and topic threads");
    return { ...meeting, ...people, ...followUps };
  };

  let extraction = await produce("extract", `${meetingLine(listed)} Read them in full and produce the record of this meeting.\n\n${context}`);
  let current = finish(extraction);
  let issues = (await review(extraction, current.problems)).issues;
  let revised = false;

  if (current.problems.length > 0 || issues.some((i) => i.severity === "error")) {
    revised = true;
    extraction = await produce(
      "revise",
      `${meetingLine(listed)} Below is a draft record of this meeting and a list of problems a reviewer found in it. Produce the corrected, complete record. Check each reported problem against the minutes yourself: fix the ones that are right, and leave the draft as it is where the reviewer was mistaken.

${context}

Problems found:
${[...current.problems, ...issues.map(describeIssue)].map((p) => `- ${p}`).join("\n")}

Draft record:
${JSON.stringify(extraction, null, 2)}`,
    );
    current = finish(extraction);
    issues = (await review(extraction, current.problems)).issues;
  }

  const notes = dropUnknownReferences(current.record, openIds, threadIds);
  const remaining = current.problems.filter((p) => !p.startsWith("followUpUpdates:") && !p.startsWith("threadUpdates:"));
  const warnings = [...remaining, ...notes, ...issues.map((i) => `${i.severity === "error" ? "Possible error" : "Check"} — ${describeIssue(i)}`)];
  current.record.extraction = { ...current.record.extraction, revised, warnings };
  return { record: current.record, warnings };
}
