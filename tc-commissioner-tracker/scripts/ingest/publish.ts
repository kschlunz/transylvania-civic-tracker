/**
 * Applying a reviewed record to Supabase, the same way the batch and intake
 * scripts do: the meeting row, its new follow-ups, status changes to earlier
 * follow-ups, and topic threads.
 *
 * Supabase is reached through the small `Store` interface so this can be
 * tested without a database (see __tests__/publish.test.ts).
 */
import type { IngestRecord } from "./record";
import type { PipelineState } from "./state";

export interface ThreadRow {
  id: string;
  title: string;
  categories: string[];
  first_mentioned_date: string;
  first_mentioned_meeting_id: string;
  status: "active" | "resolved" | "recurring";
  mentions: { meetingId: string; date: string; summary: string }[];
}

export interface Store {
  /** Ids and dates of every meeting in the database. */
  meetingIds(): Promise<string[]>;
  openFollowUps(): Promise<PipelineState["openFollowUps"]>;
  activeThreads(): Promise<PipelineState["activeThreads"]>;
  upsertMeeting(row: Record<string, unknown>): Promise<void>;
  upsertFollowUp(row: Record<string, unknown>): Promise<void>;
  updateFollowUp(id: string, changes: Record<string, unknown>): Promise<void>;
  getThread(id: string): Promise<ThreadRow | null>;
  upsertThread(row: ThreadRow): Promise<void>;
}

/** The meetings row, in the column layout the site reads (see dbRowToMeeting in src/lib/data.ts). */
export function meetingToRow(record: IngestRecord): Record<string, unknown> {
  const m = record.meeting;
  return {
    id: m.id,
    date: m.date,
    type: m.type,
    time: m.time,
    attendees: m.attendees,
    audience_size: m.audienceSize,
    duration: m.duration,
    tldr: m.tldr,
    key_votes: m.keyVotes,
    commissioner_activity: m.commissionerActivity,
    public_comments: m.publicComments,
    follow_ups: m.followUps,
    staff_activity: m.staffActivity,
    source_url: m.sourceUrl,
    agenda_url: m.agendaUrl ?? null,
  };
}

/** Apply one record. Safe to run twice: rows are upserted and thread mentions are not duplicated. */
export async function publishRecord(record: IngestRecord, store: Store, log: (line: string) => void = () => {}): Promise<void> {
  const { meeting } = record;
  const date = meeting.id;

  await store.upsertMeeting(meetingToRow(record));
  log(`  ${date}: meeting saved`);

  for (const fu of meeting.followUps) {
    await store.upsertFollowUp({
      id: fu.id,
      date_raised: fu.dateRaised,
      owner: fu.owner,
      description: fu.description,
      status: fu.status,
      type: fu.type,
      categories: fu.categories,
      related_meeting_id: fu.relatedMeetingId,
    });
  }
  if (meeting.followUps.length > 0) log(`  ${date}: ${meeting.followUps.length} new follow-up(s)`);

  for (const r of record.resolvedFollowUps) {
    await store.updateFollowUp(r.id, {
      status: r.status,
      resolution: r.resolution,
      last_referenced_meeting_id: date,
      ...(r.status === "resolved" ? { resolved_meeting_id: date, resolved_date: date } : {}),
    });
    log(`  ${date}: follow-up ${r.id} → ${r.status}`);
  }

  for (const t of record.newThreads) {
    const existing = await store.getThread(t.id);
    if (existing) {
      // Created by an earlier publish of this same record, or by the intake; treat as a mention.
      await addMention(store, existing, date, t.summary);
      continue;
    }
    await store.upsertThread({
      id: t.id,
      title: t.title,
      categories: t.categories,
      first_mentioned_date: date,
      first_mentioned_meeting_id: date,
      status: "active",
      mentions: [{ meetingId: date, date, summary: t.summary }],
    });
    log(`  ${date}: new thread ${t.id}`);
  }

  for (const t of record.threadUpdates) {
    const existing = await store.getThread(t.id);
    if (!existing) {
      log(`  ${date}: thread ${t.id} not found, mention skipped`);
      continue;
    }
    await addMention(store, existing, date, t.summary);
  }
}

async function addMention(store: Store, thread: ThreadRow, date: string, summary: string): Promise<void> {
  if (thread.mentions.some((m) => m.meetingId === date)) return;
  await store.upsertThread({ ...thread, mentions: [...thread.mentions, { meetingId: date, date, summary }] });
}
