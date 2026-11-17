/**
 * What the next meeting's extraction needs to know: which follow-ups are
 * still open and which topic threads exist. Starts from Supabase and is
 * updated in memory as each meeting in a run is extracted, so a run covering
 * several meetings carries follow-ups forward in date order.
 */
import type { ActiveThread, OpenFollowUp } from "./extraction";
import type { IngestRecord } from "./record";

export interface PipelineState {
  /** Meetings already in Supabase or waiting in data/ingest. */
  meetingIds: Set<string>;
  openFollowUps: OpenFollowUp[];
  activeThreads: ActiveThread[];
}

/** Open follow-ups raised before the given meeting date. */
export function openBefore(state: PipelineState, date: string): OpenFollowUp[] {
  return state.openFollowUps.filter((f) => f.dateRaised < date);
}

/** Fold a record into the state, as publishing it would. */
export function applyToState(state: PipelineState, record: IngestRecord): void {
  const { meeting } = record;
  state.meetingIds.add(meeting.id);
  for (const u of record.resolvedFollowUps) {
    const item = state.openFollowUps.find((f) => f.id === u.id);
    if (!item) continue;
    if (u.status === "resolved") state.openFollowUps = state.openFollowUps.filter((f) => f.id !== u.id);
    else item.status = "in_progress";
  }
  for (const f of meeting.followUps) {
    state.openFollowUps.push({ id: f.id, dateRaised: f.dateRaised, owner: f.owner, description: f.description, status: "open" });
  }
  for (const t of record.newThreads) {
    if (!state.activeThreads.some((a) => a.id === t.id)) state.activeThreads.push({ id: t.id, title: t.title });
  }
}
