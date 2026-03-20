"use client";

import { useState, useMemo } from "react";
import type { Meeting, FollowUpItem, TopicThread } from "@/lib/types";
import { COMMISSIONERS, CATEGORIES, CATEGORY_ICONS } from "@/lib/constants";
import { useMeetings } from "@/lib/meetings-context";
import { getThreadsAsync, upsertThread } from "@/lib/data";

function getCommissionerName(id: string) {
  if (id === "staff") return "County Staff";
  return COMMISSIONERS.find((c) => c.id === id)?.name ?? id;
}

function getCommissionerColor(id: string) {
  return COMMISSIONERS.find((c) => c.id === id)?.color ?? "#888";
}

interface ResolvedFollowUp {
  id: string;
  status: "in_progress" | "resolved";
  resolution: string;
}

interface NewThread {
  id: string;
  title: string;
  categories: string[];
  summary: string;
}

interface ThreadUpdate {
  id: string;
  summary: string;
}

interface ProcessedResult {
  meeting: Meeting;
  resolvedFollowUps: ResolvedFollowUp[];
  newThreads: NewThread[];
  threadUpdates: ThreadUpdate[];
}

interface MeetingIntakeFormProps {
  onAccept: (meeting: Meeting, acceptedResolutions: ResolvedFollowUp[]) => Promise<void>;
  onClose: () => void;
}

