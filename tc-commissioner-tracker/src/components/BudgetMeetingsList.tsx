import Link from "next/link";
import type { Meeting } from "@/lib/types";

function formatLongDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function meetingTypeLabel(type: string): string {
  const map: Record<string, string> = {
    regular: "Regular Meeting",
    special: "Special Meeting",
    workshop: "Workshop",
    closed: "Closed Session",
  };
  return map[type] || "Meeting";
}

function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max).trimEnd() + "…";
}

interface BudgetMeetingsListProps {
  meetings: Meeting[];
  publicHearingDate?: string | null;
}

export default function BudgetMeetingsList({
  meetings,
  publicHearingDate,
}: BudgetMeetingsListProps) {
  if (meetings.length === 0) return null;

  return (
    <ul className="space-y-4">
      {meetings.map((m) => {
        const isPublicHearing = publicHearingDate && m.date === publicHearingDate;
        return (
          <li key={m.id}>
            <Link
              href={`/meetings/${m.id}`}
              className={`block bg-surface-container-lowest border ${
                isPublicHearing
                  ? "border-secondary/40 bg-secondary-fixed/40"
                  : "border-outline-variant/20"
              } rounded-lg p-4 md:p-5 hover:border-primary/30 transition-colors`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <span className="text-[10px] font-label font-bold uppercase tracking-widest text-secondary">
                  {formatLongDate(m.date)}
                </span>
                <span className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant/60">
                  {meetingTypeLabel(m.type)}
                </span>
                {isPublicHearing && (
                  <span className="inline-flex items-center px-2 py-0.5 bg-secondary text-on-secondary rounded-full text-[9px] font-bold uppercase tracking-tighter">
                    Public Hearing
                  </span>
                )}
              </div>
              {m.tldr && (
                <p className="text-sm md:text-[15px] text-on-surface leading-relaxed">
                  {truncate(m.tldr, 220)}
                </p>
              )}
              <span className="inline-flex items-center gap-1 mt-3 text-[11px] font-label font-bold uppercase tracking-wider text-primary">
                Read meeting
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
