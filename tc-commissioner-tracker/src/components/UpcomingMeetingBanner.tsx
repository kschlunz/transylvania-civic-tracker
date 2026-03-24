"use client";

import upcoming from "@/data/upcoming.json";

export default function UpcomingMeetingBanner() {
  const meetingDate = new Date(upcoming.date + "T12:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const meetingDay = new Date(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());
  const daysUntil = Math.round((meetingDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Hide if the meeting date has passed
  if (daysUntil < 0) return null;

  const dateStr = meetingDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const daysLabel =
    daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `in ${daysUntil} days`;

  return (
    <div className="bg-primary text-on-primary px-4 md:px-8 lg:px-12 py-3 md:py-4">
      <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="material-symbols-outlined text-lg shrink-0">event</span>
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 min-w-0">
            <span className="font-label text-sm font-bold tracking-tight">
              Next Meeting: {dateStr} at {upcoming.time}
            </span>
            <span className="hidden md:inline text-on-primary/40">|</span>
            <span className="text-xs text-on-primary/80">{upcoming.location}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {(upcoming as { notes: string | null }).notes && (
            <span className="text-xs font-bold bg-on-primary/20 px-2 py-0.5 rounded">
              {(upcoming as { notes: string | null }).notes}
            </span>
          )}
          {upcoming.agendaUrl ? (
            <a
              href={upcoming.agendaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold underline underline-offset-2 hover:opacity-80 transition-opacity flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">description</span>
              Agenda posted
            </a>
          ) : (
            <span className="text-xs text-on-primary/50">Agenda not yet posted</span>
          )}
          <span className="text-xs font-bold bg-on-primary/15 px-2.5 py-1 rounded-full">
            {daysLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
