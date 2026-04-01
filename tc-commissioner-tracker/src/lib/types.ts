export interface Commissioner {
  id: string;
  name: string;
  role: string;
  since: string;
  color: string;
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface MeetingTopic {
  text: string;
  categories: string[];
}

export interface CommissionerActivity {
  topics: MeetingTopic[];
  motionsMade: number;
  motionsSeconded: number;
  externalRoles: string[];
}

export interface KeyVote {
  description: string;
  result: string;
  mover: string;
  seconder: string;
  background?: string;
  discussion?: string;
}

export interface PublicComment {
  speaker: string;
  summary: string;
}

export type FollowUpType = "action_item" | "report" | "long_term" | "ongoing";

export interface FollowUpItem {
  id: string;
  dateRaised: string;
  /** Commissioner ID, staff name (e.g. "Jaime Laughter"), or "staff" as fallback */
  owner: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "dropped";
  type: FollowUpType;  // defaults to "action_item" if missing from data
  categories: string[];
  relatedMeetingId: string;
  /** Most recent meeting where this item was referenced */
  lastReferencedMeetingId?: string;
  resolvedDate?: string;
  resolvedMeetingId?: string;
  resolution?: string;
}

export const OVERDUE_THRESHOLDS: Record<FollowUpType, number> = {
  action_item: 60,
  report: 90,
  long_term: 180,
  ongoing: Infinity,
};

export const FOLLOWUP_TYPE_LABELS: Record<FollowUpType, string> = {
  action_item: "Action Item",
  report: "Report",
  long_term: "Long-term Project",
  ongoing: "Ongoing",
};

export function isFollowUpOverdue(fu: FollowUpItem): boolean {
  if (fu.status === "resolved" || fu.status === "dropped") return false;
  const threshold = OVERDUE_THRESHOLDS[fu.type] || 60;
  const days = Math.floor((Date.now() - new Date(fu.dateRaised + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24));
  return days > threshold;
}

export function followUpDaysOpen(fu: FollowUpItem): number {
  return Math.floor((Date.now() - new Date(fu.dateRaised + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24));
}

export interface StaffActivityItem {
  name: string;
  role: string;
  items: string[];
}

export interface Meeting {
  id: string;
  date: string;
  type: string;
  time: string;
  attendees: string[];
  audienceSize: number;
  duration: string;
  tldr: string;
  keyVotes: KeyVote[];
  commissionerActivity: Record<string, CommissionerActivity>;
  publicComments: PublicComment[];
  followUps?: FollowUpItem[];
  staffActivity?: StaffActivityItem[];
  /** Thread references for votes/topics in this meeting */
  threadRefs?: Array<{ threadId: string; voteIndex?: number; topicText?: string }>;
  /** Link to the original minutes PDF on the county website */
  sourceUrl?: string;
  /** Link to the agenda PDF */
  agendaUrl?: string;
}

/** Generate the county minutes PDF URL from a meeting date and type */
export function getSourceUrl(date: string, type: string): string {
  const typeSlug = type === "special" ? "special%20mtg" : "reg%20mtg";
  return `https://www.transylvaniacounty.org/sites/default/files/departments/administration/minutes/${date}%20${typeSlug}.pdf`;
}

export interface ThreadMention {
  meetingId: string;
  date: string;
  summary: string;
}

export interface TopicThread {
  id: string;
  title: string;
  categories: string[];
  firstMentionedDate: string;
  firstMentionedMeetingId: string;
  status: "active" | "resolved" | "recurring";
  mentions: ThreadMention[];
}

export interface PublicStatement {
  date: string;
  source: string;
  type: "news" | "statement";
  text: string;
  url?: string;
  categories: string[];
}
