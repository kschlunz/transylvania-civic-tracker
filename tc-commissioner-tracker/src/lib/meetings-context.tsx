"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Meeting } from "./types";
import { getMeetings } from "./data";

const COMMITTED_MEETINGS = getMeetings();
const STORAGE_KEY = "tc-tracker-meetings";

function loadFromStorage(): Meeting[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Meeting[];
  } catch {
    return [];
  }
}

function saveToStorage(meetings: Meeting[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  } catch {
    // storage full or unavailable
  }
}

interface MeetingsContextValue {
  /** All meetings: committed JSON files + localStorage drafts */
  meetings: Meeting[];
  /** Set of meeting IDs that are drafts (localStorage only, not yet committed) */
  draftIds: Set<string>;
  /** Add a meeting as a draft (saves to localStorage) */
  addMeeting: (meeting: Meeting) => void;
}

const MeetingsContext = createContext<MeetingsContextValue | null>(null);

export function MeetingsProvider({ children }: { children: React.ReactNode }) {
  const [drafts, setDrafts] = useState<Meeting[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDrafts(loadFromStorage());
    setHydrated(true);
  }, []);

  const addMeeting = useCallback((meeting: Meeting) => {
    setDrafts((prev) => {
      const next = [meeting, ...prev.filter((m) => m.id !== meeting.id)];
      saveToStorage(next);
      return next;
    });
  }, []);

  // Committed IDs for deduplication
  const committedIds = new Set(COMMITTED_MEETINGS.map((m) => m.id));

  // Only drafts that haven't been committed yet
  const activeDrafts = drafts.filter((m) => !committedIds.has(m.id));
  const draftIds = new Set(activeDrafts.map((m) => m.id));

  // Merge: drafts first, then committed
  const meetings = [...activeDrafts, ...COMMITTED_MEETINGS];

  const stableMeetings = hydrated ? meetings : COMMITTED_MEETINGS;
  const stableDraftIds = hydrated ? draftIds : new Set<string>();

  return (
    <MeetingsContext.Provider value={{ meetings: stableMeetings, draftIds: stableDraftIds, addMeeting }}>
      {children}
    </MeetingsContext.Provider>
  );
}

export function useMeetings() {
  const ctx = useContext(MeetingsContext);
  if (!ctx) throw new Error("useMeetings must be used within MeetingsProvider");
  return ctx;
}
