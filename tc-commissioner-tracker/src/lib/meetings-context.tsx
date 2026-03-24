"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Meeting } from "./types";
import { getMeetings, getMeetingsAsync, invalidateMeetingsCache } from "./data";
import { supabase, isSupabaseEnabled } from "./supabase";

const LOCAL_MEETINGS = getMeetings();

interface MeetingsContextValue {
  /** All meetings from Supabase (or local JSON fallback) */
  meetings: Meeting[];
  /** Add a meeting — inserts into Supabase, then refreshes local state */
  addMeeting: (meeting: Meeting) => Promise<void>;
  /** Whether data has loaded */
  ready: boolean;
}

const MeetingsContext = createContext<MeetingsContextValue | null>(null);

/** Convert a Meeting object to Supabase row format */
function meetingToRow(meeting: Meeting) {
  return {
    id: meeting.id,
    date: meeting.date,
    type: meeting.type,
    time: meeting.time,
    attendees: meeting.attendees,
    audience_size: meeting.audienceSize,
    duration: meeting.duration,
    tldr: meeting.tldr,
    key_votes: meeting.keyVotes,
    commissioner_activity: meeting.commissionerActivity,
    public_comments: meeting.publicComments,
    follow_ups: meeting.followUps || [],
    staff_activity: meeting.staffActivity || [],
    source_url: meeting.sourceUrl || null,
    agenda_url: meeting.agendaUrl || null,
  };
}

export function MeetingsProvider({ children }: { children: React.ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>(LOCAL_MEETINGS);
  const [ready, setReady] = useState(false);

  // Load from Supabase on mount
  useEffect(() => {
    if (isSupabaseEnabled()) {
      getMeetingsAsync()
        .then((sbMeetings) => {
          if (sbMeetings.length > 0) {
            setMeetings(sbMeetings);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch from Supabase, using local data:", err);
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  const addMeeting = useCallback(async (meeting: Meeting) => {
    if (isSupabaseEnabled() && supabase) {
      // Insert meeting into Supabase
      const { error: meetingError } = await supabase
        .from("meetings")
        .upsert(meetingToRow(meeting));

      if (meetingError) {
        console.error("Failed to insert meeting into Supabase:", meetingError);
        throw new Error(`Failed to save meeting: ${meetingError.message}`);
      }

      // Insert follow-ups into Supabase
      if (meeting.followUps && meeting.followUps.length > 0) {
        for (const fu of meeting.followUps) {
          const { error: fuError } = await supabase
            .from("follow_ups")
            .upsert({
              id: fu.id,
              date_raised: fu.dateRaised,
              owner: fu.owner || "staff",
              description: fu.description,
              status: fu.status || "open",
              categories: fu.categories || [],
              related_meeting_id: fu.relatedMeetingId || meeting.id,
              resolved_date: fu.resolvedDate || null,
              resolved_meeting_id: fu.resolvedMeetingId || null,
              resolution: fu.resolution || null,
              last_referenced_meeting_id: fu.lastReferencedMeetingId || null,
            });

          if (fuError) {
            console.error(`Failed to insert follow-up ${fu.id}:`, fuError);
          }
        }
      }

      // Refresh meetings from Supabase
      invalidateMeetingsCache();
      const refreshed = await getMeetingsAsync();
      if (refreshed.length > 0) {
        setMeetings(refreshed);
      }
    } else {
      // Fallback: add to local state only (no persistence)
      setMeetings((prev) => {
        const filtered = prev.filter((m) => m.id !== meeting.id);
        return [meeting, ...filtered];
      });
    }
  }, []);

  return (
    <MeetingsContext.Provider value={{ meetings, addMeeting, ready }}>
      {children}
    </MeetingsContext.Provider>
  );
}

export function useMeetings() {
  const ctx = useContext(MeetingsContext);
  if (!ctx) throw new Error("useMeetings must be used within MeetingsProvider");
  return ctx;
}
