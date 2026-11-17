import { describe, expect, it } from "vitest";
import { buildSystemPrompt, checkRecord, extractMeeting, toRecord } from "../extraction";
import { IngestRecordSchema } from "../record";
import { ROSTER, PDF, extraction, fakeLlm, listed } from "./helpers";

const open = [{ id: "2026-02-09-fu-1", dateRaised: "2026-02-09", owner: "staff", description: "Hire a planner.", status: "open" as const }];
const threads = [{ id: "new-courthouse-project", title: "New Courthouse Project" }];

describe("toRecord", () => {
  it("produces a meeting in the site's shape", () => {
    const record = toRecord(extraction(), listed("2026-03-09", { agendaUrl: "https://example.org/agenda.pdf" }), "test-model");
    IngestRecordSchema.parse(record);
    const [consent, paving] = record.meeting.keyVotes;
    expect(consent).toMatchObject({ mover: "consent agenda", seconder: "consent agenda", result: "Unanimous", consent: true });
    expect(paving).toMatchObject({ mover: "chapman", seconder: "dalton", result: "2-1", passed: true, page: 4 });
    expect(paving.votes?.nays).toEqual(["mccall"]);
    expect(record.meeting.commissionerActivity.chapman).toMatchObject({ motionsMade: 1, motionsSeconded: 0 });
    expect(record.meeting.commissionerActivity.dalton).toMatchObject({ motionsMade: 0, motionsSeconded: 1, topics: [] });
    expect(record.meeting.followUps).toEqual([
      { id: "2026-03-09-fu-1", dateRaised: "2026-03-09", owner: "staff", description: "Bring back a sidewalk plan.", status: "open", type: "report", categories: ["infrastructure"], relatedMeetingId: "2026-03-09" },
    ]);
    expect(record.meeting.staffActivity[0].name).toBe("Jaime Laughter");
    expect(record.meeting.audienceSize).toBe(0);
    expect(record.meeting.agendaUrl).toBe("https://example.org/agenda.pdf");
  });

  it("turns a new thread that already exists into an update", () => {
    const record = toRecord(
      extraction({ newThreads: [{ id: "New Courthouse Project", title: "New Courthouse Project", categories: [], summary: "Design update." }] }),
      listed("2026-03-09"),
      "m",
      new Set(["new-courthouse-project"]),
    );
    expect(record.newThreads).toEqual([]);
    expect(record.threadUpdates).toEqual([{ id: "new-courthouse-project", summary: "Design update." }]);
  });
});

describe("checkRecord", () => {
  const context = { openFollowUpIds: new Set<string>(), activeThreadIds: new Set<string>(), roster: ROSTER };

  it("accepts a consistent record", () => {
    expect(checkRecord(toRecord(extraction(), listed("2026-03-09"), "m"), context)).toEqual([]);
  });

  it("flags people who were not seated or not present, and contradictions", () => {
    const record = toRecord(extraction({ attendees: ["mccall", "chapman"] }), listed("2027-01-11"), "m");
    record.meeting.keyVotes[1].passed = false;
    const problems = checkRecord(record, context).join("\n");
    expect(problems).toMatch(/"dalton" was not on the board on 2027-01-11/);
    expect(problems).toMatch(/seconder "dalton" is not listed as present/);
    expect(problems).toMatch(/"passed" disagrees with the roll call/);
  });

  it("flags references to unknown follow-ups and threads", () => {
    const record = toRecord(
      extraction({ followUpUpdates: [{ id: "x-fu-1", status: "resolved", resolution: "Done." }], threadUpdates: [{ id: "nope", summary: "" }] }),
      listed("2026-03-09"),
      "m",
    );
    const problems = checkRecord(record, context).join("\n");
    expect(problems).toMatch(/"x-fu-1" is not an open follow-up/);
    expect(problems).toMatch(/"nope" is not an existing thread/);
  });
});

