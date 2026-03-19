import type { Meeting, FollowUpItem } from "./types";

// Import all meeting JSON files
// Each file in src/data/meetings/ is a single Meeting object
import meeting_2026_02_09 from "@/data/meetings/2026-02-09.json";

// Add new meeting imports here as they are committed:
// import meeting_YYYY_MM_DD from "@/data/meetings/YYYY-MM-DD.json";

const COMMITTED_MEETINGS: Meeting[] = [
  meeting_2026_02_09 as Meeting,
  // Add new meetings here
];

/** Returns all committed meeting data, sorted by date descending */
export function getMeetings(): Meeting[] {
  const deduped = new Map<string, Meeting>();
  for (const m of COMMITTED_MEETINGS) {
    deduped.set(m.id, m);
  }
  return Array.from(deduped.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/** Returns a single meeting by ID, or undefined */
export function getMeeting(id: string): Meeting | undefined {
  return COMMITTED_MEETINGS.find((m) => m.id === id);
}

/** Returns all follow-up items from all committed meetings, sorted by date descending */
export function getFollowUps(): FollowUpItem[] {
  const items: FollowUpItem[] = [];
  for (const m of COMMITTED_MEETINGS) {
    if (m.followUps) {
      items.push(...m.followUps);
    }
  }
  return items.sort((a, b) => b.dateRaised.localeCompare(a.dateRaised));
}
