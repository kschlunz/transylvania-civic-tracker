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

export interface FollowUpItem {
  id: string;
  dateRaised: string;
  /** Commissioner ID, staff name (e.g. "Jaime Laughter"), or "staff" as fallback */
  owner: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "dropped";
  categories: string[];
  relatedMeetingId: string;
  /** Most recent meeting where this item was referenced */
  lastReferencedMeetingId?: string;
  resolvedDate?: string;
  resolvedMeetingId?: string;
  resolution?: string;
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
