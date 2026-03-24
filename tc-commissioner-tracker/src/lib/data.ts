import type { Meeting, FollowUpItem, PublicStatement, TopicThread } from "./types";
import { supabase, isSupabaseEnabled } from "./supabase";

// ============================================
// LOCAL JSON FALLBACK
// ============================================
import meeting_2026_02_09 from "@/data/meetings/2026-02-09.json";

const LOCAL_MEETINGS: Meeting[] = [
  meeting_2026_02_09 as Meeting,
];

// ============================================
// SUPABASE → MEETING TYPE MAPPER
// ============================================
function dbRowToMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: row.id as string,
    date: (row.date as string).slice(0, 10),
    type: (row.type as string) || "regular",
    time: (row.time as string) || "",
    attendees: (row.attendees as string[]) || [],
    audienceSize: (row.audience_size as number) || 0,
    duration: (row.duration as string) || "",
    tldr: (row.tldr as string) || "",
    keyVotes: (row.key_votes as Meeting["keyVotes"]) || [],
    commissionerActivity: (row.commissioner_activity as Meeting["commissionerActivity"]) || {},
    publicComments: (row.public_comments as Meeting["publicComments"]) || [],
    followUps: (row.follow_ups as FollowUpItem[]) || [],
    staffActivity: (row.staff_activity as Meeting["staffActivity"]) || [],
    sourceUrl: (row.source_url as string) || undefined,
    agendaUrl: (row.agenda_url as string) || undefined,
  };
}

function dbRowToFollowUp(row: Record<string, unknown>): FollowUpItem {
  return {
    id: row.id as string,
    dateRaised: (row.date_raised as string).slice(0, 10),
    owner: (row.owner as string) || "staff",
    description: (row.description as string) || "",
    status: (row.status as FollowUpItem["status"]) || "open",
    categories: (row.categories as string[]) || [],
    relatedMeetingId: (row.related_meeting_id as string) || "",
    resolvedDate: row.resolved_date ? (row.resolved_date as string).slice(0, 10) : undefined,
    resolvedMeetingId: (row.resolved_meeting_id as string) || undefined,
    resolution: (row.resolution as string) || undefined,
    lastReferencedMeetingId: (row.last_referenced_meeting_id as string) || undefined,
  };
}

function dbRowToStatement(row: Record<string, unknown>): { commissionerId: string; statement: PublicStatement } {
  return {
    commissionerId: row.commissioner_id as string,
    statement: {
      date: (row.date as string).slice(0, 10),
      source: (row.source as string) || "",
      type: (row.type as PublicStatement["type"]) || "statement",
      text: (row.text as string) || "",
      url: (row.url as string) || undefined,
      categories: (row.categories as string[]) || [],
    },
  };
}

// ============================================
// PUBLIC API — same signatures, Supabase or local
// ============================================

/** Returns all meetings, sorted by date descending */
export async function getMeetingsAsync(): Promise<Meeting[]> {
  if (isSupabaseEnabled()) {
    const { data, error } = await supabase!
      .from("meetings")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Supabase getMeetings error:", error);
      return getLocalMeetings();
    }
    return (data || []).map(dbRowToMeeting);
  }
  return getLocalMeetings();
}

/** Returns a single meeting by ID */
export async function getMeetingAsync(id: string): Promise<Meeting | undefined> {
  if (isSupabaseEnabled()) {
    const { data, error } = await supabase!
      .from("meetings")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return getLocalMeeting(id);
    return dbRowToMeeting(data);
  }
  return getLocalMeeting(id);
}

/** Returns all follow-up items, sorted by date descending */
export async function getFollowUpsAsync(): Promise<FollowUpItem[]> {
  if (isSupabaseEnabled()) {
    const { data, error } = await supabase!
      .from("follow_ups")
      .select("*")
      .order("date_raised", { ascending: false });

    if (error) {
      console.error("Supabase getFollowUps error:", error);
      return getLocalFollowUps();
    }
    return (data || []).map(dbRowToFollowUp);
  }
  return getLocalFollowUps();
}

/** Returns all public statements grouped by commissioner */
export async function getPublicStatementsAsync(): Promise<Record<string, PublicStatement[]>> {
  if (isSupabaseEnabled()) {
    const { data, error } = await supabase!
      .from("public_statements")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Supabase getPublicStatements error:", error);
      return getLocalPublicStatements();
    }

    const result: Record<string, PublicStatement[]> = {};
    for (const row of data || []) {
      const { commissionerId, statement } = dbRowToStatement(row);
      if (!result[commissionerId]) result[commissionerId] = [];
      result[commissionerId].push(statement);
    }
    return result;
  }
  return getLocalPublicStatements();
}

// ============================================
// SYNCHRONOUS LOCAL ACCESSORS (for SSR / context init)
// ============================================

export function getMeetings(): Meeting[] {
  return getLocalMeetings();
}

export function getMeeting(id: string): Meeting | undefined {
  return getLocalMeeting(id);
}

export function getFollowUps(): FollowUpItem[] {
  return getLocalFollowUps();
}

// ============================================
// LOCAL DATA HELPERS
// ============================================

