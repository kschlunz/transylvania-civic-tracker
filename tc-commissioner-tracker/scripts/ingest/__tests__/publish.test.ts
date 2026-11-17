import { describe, expect, it } from "vitest";
import { toRecord } from "../extraction";
import { meetingToRow, publishRecord, type Store, type ThreadRow } from "../publish";
import { extraction, listed } from "./helpers";

function memoryStore() {
  const meetings = new Map<string, Record<string, unknown>>();
  const followUps = new Map<string, Record<string, unknown>>();
  const threads = new Map<string, ThreadRow>();
  const store: Store = {
    async meetingIds() { return [...meetings.keys()]; },
    async openFollowUps() { return []; },
    async activeThreads() { return []; },
    async upsertMeeting(row) { meetings.set(row.id as string, row); },
    async upsertFollowUp(row) { followUps.set(row.id as string, { ...followUps.get(row.id as string), ...row }); },
    async updateFollowUp(id, changes) { if (followUps.has(id)) followUps.set(id, { ...followUps.get(id), ...changes }); },
    async getThread(id) { return threads.get(id) ?? null; },
    async upsertThread(row) { threads.set(row.id, row); },
  };
  return { store, meetings, followUps, threads };
}

describe("publishRecord", () => {
  it("writes the meeting row in the layout the site reads", () => {
    const row = meetingToRow(toRecord(extraction(), listed("2026-06-08"), "m"));
    expect(Object.keys(row).sort()).toEqual(
      ["agenda_url", "attendees", "audience_size", "commissioner_activity", "date", "duration", "follow_ups", "id", "key_votes", "public_comments", "source_url", "staff_activity", "time", "tldr", "type"].sort(),
    );
    expect(row.source_url).toBe(listed("2026-06-08").minutesUrl);
  });

  it("saves the meeting, its follow-ups and threads, and updates earlier items, idempotently", async () => {
    const { store, meetings, followUps, threads } = memoryStore();
    followUps.set("2026-05-26-fu-1", { id: "2026-05-26-fu-1", status: "open" });
    threads.set("new-courthouse-project", {
      id: "new-courthouse-project", title: "New Courthouse Project", categories: [], first_mentioned_date: "2025-01-13",
      first_mentioned_meeting_id: "2025-01-13", status: "active", mentions: [{ meetingId: "2025-01-13", date: "2025-01-13", summary: "First." }],
    });

    const record = toRecord(
      extraction({
        followUpUpdates: [{ id: "2026-05-26-fu-1", status: "resolved", resolution: "Done." }],
        threadUpdates: [{ id: "new-courthouse-project", summary: "Design update." }],
      }),
      listed("2026-06-08"),
      "m",
      new Set(["new-courthouse-project"]),
    );
    await publishRecord(record, store);
    await publishRecord(record, store);

    expect([...meetings.keys()]).toEqual(["2026-06-08"]);
    expect(followUps.get("2026-06-08-fu-1")).toMatchObject({ status: "open", type: "report", related_meeting_id: "2026-06-08" });
    expect(followUps.get("2026-05-26-fu-1")).toMatchObject({ status: "resolved", resolution: "Done.", resolved_meeting_id: "2026-06-08", resolved_date: "2026-06-08", last_referenced_meeting_id: "2026-06-08" });
    expect(threads.get("sidewalk-plan")).toMatchObject({ first_mentioned_meeting_id: "2026-06-08", status: "active", mentions: [{ meetingId: "2026-06-08", date: "2026-06-08", summary: "Requested by the public." }] });
    expect(threads.get("new-courthouse-project")!.mentions.map((m) => m.meetingId)).toEqual(["2025-01-13", "2026-06-08"]);
  });

  it("marks an item in progress without closing it", async () => {
    const { store, followUps } = memoryStore();
    followUps.set("2026-05-26-fu-1", { id: "2026-05-26-fu-1", status: "open" });
    const record = toRecord(extraction({ followUpUpdates: [{ id: "2026-05-26-fu-1", status: "in_progress", resolution: "Bids opened." }] }), listed("2026-06-08"), "m");
    await publishRecord(record, store);
    expect(followUps.get("2026-05-26-fu-1")).toEqual({ id: "2026-05-26-fu-1", status: "in_progress", resolution: "Bids opened.", last_referenced_meeting_id: "2026-06-08" });
  });
});
