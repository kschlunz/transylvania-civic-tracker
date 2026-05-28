import type { Meeting, FollowUpItem, PublicStatement, TopicThread } from "./types";
import { supabase, isSupabaseEnabled } from "./supabase";
import {
  STEPPER_STAGES,
  type ActiveCycleSnapshot,
  type BudgetCycle,
  type BudgetCycleStage,
  type BudgetDocument,
  type BudgetDocumentStatus,
  type BudgetMilestone,
} from "./budget-cycle-types";

// ============================================
// LOCAL JSON FALLBACK
// ============================================
import meeting_2026_02_09 from "@/data/meetings/2026-02-09.json";

const LOCAL_MEETINGS: Meeting[] = [
  meeting_2026_02_09 as unknown as Meeting,
].map((m) => ({
  ...m,
  followUps: (m.followUps || []).map((fu) => ({ ...fu, type: fu.type || "action_item" })),
}));

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
    commissionerActivity: Object.fromEntries(
      Object.entries((row.commissioner_activity as Meeting["commissionerActivity"]) || {}).map(([id, activity]) => [
        id,
        {
          topics: (activity?.topics || []).map((t) => ({ ...t, categories: t.categories || [] })),
          motionsMade: activity?.motionsMade || 0,
          motionsSeconded: activity?.motionsSeconded || 0,
          externalRoles: activity?.externalRoles || [],
        },
      ])
    ),
    publicComments: (row.public_comments as Meeting["publicComments"]) || [],
    followUps: ((row.follow_ups as FollowUpItem[]) || []).map((fu) => ({ ...fu, type: fu.type || "action_item" })),
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
    type: (row.type as FollowUpItem["type"]) || "action_item",
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
// CLIENT-SIDE CACHE
// ============================================
let cachedMeetings: Meeting[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Clear the meetings cache (call after adding/updating a meeting) */
export function invalidateMeetingsCache() {
  cachedMeetings = null;
  cacheTimestamp = 0;
}

// ============================================
// PUBLIC API — same signatures, Supabase or local
// ============================================

/** Returns all meetings, sorted by date descending */
export async function getMeetingsAsync(): Promise<Meeting[]> {
  if (cachedMeetings && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedMeetings;
  }

  if (isSupabaseEnabled()) {
    const { data, error } = await supabase!
      .from("meetings")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Supabase getMeetings error:", error);
      return getLocalMeetings();
    }
    const meetings = (data || []).map(dbRowToMeeting);
    cachedMeetings = meetings;
    cacheTimestamp = Date.now();
    return meetings;
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

// ============================================
// BUDGET CYCLES
// ============================================

function dbRowToBudgetCycle(row: Record<string, unknown>): BudgetCycle {
  return {
    id: row.id as string,
    fiscalYear: row.fiscal_year as string,
    label: row.label as string,
    jurisdiction: (row.jurisdiction as string) || "Transylvania County",
    currentStage: row.current_stage as BudgetCycleStage,
    cycleStart: row.cycle_start ? (row.cycle_start as string).slice(0, 10) : null,
    adoptionDate: row.adoption_date ? (row.adoption_date as string).slice(0, 10) : null,
    fiscalYearStart: row.fiscal_year_start ? (row.fiscal_year_start as string).slice(0, 10) : null,
    isActive: row.is_active as boolean,
  };
}

function dbRowToBudgetMilestone(row: Record<string, unknown>): BudgetMilestone {
  return {
    id: row.id as string,
    cycleId: row.cycle_id as string,
    milestoneDate: (row.milestone_date as string).slice(0, 10),
    title: row.title as string,
    description: (row.description as string) || null,
    stage: (row.stage as BudgetCycleStage) || null,
    isPublicInput: row.is_public_input as boolean,
    isComplete: row.is_complete as boolean,
    location: (row.location as string) || null,
    livestreamUrl: (row.livestream_url as string) || null,
    sortOrder: (row.sort_order as number) || 0,
  };
}

function dbRowToBudgetDocument(row: Record<string, unknown>): BudgetDocument {
  return {
    id: row.id as string,
    cycleId: row.cycle_id as string,
    title: row.title as string,
    docStatus: row.doc_status as BudgetDocumentStatus,
    presentedDate: row.presented_date ? (row.presented_date as string).slice(0, 10) : null,
    sourceUrl: (row.source_url as string) || null,
    storagePath: (row.storage_path as string) || null,
    plainSummary: (row.plain_summary as string) || null,
    sortOrder: (row.sort_order as number) || 0,
  };
}

function todayIsoDate(): string {
  // Local timezone date in YYYY-MM-DD form to compare against milestone dates.
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computeSnapshot(
  cycle: BudgetCycle,
  milestones: BudgetMilestone[],
  documents: BudgetDocument[],
): ActiveCycleSnapshot {
  const today = todayIsoDate();
  const upcoming = milestones
    .filter((m) => m.milestoneDate >= today)
    .sort((a, b) => a.milestoneDate.localeCompare(b.milestoneDate));
  const nextPublicInput = upcoming.find((m) => m.isPublicInput) || null;
  const nextMilestone = upcoming[0] || null;

  let daysUntilAdoption: number | null = null;
  if (cycle.adoptionDate) {
    const adoption = new Date(cycle.adoptionDate + "T12:00:00").getTime();
    const now = new Date(today + "T12:00:00").getTime();
    const diff = Math.ceil((adoption - now) / (1000 * 60 * 60 * 24));
    daysUntilAdoption = diff > 0 ? diff : null;
  }

  const stageIndex = STEPPER_STAGES.indexOf(cycle.currentStage);
  return {
    cycle,
    milestones,
    documents,
    nextPublicInput,
    nextMilestone,
    daysUntilAdoption,
    currentStageIndex: stageIndex >= 0 ? stageIndex : 0,
  };
}

/**
 * Returns the active budget cycle with milestones, documents, and derived fields.
 * Safe to call from both client and server components.
 * Returns null if Supabase is not configured or no active cycle exists.
 */
export async function getActiveBudgetCycleAsync(): Promise<ActiveCycleSnapshot | null> {
  if (!isSupabaseEnabled() || !supabase) return null;

  const { data: cycleRow, error: cycleError } = await supabase
    .from("budget_cycles")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cycleError) {
    console.error("Supabase getActiveBudgetCycle (cycle) error:", cycleError);
    return null;
  }
  if (!cycleRow) return null;

  const cycle = dbRowToBudgetCycle(cycleRow);

  const [milestonesRes, documentsRes] = await Promise.all([
    supabase
      .from("budget_cycle_milestones")
      .select("*")
      .eq("cycle_id", cycle.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("budget_documents")
      .select("*")
      .eq("cycle_id", cycle.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (milestonesRes.error) console.error("Supabase milestones error:", milestonesRes.error);
  if (documentsRes.error) console.error("Supabase documents error:", documentsRes.error);

  const milestones = (milestonesRes.data || []).map(dbRowToBudgetMilestone);
  const documents = (documentsRes.data || []).map(dbRowToBudgetDocument);

  return computeSnapshot(cycle, milestones, documents);
}