function getLocalMeetings(): Meeting[] {
  const deduped = new Map<string, Meeting>();
  for (const m of LOCAL_MEETINGS) {
    deduped.set(m.id, m);
  }
  return Array.from(deduped.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function getLocalMeeting(id: string): Meeting | undefined {
  return LOCAL_MEETINGS.find((m) => m.id === id);
}

function getLocalFollowUps(): FollowUpItem[] {
  const items: FollowUpItem[] = [];
  for (const m of LOCAL_MEETINGS) {
    if (m.followUps) {
      items.push(...m.followUps);
    }
  }
  return items.sort((a, b) => b.dateRaised.localeCompare(a.dateRaised));
}

// ============================================
// RELATED MEETINGS
// ============================================

export interface RelatedMeetingSummary {
  id: string;
  date: string;
  tldr: string;
}

/**
 * For a given meeting, find other meetings that share topic categories.
 * Returns a map of category ID → array of related meeting summaries.
 * Only includes categories that appear in at least `minOtherMeetings` other meetings.
 */
export function getRelatedMeetings(
  meetingId: string,
  allMeetings: Meeting[],
  minOtherMeetings: number = 2,
): Record<string, RelatedMeetingSummary[]> {
  const meeting = allMeetings.find((m) => m.id === meetingId);
  if (!meeting) return {};

  // Collect all categories used in this meeting
  const meetingCategories = new Set<string>();
  for (const activity of Object.values(meeting.commissionerActivity)) {
    for (const topic of activity.topics) {
      for (const cat of topic.categories) {
        meetingCategories.add(cat);
      }
    }
  }
  // For each category, find other meetings that also discuss it
  const result: Record<string, RelatedMeetingSummary[]> = {};

  for (const catId of meetingCategories) {
    const related: RelatedMeetingSummary[] = [];

    for (const other of allMeetings) {
      if (other.id === meetingId) continue;

      let hasCategory = false;
      for (const activity of Object.values(other.commissionerActivity)) {
        for (const topic of activity.topics) {
          if (topic.categories.includes(catId)) {
            hasCategory = true;
            break;
          }
        }
        if (hasCategory) break;
      }

      if (hasCategory) {
        related.push({
          id: other.id,
          date: other.date,
          tldr: other.tldr.slice(0, 120),
        });
      }
    }

    if (related.length >= minOtherMeetings) {
      result[catId] = related.sort((a, b) => a.date.localeCompare(b.date));
    }
  }

  return result;
}

/**
 * Count how many unique other meetings share at least one topic category with a given meeting.
 */
export function getRelatedMeetingCount(meetingId: string, allMeetings: Meeting[]): number {
  const meeting = allMeetings.find((m) => m.id === meetingId);
  if (!meeting) return 0;

  const meetingCategories = new Set<string>();
  for (const activity of Object.values(meeting.commissionerActivity)) {
    for (const topic of activity.topics) {
      for (const cat of topic.categories) {
        meetingCategories.add(cat);
      }
    }
  }

  const relatedIds = new Set<string>();
  for (const other of allMeetings) {
    if (other.id === meetingId) continue;
    for (const activity of Object.values(other.commissionerActivity)) {
      for (const topic of activity.topics) {
        if (topic.categories.some((c) => meetingCategories.has(c))) {
          relatedIds.add(other.id);
          break;
        }
      }
      if (relatedIds.has(other.id)) break;
    }
  }

  return relatedIds.size;
}

// ============================================
// TOPIC THREADS
// ============================================

function dbRowToThread(row: Record<string, unknown>): TopicThread {
  return {
    id: row.id as string,
    title: row.title as string,
    categories: (row.categories as string[]) || [],
    firstMentionedDate: (row.first_mentioned_date as string).slice(0, 10),
    firstMentionedMeetingId: (row.first_mentioned_meeting_id as string) || "",
    status: (row.status as TopicThread["status"]) || "active",
    mentions: (row.mentions as TopicThread["mentions"]) || [],
  };
}

/** Fetch all topic threads from Supabase */
export async function getThreadsAsync(): Promise<TopicThread[]> {
  if (isSupabaseEnabled()) {
    const { data, error } = await supabase!
      .from("topic_threads")
      .select("*")
      .order("first_mentioned_date", { ascending: false });

    if (error) {
      console.error("Supabase getThreads error:", error);
      return [];
    }
    return (data || []).map(dbRowToThread);
  }
  return [];
}

/** Fetch a single thread by ID */
export async function getThreadAsync(id: string): Promise<TopicThread | undefined> {
  if (isSupabaseEnabled()) {
    const { data, error } = await supabase!
      .from("topic_threads")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return undefined;
    return dbRowToThread(data);
  }
  return undefined;
}

/** Upsert a topic thread into Supabase. Throws on failure. */
export async function upsertThread(thread: TopicThread): Promise<void> {
  if (!isSupabaseEnabled() || !supabase) {
    console.warn("upsertThread: Supabase not enabled, skipping");
    return;
  }

  const row = {
    id: thread.id,
    title: thread.title,
    categories: thread.categories,
    first_mentioned_date: thread.firstMentionedDate,
    first_mentioned_meeting_id: thread.firstMentionedMeetingId,
    status: thread.status,
    mentions: thread.mentions,
  };

  console.log(`[upsertThread] Upserting thread "${thread.id}":`, JSON.stringify(row, null, 2));

  const { error } = await supabase
    .from("topic_threads")
    .upsert(row);

  if (error) {
    console.error(`[upsertThread] Failed to upsert thread "${thread.id}":`, error);
    throw new Error(`Failed to save thread "${thread.title}": ${error.message}`);
  }

  console.log(`[upsertThread] Successfully saved thread "${thread.id}"`);
}

function getLocalPublicStatements(): Record<string, PublicStatement[]> {
  // Import from the existing public-statements file
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PUBLIC_STATEMENTS } = require("./public-statements");
    return PUBLIC_STATEMENTS;
  } catch {
    return {};
  }
}
