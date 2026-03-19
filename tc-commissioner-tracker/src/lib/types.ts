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
}

export interface PublicStatement {
  date: string;
  source: string;
  type: "news" | "statement";
  text: string;
  url?: string;
  categories: string[];
}
