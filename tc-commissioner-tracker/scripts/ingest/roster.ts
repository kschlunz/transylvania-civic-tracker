/**
 * Who sat on the board when. The extraction only offers the model the
 * commissioners seated on a meeting's date, and the checks reject anyone else.
 *
 * Ids must match COMMISSIONERS in src/lib/constants.ts so the site can show names.
 */
export interface RosterEntry {
  id: string;
  name: string;
  /** Terms on the board. `end` is the day the next person took the seat. */
  terms: { start: string; end?: string }[];
}

export const ROSTER: RosterEntry[] = [
  { id: "mccall", name: "Teresa McCall", terms: [{ start: "2020-12-07" }] },
  { id: "chapman", name: "Larry Chapman", terms: [{ start: "2010-12-06" }] },
  { id: "chappell", name: "Jason Chappell", terms: [{ start: "2004-12-06" }] },
  { id: "dalton", name: "Jake Dalton", terms: [{ start: "2020-12-07", end: "2026-12-07" }] },
  { id: "mckelvey", name: "Chase McKelvey", terms: [{ start: "2024-12-02", end: "2026-12-07" }] },
  { id: "carson", name: "Owen Carson", terms: [{ start: "2026-12-07" }] },
  { id: "oneill", name: "Bryan O'Neill", terms: [{ start: "2026-12-07" }] },
];

export function seatedOn(entry: RosterEntry, date: string): boolean {
  return entry.terms.some((t) => t.start <= date && (t.end === undefined || date < t.end));
}

export function seatedRoster(date: string, roster: RosterEntry[] = ROSTER): RosterEntry[] {
  return roster.filter((r) => seatedOn(r, date));
}

/** Today's date as YYYY-MM-DD in the county's time zone. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}
