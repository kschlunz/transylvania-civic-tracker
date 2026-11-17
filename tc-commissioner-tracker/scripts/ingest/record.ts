/**
 * The file the ingest job writes for each meeting (data/ingest/<date>.json).
 * It is reviewed in a pull request and applied to Supabase when merged
 * (scripts/publish-meetings.ts). Editing the file before merging changes what
 * gets published.
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const categories = z.array(z.string());

export const RollCallSchema = z.object({
  ayes: z.array(z.string()),
  nays: z.array(z.string()),
  abstained: z.array(z.string()),
  absent: z.array(z.string()),
});

export const KeyVoteSchema = z.object({
  description: z.string().min(1),
  /** "Unanimous", "4-1", or "Passed"/"Failed" when the roll call is not recorded. */
  result: z.string().min(1),
  /** Commissioner id, "consent agenda", or "" when the minutes name nobody. */
  mover: z.string(),
  seconder: z.string(),
  background: z.string(),
  discussion: z.string(),
  passed: z.boolean(),
  consent: z.boolean(),
  /** How each commissioner voted; null when the minutes do not say. */
  votes: RollCallSchema.nullable(),
  /** 1-indexed page of the minutes PDF. */
  page: z.number().int().positive().nullable(),
});

export const FollowUpSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-fu-\d+$/),
  dateRaised: isoDate,
  owner: z.string().min(1),
  description: z.string().min(1),
  status: z.literal("open"),
  type: z.enum(["action_item", "report", "long_term", "ongoing"]),
  categories,
  relatedMeetingId: isoDate,
});

export const MeetingSchema = z.object({
  id: isoDate,
  date: isoDate,
  type: z.enum(["regular", "special", "workshop"]),
  time: z.string(),
  attendees: z.array(z.string()).min(1),
  audienceSize: z.number().int().nonnegative(),
  duration: z.string(),
  tldr: z.string().min(1),
  keyVotes: z.array(KeyVoteSchema),
  commissionerActivity: z.record(
    z.string(),
    z.object({
      topics: z.array(z.object({ text: z.string(), categories })),
      motionsMade: z.number().int().nonnegative(),
      motionsSeconded: z.number().int().nonnegative(),
      externalRoles: z.array(z.string()),
    }),
  ),
  publicComments: z.array(z.object({ speaker: z.string(), summary: z.string() })),
  staffActivity: z.array(z.object({ name: z.string(), role: z.string(), items: z.array(z.string()) })),
  followUps: z.array(FollowUpSchema),
  sourceUrl: z.string().url(),
  agendaUrl: z.string().url().optional(),
});

export const IngestRecordSchema = z.object({
  meeting: MeetingSchema,
  /** Earlier follow-ups this meeting moved forward or completed. */
  resolvedFollowUps: z.array(z.object({ id: z.string(), status: z.enum(["in_progress", "resolved"]), resolution: z.string() })),
  newThreads: z.array(z.object({ id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), title: z.string(), categories, summary: z.string() })),
  threadUpdates: z.array(z.object({ id: z.string(), summary: z.string() })),
  extraction: z.object({
    model: z.string(),
    extractedAt: z.string(),
    revised: z.boolean(),
    /** Concerns from the automated checks for the reviewer. Not published. */
    warnings: z.array(z.string()),
  }),
});

export type IngestRecord = z.infer<typeof IngestRecordSchema>;
export type IngestMeeting = z.infer<typeof MeetingSchema>;
export type IngestKeyVote = z.infer<typeof KeyVoteSchema>;