describe("extractMeeting", () => {
  it("offers only commissioners seated on the meeting date", () => {
    expect(buildSystemPrompt("2027-01-11", ROSTER)).not.toMatch(/dalton/);
    expect(buildSystemPrompt("2026-03-09", ROSTER)).toMatch(/dalton: Jake Dalton/);
  });

  it("extracts and reviews, passing open follow-ups and threads", async () => {
    const { llm, calls, steps } = fakeLlm({ extract: [extraction()] });
    const { record, warnings } = await extractMeeting({ llm, model: "m", pdf: PDF, listed: listed("2026-03-09"), openFollowUps: open, activeThreads: threads, roster: ROSTER });
    expect(steps()).toEqual(["extract", "review"]);
    expect(calls[0].instructions).toMatch(/\[2026-02-09-fu-1\] raised 2026-02-09, owner staff, currently open: Hire a planner\./);
    expect(calls[0].instructions).toMatch(/\[new-courthouse-project\] New Courthouse Project/);
    expect(warnings).toEqual([]);
    expect(record.extraction).toMatchObject({ model: "m", revised: false, warnings: [] });
  });

  it("revises once when the review finds an error and keeps what is unresolved", async () => {
    const wrong = extraction();
    wrong.keyVotes[1] = { ...wrong.keyVotes[1], mover: "dalton", seconder: "chapman" };
    const { llm, calls, steps } = fakeLlm({
      extract: [wrong],
      review: [
        { issues: [{ severity: "error", where: "keyVotes[1].mover", problem: "Chapman made the motion.", evidence: '"Commissioner Chapman moved" (p. 4)' }] },
        { issues: [{ severity: "warning", where: "newFollowUps[0]", problem: "May be routine.", evidence: "" }] },
      ],
      revise: [extraction()],
    });
    const { record, warnings } = await extractMeeting({ llm, model: "m", pdf: PDF, listed: listed("2026-03-09"), openFollowUps: [], activeThreads: [], roster: ROSTER });
    expect(steps()).toEqual(["extract", "review", "revise", "review"]);
    expect(calls.find((c) => c.task.startsWith("revise"))!.instructions).toMatch(/Chapman made the motion/);
    expect(record.meeting.keyVotes[1].mover).toBe("chapman");
    expect(record.extraction.revised).toBe(true);
    expect(warnings).toEqual(["Check — newFollowUps[0]: May be routine."]);
  });

  it("drops updates to unknown follow-ups and threads, noting them for the reviewer", async () => {
    const bad = extraction({ followUpUpdates: [{ id: "2025-01-01-fu-9", status: "resolved", resolution: "Done." }], threadUpdates: [{ id: "ghost", summary: "x" }] });
    const { llm } = fakeLlm({ extract: [bad], revise: [bad] });
    const { record, warnings } = await extractMeeting({ llm, model: "m", pdf: PDF, listed: listed("2026-03-09"), openFollowUps: open, activeThreads: threads, roster: ROSTER });
    expect(record.resolvedFollowUps).toEqual([]);
    expect(record.threadUpdates).toEqual([]);
    expect(warnings).toEqual([
      'Ignored an update to follow-up "2025-01-01-fu-9", which is not an open item.',
      'Ignored an update to thread "ghost", which does not exist.',
    ]);
  });
});

describe("response tools", () => {
  it("every request for a meeting sends the same toolset and system prompt", async () => {
    const { llm, calls } = fakeLlm({ extract: [extraction()], review: [{ issues: [] }] });
    const seen: unknown[] = [];
    const spy: typeof llm = (request) => {
      seen.push({ system: request.system, toolset: request.toolset.map((t) => t.name) });
      return llm(request);
    };
    await extractMeeting({ llm: spy, model: "m", pdf: PDF, listed: listed("2026-03-09"), openFollowUps: [], activeThreads: [], roster: ROSTER });
    expect(calls.map((c) => c.task)).toEqual(["extract:meeting", "extract:people", "extract:followUps", "review"]);
    expect(new Set(seen.map((s) => JSON.stringify(s))).size).toBe(1);
  });

  it("covers the whole extraction between the three part tools", async () => {
    const { responseTools, extractionSchema } = await import("../extraction");
    const tools = responseTools();
    const keys = [tools.meeting, tools.people, tools.followUps].flatMap((t) => Object.keys((t.schema as unknown as { shape: object }).shape));
    expect(keys.sort()).toEqual(Object.keys(extractionSchema().shape).sort());
  });
});

describe("normaliseExtraction", () => {
  it("maps names to ids and drops unknown categories", async () => {
    const { normaliseExtraction, toCommissionerId } = await import("../extraction");
    expect(toCommissionerId("Commissioner McCall", ROSTER)).toBe("mccall");
    expect(toCommissionerId("Larry Chapman", ROSTER)).toBe("chapman");
    expect(toCommissionerId(" Dalton ", ROSTER)).toBe("dalton");
    expect(toCommissionerId("Someone Else", ROSTER)).toBe("someone else");
    const raw = extraction({ attendees: ["McCall", "chapman", "Jake Dalton"] });
    raw.commissionerActivity[0] = { commissioner: "Chair McCall", topics: [{ text: "x", categories: ["Fiscal", "made-up"] }], externalRoles: [] };
    const n = normaliseExtraction(raw, ROSTER);
    expect(n.attendees).toEqual(["mccall", "chapman", "dalton"]);
    expect(n.commissionerActivity[0]).toMatchObject({ commissioner: "mccall", topics: [{ categories: ["fiscal"] }] });
  });

  it("flags an unknown commissioner so the record is revised", async () => {
    const { llm, calls, steps } = fakeLlm({ extract: [extraction({ attendees: ["mccall", "chapman", "dalton", "smith"] })], revise: [extraction()] });
    await extractMeeting({ llm, model: "m", pdf: PDF, listed: listed("2026-03-09"), openFollowUps: [], activeThreads: [], roster: ROSTER });
    expect(steps()).toEqual(["extract", "review", "revise", "review"]);
    expect(calls.find((c) => c.task.startsWith("revise"))!.instructions).toMatch(/"smith" was not on the board/);
  });
});
