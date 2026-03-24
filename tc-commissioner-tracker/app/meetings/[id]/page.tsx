"use client";

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { useParams } from "next/navigation";
import { COMMISSIONERS, CATEGORIES } from "@/lib/constants";
import { useMeetings } from "@/lib/meetings-context";
import VoteDetailModal from "@/components/VoteDetailModal";
import { type KeyVote, type TopicThread, getSourceUrl } from "@/lib/types";
import { getThreadsAsync } from "@/lib/data";

function getCommissionerName(id: string) {
  return COMMISSIONERS.find((c) => c.id === id)?.name ?? id;
}

function getCommissionerColor(id: string) {
  return COMMISSIONERS.find((c) => c.id === id)?.color ?? "#888";
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const { meetings } = useMeetings();
  const meeting = meetings.find((m) => m.id === id);
  if (!meeting) notFound();

  const [selectedVote, setSelectedVote] = useState<KeyVote | null>(null);
  const [threads, setThreads] = useState<TopicThread[]>([]);

  useEffect(() => {
    getThreadsAsync().then(setThreads).catch(() => setThreads([]));
  }, []);

  // Find threads that mention this meeting
  const meetingThreads = threads.filter((t) =>
    t.mentions.some((m) => m.meetingId === id)
  );

  function getThreadForVote(voteDescription: string): TopicThread | undefined {
    // Check if any thread mentions this meeting and its title relates to the vote
    return meetingThreads.find((t) => {
      const mention = t.mentions.find((m) => m.meetingId === id);
      if (!mention) return false;
      // Check if the vote description appears in the thread's mention summary or title
      const titleWords = t.title.toLowerCase().split(/\s+/);
      const descWords = voteDescription.toLowerCase();
      return titleWords.some((w) => w.length > 3 && descWords.includes(w));
    });
  }

  const dateStr = new Date(meeting.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const passedVotes = meeting.keyVotes.length;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 md:px-8 lg:px-12 py-8 md:py-16">
      {/* Meeting Header */}
      <header className="mb-12 md:mb-20 grid md:grid-cols-2 gap-6 md:gap-12 items-end">
        <div>
          <nav className="flex gap-2 text-on-surface-variant text-xs md:text-sm mb-4 md:mb-6 uppercase tracking-widest font-bold">
            <Link href="/meetings" className="hover:text-primary transition-colors">Session Record</Link>
            <span>/</span>
            <span className="text-primary capitalize">{meeting.type} Board Meeting</span>
          </nav>
          <h1 className="font-headline text-4xl md:text-5xl lg:text-7xl font-bold leading-tight text-primary">{dateStr}</h1>
          <a
            href={meeting.sourceUrl || getSourceUrl(meeting.date, meeting.type)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 text-xs font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
          >
            <span className="material-symbols-outlined text-sm">description</span>
            View official minutes (PDF) →
          </a>
        </div>
        <div className="flex flex-wrap gap-x-6 md:gap-x-12 gap-y-4 md:gap-y-6 md:justify-end pb-2">
          <div className="flex flex-col">
            <span className="text-on-surface-variant text-[10px] md:text-xs uppercase tracking-tighter mb-1 font-bold">Time commenced</span>
            <span className="text-lg md:text-2xl font-headline">{meeting.time}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-on-surface-variant text-[10px] md:text-xs uppercase tracking-tighter mb-1 font-bold">Total duration</span>
            <span className="text-lg md:text-2xl font-headline">{meeting.duration}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-on-surface-variant text-[10px] md:text-xs uppercase tracking-tighter mb-1 font-bold">Public Attendance</span>
            <span className="text-lg md:text-2xl font-headline">~{meeting.audienceSize} Audience</span>
          </div>
        </div>
      </header>

      {/* Executive Summary */}
      <section className="mb-12 md:mb-24">
        <div className="bg-surface-container-low p-6 md:p-12 lg:p-16 relative overflow-hidden">
          <div className="relative z-10 grid md:grid-cols-12 gap-6 md:gap-12">
            <div className="md:col-span-4">
              <h2 className="font-headline text-2xl md:text-4xl font-bold text-primary mb-3 md:mb-4 leading-none">Executive<br />Summary</h2>
              <div className="h-1 w-12 bg-primary mt-6" />
            </div>
            <div className="md:col-span-8">
              <p className="text-xl md:text-2xl leading-relaxed text-on-surface-variant font-headline italic">
                {meeting.tldr}
              </p>
            </div>
          </div>
          <div className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[300px]" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-10 md:gap-16">
        {/* Key Votes + Public Comments */}
        <div className="lg:col-span-2 space-y-12">
          {/* Key Votes */}
          <div className="flex items-center justify-between">
            <h3 className="font-headline text-3xl font-bold text-primary">Major Motions &amp; Votes</h3>
            <span className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">
              {passedVotes} Passed | 0 Failed
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {meeting.keyVotes.map((vote, i) => (
              <button key={i} onClick={() => setSelectedVote(vote)} className="bg-surface-container-lowest p-5 md:p-8 border-l-4 border-primary transition-all hover:shadow-xl text-left cursor-pointer min-h-[44px]">
                <div className="flex justify-between items-start mb-6">
                  {vote.result.toLowerCase() === "unanimous" ? (
                    <span className="bg-secondary-fixed text-on-secondary-fixed px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      Unanimous
                    </span>
                  ) : (
                    <span className="bg-surface-container-high text-on-surface-variant px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      {vote.result}
                    </span>
                  )}
                </div>
                <h4 className="text-2xl font-bold mb-4 font-headline">{vote.description}</h4>
                {vote.mover === "consent agenda" ? (
                  <p className="text-sm text-on-surface-variant">Consent Agenda</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Moved by</span>
                      <span className="font-bold">{getCommissionerName(vote.mover)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Seconded by</span>
                      <span className="font-bold">{getCommissionerName(vote.seconder)}</span>
                    </div>
                  </div>
                )}
                {(() => {
                  const thread = getThreadForVote(vote.description);
                  if (!thread) return null;
                  return (
                    <Link
                      href="/threads"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 mt-4 pt-3 border-t border-outline-variant/10 text-[10px] text-secondary font-bold uppercase tracking-wider hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">timeline</span>
                      Part of: {thread.title} ({thread.mentions.length} meeting{thread.mentions.length !== 1 ? "s" : ""})
                    </Link>
                  );
                })()}
              </button>
            ))}
          </div>

          {/* Public Comments */}
          {meeting.publicComments.length > 0 && (
            <div className="mt-12">
              <h3 className="font-headline text-3xl font-bold text-primary mb-8">Public Ledger of Record</h3>
              <div className="space-y-1">
                {meeting.publicComments.map((comment, i) => (
                  <div key={i} className="flex items-start gap-6 py-4 px-6 hover:bg-surface-container transition-colors rounded">
                    <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">record_voice_over</span>
                    <div>
                      <span className="font-bold text-sm">{comment.speaker}</span>
                      <p className="text-on-surface-variant text-sm leading-relaxed mt-1">{comment.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staff Presentations */}
          {meeting.staffActivity && meeting.staffActivity.length > 0 && (
            <div className="mt-12">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-secondary">groups</span>
                <h3 className="font-headline text-2xl md:text-3xl font-bold text-primary">Staff Presentations</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {meeting.staffActivity.map((staff) => (
                  <div key={staff.name} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5 md:p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-primary-fixed text-sm font-bold shrink-0">
                        {staff.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <Link href="/staff" className="font-headline text-lg font-bold text-primary hover:underline">{staff.name}</Link>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">{staff.role}</p>
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {staff.items.map((item, i) => (
                        <li key={i} className="text-sm text-on-surface-variant leading-relaxed flex items-start gap-2">
                          <span className="material-symbols-outlined text-[14px] text-secondary shrink-0 mt-0.5">chevron_right</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Commissioner Activity Sidebar */}
        <aside className="space-y-12">
          <div className="sticky top-24">
            <h3 className="font-headline text-3xl font-bold text-primary mb-10 border-b border-outline-variant/20 pb-4">
              Commission Activity
            </h3>
            <div className="space-y-12">
              {Object.entries(meeting.commissionerActivity).map(([commId, activity]) => (
                <div key={commId} className="relative pl-6">
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-full`} style={{ backgroundColor: getCommissionerColor(commId) }} />
                  <div className="mb-4">
                    <Link href={`/commissioners/${commId}`} className="text-xl font-bold hover:underline">
                      {getCommissionerName(commId)}
                    </Link>
                    <div className="flex gap-4 mt-2 text-[10px] font-bold uppercase tracking-tighter text-on-surface-variant">
                      <span>Motions: {activity.motionsMade}</span>
                      <span>Seconds: {activity.motionsSeconded}</span>
                    </div>
                    {activity.externalRoles.length > 0 && (
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mt-1">
                        {activity.externalRoles.join(", ")}
                      </p>
                    )}
                  </div>
                  <ul className="space-y-4">
                    {activity.topics.map((topic, i) => (
                      <li key={i} className="text-sm leading-relaxed">
                        <div className="flex flex-wrap gap-1 mb-1">
                          {topic.categories.map((catId) => {
                            const cat = CATEGORIES.find((c) => c.id === catId);
                            if (!cat) return null;
                            return (
                              <Link
                                key={catId}
                                href={`/topics/${catId}`}
                                className="bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded-full text-[9px] font-bold uppercase hover:opacity-80 transition-opacity"
                              >
                                {cat.label}
                              </Link>
                            );
                          })}
                        </div>
                        {topic.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Vote Detail Modal */}
      {selectedVote && (
        <VoteDetailModal vote={selectedVote} onClose={() => setSelectedVote(null)} />
      )}
    </div>
  );
}