export default function MeetingIntakeForm({ onAccept, onClose }: MeetingIntakeFormProps) {
  const { meetings } = useMeetings();
  const [minutesText, setMinutesText] = useState("");
  const [result, setResult] = useState<ProcessedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [rejectedResolutions, setRejectedResolutions] = useState<Set<string>>(new Set());

  // Gather all open follow-ups from all meetings
  const openFollowUps = useMemo(() => {
    const items: FollowUpItem[] = [];
    for (const m of meetings) {
      if (m.followUps) {
        items.push(...m.followUps.filter((f) => f.status === "open" || f.status === "in_progress"));
      }
    }
    // Also check localStorage overrides
    let overrides: Record<string, string> = {};
    try {
      overrides = JSON.parse(localStorage.getItem("tc-followup-status") || "{}");
    } catch { /* ignore */ }
    return items.filter((f) => {
      const override = overrides[f.id];
      return !override || override === "open" || override === "in_progress";
    });
  }, [meetings]);

  async function handleProcess() {
    setLoading(true);
    setError(null);
    setResult(null);
    setElapsed(0);
    setRejectedResolutions(new Set());

    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);

    try {
      // Fetch active threads to pass to the API
      let activeThreads: { id: string; title: string }[] = [];
      try {
        const threads = await getThreadsAsync();
        activeThreads = threads
          .filter((t) => t.status === "active" || t.status === "recurring")
          .map((t) => ({ id: t.id, title: t.title }));
      } catch { /* no threads yet is fine */ }

      const res = await fetch("/api/process-minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minutesText,
          openFollowUps: openFollowUps.map((f) => ({
            id: f.id,
            dateRaised: f.dateRaised,
            owner: f.owner,
            description: f.description,
          })),
          activeThreads,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to process minutes");
      }

      const data = await res.json();

      const { resolvedFollowUps = [], newThreads = [], threadUpdates = [], ...meetingData } = data;

      setResult({
        meeting: meetingData as Meeting,
        resolvedFollowUps: resolvedFollowUps as ResolvedFollowUp[],
        newThreads: newThreads as NewThread[],
        threadUpdates: threadUpdates as ThreadUpdate[],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  function handleRetry() {
    setResult(null);
    setError(null);
    setElapsed(0);
    setToast(null);
    setRejectedResolutions(new Set());
  }

  function toggleResolution(id: string) {
    setRejectedResolutions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const [saving, setSaving] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  async function handleAccept() {
    if (!result) return;

    // Check if a meeting with this date already exists
    const existing = meetings.find((m) => m.id === result.meeting.id);
    if (existing && !confirmOverwrite) {
      setConfirmOverwrite(true);
      setToast(`A meeting for ${new Date(result.meeting.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} already exists. Click save again to overwrite.`);
      return;
    }

    const acceptedResolutions = result.resolvedFollowUps.filter(
      (r) => !rejectedResolutions.has(r.id)
    );

    setSaving(true);
    setConfirmOverwrite(false);
    const threadErrors: string[] = [];
    try {
      // Save new threads
      console.log(`[handleAccept] Saving ${result.newThreads.length} new thread(s)...`);
      for (const nt of result.newThreads) {
        console.log(`[handleAccept] Creating new thread: "${nt.title}" (${nt.id})`);
        try {
          await upsertThread({
            id: nt.id,
            title: nt.title,
            categories: nt.categories,
            firstMentionedDate: result.meeting.date,
            firstMentionedMeetingId: result.meeting.id,
            status: "active",
            mentions: [{ meetingId: result.meeting.id, date: result.meeting.date, summary: nt.summary }],
          });
        } catch (err) {
          const msg = `New thread "${nt.title}": ${err instanceof Error ? err.message : "unknown error"}`;
          console.error(`[handleAccept] ${msg}`);
          threadErrors.push(msg);
        }
      }

      // Update existing threads with new mentions
      console.log(`[handleAccept] Updating ${result.threadUpdates.length} existing thread(s)...`);
      if (result.threadUpdates.length > 0) {
        // Fetch all threads once, not per-update
        let existingThreads: import("@/lib/types").TopicThread[] = [];
        try {
          existingThreads = await getThreadsAsync();
          console.log(`[handleAccept] Fetched ${existingThreads.length} existing threads from Supabase`);
        } catch (err) {
          console.error("[handleAccept] Failed to fetch existing threads:", err);
        }

        for (const tu of result.threadUpdates) {
          console.log(`[handleAccept] Updating thread: "${tu.id}" with summary: "${tu.summary.slice(0, 80)}..."`);
          const existing = existingThreads.find((t) => t.id === tu.id);
          if (!existing) {
            console.warn(`[handleAccept] Thread "${tu.id}" not found in Supabase — creating as new`);
            try {
              await upsertThread({
                id: tu.id,
                title: tu.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                categories: [],
                firstMentionedDate: result.meeting.date,
                firstMentionedMeetingId: result.meeting.id,
                status: "active",
                mentions: [{ meetingId: result.meeting.id, date: result.meeting.date, summary: tu.summary }],
              });
            } catch (err) {
              const msg = `Thread update "${tu.id}" (created as new): ${err instanceof Error ? err.message : "unknown error"}`;
              console.error(`[handleAccept] ${msg}`);
              threadErrors.push(msg);
            }
            continue;
          }

          const alreadyMentioned = existing.mentions.some((m) => m.meetingId === result.meeting.id);
          if (!alreadyMentioned) {
            existing.mentions.push({ meetingId: result.meeting.id, date: result.meeting.date, summary: tu.summary });
            existing.mentions.sort((a, b) => a.date.localeCompare(b.date));
          }
          try {
            await upsertThread(existing);
          } catch (err) {
            const msg = `Thread update "${tu.id}": ${err instanceof Error ? err.message : "unknown error"}`;
            console.error(`[handleAccept] ${msg}`);
            threadErrors.push(msg);
          }
        }
      }

      // Save meeting and follow-ups
      await onAccept(result.meeting, acceptedResolutions);

      if (threadErrors.length > 0) {
        setToast(`Meeting saved but ${threadErrors.length} thread error(s): ${threadErrors[0]}`);
      } else {
        const threadCount = result.newThreads.length + result.threadUpdates.length;
        setToast(`Meeting saved successfully.${threadCount > 0 ? ` ${threadCount} thread(s) updated.` : ""}`);
      }
    } catch (err) {
      setToast(`Error saving: ${err instanceof Error ? err.message : "Unknown error"}`);
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  const meeting = result?.meeting ?? null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-6">
      <div className="absolute inset-0 bg-primary/20 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-surface-bright shadow-2xl rounded-t-xl md:rounded-xl overflow-hidden border border-outline-variant/30 flex flex-col max-h-[95vh] md:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6 border-b border-outline-variant/10">
          <h2 className="font-headline text-xl md:text-3xl font-extrabold text-primary tracking-tight">
            Add New Deliberations
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-8 overflow-y-auto flex-1">
          {!meeting ? (
            <>
              <p className="text-on-surface-variant font-body text-sm mb-8 leading-relaxed">
                Our system will parse key decisions, voting records, and thematic shifts to update the ledger.
                {openFollowUps.length > 0 && (
                  <span className="block mt-2 text-secondary font-bold">
                    {openFollowUps.length} open follow-up{openFollowUps.length !== 1 ? "s" : ""} will be checked for resolution.
                  </span>
                )}
              </p>

              <div className="relative">
                <label className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary block mb-1.5">
                  Transcript or Summary
                </label>
                <textarea
                  value={minutesText}
                  onChange={(e) => setMinutesText(e.target.value)}
                  disabled={loading}
                  placeholder="Paste raw meeting minutes or transcript here..."
                  className="w-full h-64 bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 font-body text-on-surface text-sm leading-relaxed focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all resize-none disabled:opacity-60"
                />
              </div>

              {loading && (
                <div className="flex items-center gap-3 mt-6 text-sm text-on-surface-variant">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="font-label">Processing meeting data... {elapsed}s</span>
                </div>
              )}

              {error && (
                <div className="mt-6 bg-error-container text-on-error-container rounded-lg p-4 text-sm font-body">
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              <MeetingPreview meeting={meeting} />

              {/* Follow-up Updates section */}
              {result && result.resolvedFollowUps.length > 0 && (
                <div className="mt-8">
                  <h4 className="font-headline font-bold text-primary text-xl mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">update</span>
                    Follow-up Updates ({result.resolvedFollowUps.length})
                  </h4>
                  <p className="text-xs text-on-surface-variant mb-4">
                    Claude identified these open follow-ups as addressed in this meeting. Uncheck any that are incorrect.
                  </p>
                  <div className="space-y-3">
                    {result.resolvedFollowUps.map((resolved) => {
                      const original = openFollowUps.find((f) => f.id === resolved.id);
                      const rejected = rejectedResolutions.has(resolved.id);

                      return (
                        <div
                          key={resolved.id}
                          className={`border rounded-lg p-5 transition-all ${
                            rejected
                              ? "border-outline-variant/20 bg-surface-container-low opacity-50"
                              : "border-secondary/30 bg-secondary-fixed/20"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleResolution(resolved.id)}
                              className="mt-0.5 shrink-0"
                            >
                              <span className={`material-symbols-outlined text-lg ${rejected ? "text-outline" : "text-secondary"}`}>
                                {rejected ? "check_box_outline_blank" : "check_box"}
                              </span>
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  resolved.status === "resolved"
                                    ? "bg-secondary-fixed text-on-secondary-fixed"
                                    : "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                                }`}>
                                  {resolved.status === "resolved" ? "Resolved" : "In Progress"}
                                </span>
                                {original && (
                                  <span className="text-[10px] text-on-surface-variant">
                                    Originally raised {new Date(original.dateRaised + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} by {getCommissionerName(original.owner)}
                                  </span>
                                )}
                              </div>
                              {original && (
                                <p className="text-sm text-on-surface-variant mb-2">{original.description}</p>
                              )}
                              <p className="text-sm text-on-surface font-medium">
                                <span className="material-symbols-outlined text-[14px] mr-1 align-middle">arrow_forward</span>
                                {resolved.resolution}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Topic Threads */}
              {result && (result.newThreads.length > 0 || result.threadUpdates.length > 0) && (
                <div className="mt-8">
                  <h4 className="font-headline font-bold text-primary text-xl mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">timeline</span>
                    Topic Threads ({result.newThreads.length + result.threadUpdates.length})
                  </h4>
                  <div className="space-y-3">
                    {result.newThreads.map((nt) => (
                      <div key={nt.id} className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">New Thread</span>
                        </div>
                        <p className="text-sm font-bold text-on-surface">{nt.title}</p>
                        <p className="text-sm text-on-surface-variant mt-1">{nt.summary}</p>
                        <div className="flex gap-1 mt-2">
                          {nt.categories.map((catId) => {
                            const cat = CATEGORIES.find((c) => c.id === catId);
                            return cat ? (
                              <span key={catId} className="bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded-full text-[9px] font-bold uppercase">{cat.label}</span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    ))}
                    {result.threadUpdates.map((tu) => (
                      <div key={tu.id} className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-secondary/10 text-secondary">Thread Update</span>
                          <span className="text-[10px] text-on-surface-variant">{tu.id}</span>
                        </div>
                        <p className="text-sm text-on-surface-variant">{tu.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Follow-ups */}
              {meeting.followUps && meeting.followUps.length > 0 && (
                <div className="mt-8">
                  <h4 className="font-headline font-bold text-primary text-xl mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">pending_actions</span>
                    New Follow-ups ({meeting.followUps.length})
                  </h4>
                  <div className="space-y-3">
                    {meeting.followUps.map((fu) => (
                      <div key={fu.id} className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-error/10 text-error">Open</span>
                          <span className="text-[10px] text-on-surface-variant font-bold">
                            {getCommissionerName(fu.owner)}
                          </span>
                        </div>
                        <p className="text-sm text-on-surface">{fu.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className="mx-8 mb-2 bg-primary-container text-on-primary-container rounded-lg p-4 text-sm font-label flex items-start gap-3">
            <span className="material-symbols-outlined text-primary-fixed text-lg shrink-0">content_paste</span>
            <span>{toast}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-4 md:px-8 py-4 md:py-6 bg-surface-container-low flex flex-col-reverse md:flex-row justify-end gap-3 md:gap-4 border-t border-outline-variant/10 sticky bottom-0">
          {!meeting ? (
            <>
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-label font-bold text-on-surface-variant hover:text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleProcess}
                disabled={loading || !minutesText.trim()}
                className="bg-primary text-on-primary px-8 py-3 rounded shadow-lg hover:bg-primary-container transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">analytics</span>
                <span className="font-label text-sm font-bold">
                  {loading ? `Processing... (${elapsed}s)` : "Process Meeting Data"}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleRetry}
                className="px-6 py-2.5 text-sm font-label font-bold text-on-surface-variant hover:text-primary transition-colors"
              >
                Reject / Try Again
              </button>
              <button
                onClick={handleAccept}
                disabled={saving}
                className="bg-primary text-on-primary px-8 py-3 rounded shadow-lg hover:bg-primary-container transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">{saving ? "hourglass_empty" : "save"}</span>
                <span className="font-label text-sm font-bold">{saving ? "Saving..." : "Accept & Save"}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingPreview({ meeting }: { meeting: Meeting }) {
  return (
    <div className="space-y-8">
      <div className="bg-secondary-fixed text-on-secondary-fixed rounded-lg p-4 text-sm font-label font-bold flex items-center gap-2">
        <span className="material-symbols-outlined text-sm">check_circle</span>
        Successfully extracted meeting data. Review below before saving.
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-lg">
        <h3 className="font-headline text-2xl font-bold text-primary">
          {new Date(meeting.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </h3>
        <p className="text-sm text-on-surface-variant capitalize mt-1">
          {meeting.type} meeting · {meeting.time} · {meeting.duration} · ~{meeting.audienceSize} audience
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          {meeting.attendees.map((id) => (
            <span
              key={id}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: getCommissionerColor(id) }}
            >
              {getCommissionerName(id)}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/20 p-6 rounded-lg">
        <h4 className="font-headline font-bold text-primary mb-2">Summary</h4>
        <p className="text-sm text-on-surface-variant leading-relaxed">{meeting.tldr}</p>
      </div>

      {meeting.keyVotes.length > 0 && (
        <div>
          <h4 className="font-headline font-bold text-primary text-xl mb-4">
            Key Votes ({meeting.keyVotes.length})
          </h4>
          <div className="space-y-3">
            {meeting.keyVotes.map((vote, i) => (
              <div key={i} className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-on-surface">{vote.description}</p>
                  <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed whitespace-nowrap">
                    {vote.result}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-2">
                  {vote.mover === "consent agenda" ? (
                    "Consent Agenda"
                  ) : (
                    <>
                      Moved by{" "}
                      <span className="font-bold text-on-surface">{getCommissionerName(vote.mover)}</span>
                      {" · Seconded by "}
                      <span className="font-bold text-on-surface">{getCommissionerName(vote.seconder)}</span>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="font-headline font-bold text-primary text-xl mb-4">Commissioner Activity</h4>
        <div className="space-y-4">
          {Object.entries(meeting.commissionerActivity).map(([commId, activity]) => (
            <div key={commId} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden">
              <div className="h-1" style={{ backgroundColor: getCommissionerColor(commId) }} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-headline text-lg font-bold text-primary">{getCommissionerName(commId)}</h5>
                  <div className="flex gap-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span>{activity.motionsMade} motions made</span>
                    <span>{activity.motionsSeconded} seconded</span>
                    {activity.externalRoles.length > 0 && (
                      <span className="text-secondary">{activity.externalRoles.join(", ")}</span>
                    )}
                  </div>
                </div>
                <ul className="space-y-3">
                  {activity.topics.map((topic, i) => (
                    <li key={i}>
                      <p className="text-sm text-on-surface leading-relaxed">{topic.text}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {topic.categories.map((catId) => {
                          const cat = CATEGORIES.find((c) => c.id === catId);
                          const icon = CATEGORY_ICONS[catId];
                          if (!cat) return null;
                          return (
                            <span
                              key={catId}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 border border-outline-variant/20 text-on-surface-variant uppercase rounded"
                            >
                              {icon && <span className="material-symbols-outlined text-[12px]">{icon}</span>}
                              {cat.label}
                            </span>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {meeting.publicComments.length > 0 && (
        <div>
          <h4 className="font-headline font-bold text-primary text-xl mb-4">
            Public Comments ({meeting.publicComments.length})
          </h4>
          <div className="space-y-3">
            {meeting.publicComments.map((comment, i) => (
              <div key={i} className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-lg">
                <p className="font-bold text-sm text-on-surface">{comment.speaker}</p>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">{comment.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
