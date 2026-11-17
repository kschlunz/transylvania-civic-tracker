import { describe, expect, it } from "vitest";
import { buildReport, planIngest, runIngest } from "../ingest";
import type { IngestRecord } from "../record";
import { PDF, emptyState, extraction, fakeLlm, listed } from "./helpers";

describe("planIngest", () => {
  const all = [
    listed("2026-06-22"),
    listed("2026-05-26"),
    listed("2026-06-08"),
    { ...listed("2026-07-13"), minutesUrl: undefined },
    listed("2026-04-27"),
    { ...listed("2026-06-02"), minutesUrl: "https://example.org/minutes.doc" },
    listed("2026-12-14"),
  ];

  it("processes meetings after the newest on record, oldest first, up to the limit", () => {
    const plan = planIngest(all, emptyState({ meetingIds: new Set(["2026-05-11", "2026-04-13"]) }), { limit: 2 }, "2026-11-17");
    expect(plan.toProcess.map((m) => m.date)).toEqual(["2026-05-26", "2026-06-08"]);
    expect(plan.gaps.map((m) => m.date)).toEqual(["2026-04-27"]);
    expect(plan.awaitingMinutes.map((m) => m.date)).toEqual(["2026-07-13"]);
    expect(plan.skipped.map((s) => s.meeting.date)).toEqual(["2026-06-02"]);
  });

  it("fills a named gap and never redoes a meeting already on record", () => {
    const state = emptyState({ meetingIds: new Set(["2026-05-11", "2026-06-08"]) });
    expect(planIngest(all, state, { limit: 3, only: ["2026-04-27", "2026-06-08"] }, "2026-11-17").toProcess.map((m) => m.date)).toEqual(["2026-04-27"]);
  });
});

describe("runIngest", () => {
  it("carries follow-ups and threads from one meeting to the next", async () => {
    const saved: IngestRecord[] = [];
    const { llm, calls } = fakeLlm({
      extract: [
        extraction(),
        extraction({
          newFollowUps: [],
          newThreads: [],
          followUpUpdates: [{ id: "2026-06-08-fu-1", status: "resolved", resolution: "Staff presented the plan." }],
          threadUpdates: [{ id: "sidewalk-plan", summary: "Plan presented." }],
        }),
      ],
    });
    const state = emptyState({ meetingIds: new Set(["2026-05-26"]) });
    const plan = planIngest([listed("2026-06-08"), listed("2026-06-22")], state, { limit: 3 }, "2026-11-17");
    const run = await runIngest({ plan, state, llm, model: "m", downloadPdf: async () => PDF, save: (r) => saved.push(r) });

    expect(run.stopped).toBeUndefined();
    expect(saved.map((r) => r.meeting.id)).toEqual(["2026-06-08", "2026-06-22"]);
    const second = calls.filter((c) => c.task === "extract")[1].instructions;
    expect(second).toMatch(/\[2026-06-08-fu-1\] raised 2026-06-08, owner staff, currently open: Bring back a sidewalk plan\./);
    expect(second).toMatch(/\[sidewalk-plan\] Sidewalk Plan/);
    expect(saved[1].resolvedFollowUps).toEqual([{ id: "2026-06-08-fu-1", status: "resolved", resolution: "Staff presented the plan." }]);
    expect(saved[1].threadUpdates).toEqual([{ id: "sidewalk-plan", summary: "Plan presented." }]);
    expect(state.openFollowUps).toEqual([]);
  });

  it("keeps finished meetings and stops at a failure", async () => {
    const saved: string[] = [];
    const { llm } = fakeLlm({ extract: [extraction()] });
    const state = emptyState();
    const plan = planIngest([listed("2026-06-08"), listed("2026-06-22"), listed("2026-07-13")], state, { limit: 5 }, "2026-11-17");
    const run = await runIngest({ plan, state, llm, model: "m", downloadPdf: async () => PDF, save: (r) => saved.push(r.meeting.id) });
    expect(saved).toEqual(["2026-06-08"]);
    expect(run.stopped?.date).toBe("2026-06-22");
    expect(buildReport(run, plan)).toMatch(/This run stopped early.*2026-06-22 failed.*not processed: 2026-06-22, 2026-07-13/);
  });
});

describe("buildReport", () => {
  it("lists split votes, updates and items to check, and shortens to fit", async () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-06-${String(i + 10).padStart(2, "0")}`);
    const long = "The board discussed the matter at length. ".repeat(40);
    const { llm } = fakeLlm({
      extract: dates.map(() => extraction({ tldr: long, newThreads: [] })),
      review: dates.map(() => ({ issues: [{ severity: "warning" as const, where: "tldr", problem: "Worth a look. ".repeat(60), evidence: "" }] })),
    });
    const state = emptyState();
    const plan = planIngest(dates.map((d) => listed(d)), state, { limit: 50 }, "2026-11-17");
    const run = await runIngest({ plan, state, llm, model: "m", downloadPdf: async () => PDF, save: () => {} });

    const full = buildReport(run, plan);
    expect(full).toMatch(/Merging publishes these meetings to the live site/);
    expect(full).toMatch(/Approve paving contract \(\$120,000\) — passed 2-1, against: mccall \(p\. 4\)/);
    expect(full).toMatch(/The board discussed the matter at length/);

    const short = buildReport(run, plan, 12_000);
    expect(short.length).toBeLessThanOrEqual(12_000);
    expect(short).toMatch(/Shortened to fit/);
    expect(short).not.toMatch(/The board discussed the matter at length/);
    for (const d of dates) expect(short).toMatch(new RegExp(`## ${d}`));
    expect(buildReport(run, plan, 2_000).length).toBeLessThanOrEqual(2_000);
  });
});
