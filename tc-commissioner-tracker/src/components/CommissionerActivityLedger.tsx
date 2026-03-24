"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CATEGORIES, CATEGORY_ICONS } from "@/lib/constants";
import Pagination, { paginate } from "@/components/Pagination";
import type { Meeting, FollowUpItem, CommissionerActivity } from "@/lib/types";

type Tab = "all" | "motions" | "by-topic" | "follow-ups";

interface MeetingCard {
  meetingId: string;
  date: string;
  activity: CommissionerActivity;
  motionsMoved: { description: string; result: string }[];
  motionsSeconded: { description: string; result: string }[];
  followUpsCreated: FollowUpItem[];
  followUpsResolved: FollowUpItem[];
}

interface Props {
  commissionerId: string;
  meetings: Meeting[];
  allMeetings: Meeting[];
  meetingActivities: { meetingId: string; date: string; activity: CommissionerActivity }[];
  followUps: FollowUpItem[];
}

function formatDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateShort(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CommissionerActivityLedger({ commissionerId, meetings, allMeetings, meetingActivities, followUps }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Reset page when tab changes
  const switchTab = (t: Tab) => { setTab(t); setPage(1); setExpandedMeeting(null); setExpandedCategory(null); };

  // Build enriched meeting cards
  const cards: MeetingCard[] = useMemo(() => {
    return meetingActivities
      .map((ma) => {
        const meeting = meetings.find((m) => m.id === ma.meetingId);
        const motionsMoved: MeetingCard["motionsMoved"] = [];
        const motionsSeconded: MeetingCard["motionsSeconded"] = [];
        if (meeting) {
          for (const vote of meeting.keyVotes) {
            if (vote.mover === commissionerId) motionsMoved.push({ description: vote.description, result: vote.result });
            if (vote.seconder === commissionerId) motionsSeconded.push({ description: vote.description, result: vote.result });
          }
        }
        const followUpsCreated = (meeting?.followUps || []).filter((fu) => fu.owner === commissionerId && fu.relatedMeetingId === ma.meetingId);
        const followUpsResolved = followUps.filter((fu) => fu.resolvedMeetingId === ma.meetingId || fu.lastReferencedMeetingId === ma.meetingId);
        return { ...ma, motionsMoved, motionsSeconded, followUpsCreated, followUpsResolved };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [meetingActivities, meetings, commissionerId, followUps]);

  // Summary stats
  const totalTopics = meetingActivities.reduce((s, ma) => s + ma.activity.topics.length, 0);
  const totalMotions = useMemo(() => {
    let count = 0;
    for (const m of meetings) {
      for (const v of m.keyVotes) {
        if (v.mover === commissionerId || v.seconder === commissionerId) count++;
      }
    }
    return count;
  }, [meetings, commissionerId]);

  // Tabs config
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "all", label: "All Activity", icon: "list" },
    { id: "motions", label: "Motions", icon: "gavel" },
    { id: "by-topic", label: "By Topic", icon: "category" },
    { id: "follow-ups", label: "Follow-ups", icon: "pending_actions" },
  ];

  // Filtered cards for motions tab
  const motionCards = useMemo(() => cards.filter((c) => c.motionsMoved.length > 0 || c.motionsSeconded.length > 0), [cards]);

  // By-topic grouping
  const topicGroups = useMemo(() => {
    const groups: Record<string, { text: string; date: string; meetingId: string }[]> = {};
    for (const ma of meetingActivities) {
      for (const topic of ma.activity.topics) {
        for (const catId of topic.categories) {
          if (!groups[catId]) groups[catId] = [];
          groups[catId].push({ text: topic.text, date: ma.date, meetingId: ma.meetingId });
        }
      }
    }
    // Sort by count descending
    return Object.entries(groups)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([catId, items]) => ({ catId, items: items.sort((a, b) => b.date.localeCompare(a.date)) }));
  }, [meetingActivities]);

  // Follow-ups split
  const openFUs = followUps.filter((f) => f.status === "open" || f.status === "in_progress");
  const resolvedFUs = followUps.filter((f) => f.status === "resolved" || f.status === "dropped");

  function renderMeetingCard(card: MeetingCard) {
    const isExpanded = expandedMeeting === card.meetingId;
    const topicCount = card.activity.topics.length;
    const motionCount = card.motionsMoved.length + card.motionsSeconded.length;
    const fuCount = card.followUpsCreated.length;

    return (
      <div key={card.meetingId} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedMeeting(isExpanded ? null : card.meetingId)}
          className="w-full text-left p-5 md:p-6 flex items-start gap-4 hover:bg-surface-container-low/50 transition-colors min-h-[44px]"
        >
          <div className="flex-1 min-w-0">
            <Link
              href={`/meetings/${card.meetingId}`}
              onClick={(e) => e.stopPropagation()}
              className="font-headline text-lg font-bold text-primary hover:underline"
            >
              {formatDate(card.date)}
            </Link>
            <p className="text-xs text-on-surface-variant mt-1">
              {topicCount} topic{topicCount !== 1 ? "s" : ""}
              {motionCount > 0 && <> · {motionCount} motion{motionCount !== 1 ? "s" : ""}</>}
              {fuCount > 0 && <> · {fuCount} follow-up{fuCount !== 1 ? "s" : ""}</>}
            </p>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform mt-1" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            expand_more
          </span>
        </button>

        {isExpanded && (
          <div className="px-5 md:px-6 pb-6 border-t border-outline-variant/10 pt-4 space-y-4">
            {/* Motions initiated */}
            {card.motionsMoved.map((m, i) => (
              <div key={`moved-${i}`} className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">gavel</span>
                <div>
                  <p className="text-sm font-bold text-on-surface">{m.description}</p>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed mt-1 inline-block">
                    Moved · {m.result}
                  </span>
                </div>
              </div>
            ))}

            {/* Topics / statements */}
            {card.activity.topics.map((topic, i) => (
              <div key={`topic-${i}`} className="flex items-start gap-3">
                <span className="material-symbols-outlined text-secondary text-lg shrink-0 mt-0.5">chat_bubble_outline</span>
                <div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{topic.text}</p>
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {topic.categories.map((catId) => {
                      const cat = CATEGORIES.find((c) => c.id === catId);
                      const icon = CATEGORY_ICONS[catId];
                      if (!cat) return null;
                      return (
                        <Link key={catId} href={`/topics/${catId}`} className="inline-flex items-center gap-0.5 text-[9px] font-bold px-2 py-0.5 bg-secondary-fixed text-on-secondary-fixed rounded-full uppercase hover:opacity-80">
                          {icon && <span className="material-symbols-outlined text-[11px]">{icon}</span>}
                          {cat.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* Motions seconded */}
            {card.motionsSeconded.map((m, i) => (
              <div key={`seconded-${i}`} className="flex items-start gap-3 opacity-70">
                <span className="material-symbols-outlined text-outline text-lg shrink-0 mt-0.5">how_to_vote</span>
                <div>
                  <p className="text-sm text-on-surface-variant">{m.description}</p>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant mt-1 inline-block">
                    Seconded · {m.result}
                  </span>
                </div>
              </div>
            ))}

            {/* Follow-ups created */}
            {card.followUpsCreated.map((fu) => (
              <div key={fu.id} className="flex items-start gap-3">
                <span className="material-symbols-outlined text-error text-lg shrink-0 mt-0.5">pending_actions</span>
                <div>
                  <p className="text-sm text-on-surface leading-relaxed">{fu.description}</p>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-error/10 text-error mt-1 inline-block">
                    Follow-up created
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-6">
        <span>{cards.length} meetings</span>
        <span className="text-outline-variant">·</span>
        <span>{totalTopics} topics</span>
        <span className="text-outline-variant">·</span>
        <span>{totalMotions} motions</span>
        <span className="text-outline-variant">·</span>
        <span>{followUps.length} follow-ups</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 overflow-x-auto border-b border-outline-variant/20">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-label font-bold uppercase tracking-wider transition-colors whitespace-nowrap border-b-2 -mb-px ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-primary hover:border-primary/30"
            }`}
          >
            <span className="material-symbols-outlined text-sm">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "all" && (
        <div id="activity-ledger" className="space-y-3">
          {cards.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic py-8">No meeting activity in the selected time period.</p>
          ) : (
            <>
              {paginate(cards, page).paginated.map(renderMeetingCard)}
              <Pagination currentPage={page} totalPages={paginate(cards, page).totalPages} onPageChange={setPage} scrollTargetId="activity-ledger" />
            </>
          )}
        </div>
      )}

      {tab === "motions" && (
        <div id="motions-ledger" className="space-y-3">
          {motionCards.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic py-8">No motions in the selected time period.</p>
          ) : (
            <>
              {paginate(motionCards, page).paginated.map((card) => (
                <div key={card.meetingId} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-5 md:p-6">
                  <Link href={`/meetings/${card.meetingId}`} className="font-headline text-lg font-bold text-primary hover:underline">
                    {formatDate(card.date)}
                  </Link>
                  <div className="mt-4 space-y-3">
                    {card.motionsMoved.map((m, i) => (
                      <div key={`m-${i}`} className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">gavel</span>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{m.description}</p>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed mt-1 inline-block">
                            Moved · {m.result}
                          </span>
                        </div>
                      </div>
                    ))}
                    {card.motionsSeconded.map((m, i) => (
                      <div key={`s-${i}`} className="flex items-start gap-3 opacity-70">
                        <span className="material-symbols-outlined text-outline text-lg shrink-0 mt-0.5">how_to_vote</span>
                        <div>
                          <p className="text-sm text-on-surface-variant">{m.description}</p>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant mt-1 inline-block">
                            Seconded · {m.result}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <Pagination currentPage={page} totalPages={paginate(motionCards, page).totalPages} onPageChange={setPage} scrollTargetId="motions-ledger" />
            </>
          )}
        </div>
      )}

      {tab === "by-topic" && (
        <div id="topic-groups" className="space-y-3">
          {topicGroups.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic py-8">No topics in the selected time period.</p>
          ) : (
            topicGroups.map(({ catId, items }) => {
              const cat = CATEGORIES.find((c) => c.id === catId);
              const icon = CATEGORY_ICONS[catId];
              if (!cat) return null;
              const isExpanded = expandedCategory === catId;
              return (
                <div key={catId} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : catId)}
                    className="w-full text-left p-5 md:p-6 flex items-center gap-3 hover:bg-surface-container-low/50 transition-colors min-h-[44px]"
                  >
                    {icon && <span className="material-symbols-outlined text-secondary">{icon}</span>}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/topics/${catId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-headline text-lg font-bold text-primary hover:underline"
                      >
                        {cat.label}
                      </Link>
                      <p className="text-xs text-on-surface-variant">{items.length} item{items.length !== 1 ? "s" : ""} across {new Set(items.map((i) => i.meetingId)).size} meetings</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                      expand_more
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-5 md:px-6 pb-6 border-t border-outline-variant/10 pt-4 space-y-4">
                      {items.map((item, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <Link href={`/meetings/${item.meetingId}`} className="text-xs font-bold text-secondary shrink-0 mt-0.5 hover:underline whitespace-nowrap">
                            {formatDateShort(item.date)}
                          </Link>
                          <p className="text-sm text-on-surface-variant leading-relaxed">{item.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "follow-ups" && (
        <div id="followup-ledger" className="space-y-8">
          {followUps.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic py-8">No follow-up items for this commissioner.</p>
          ) : (
            <>
              {openFUs.length > 0 && (
                <div>
                  <h3 className="font-headline text-xl font-bold text-primary mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-error">pending_actions</span>
                    Open Items ({openFUs.length})
                  </h3>
                  <div className="space-y-3">
                    {openFUs.map((fu) => {
                      const days = Math.floor((Date.now() - new Date(fu.dateRaised + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24));
                      const daysColor = days > 120 ? "text-error" : days >= 60 ? "text-amber-600" : "text-on-surface-variant";
                      return (
                        <div key={fu.id} className="bg-surface-container-lowest border border-outline-variant/20 p-4 md:p-5 rounded-lg">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${fu.status === "in_progress" ? "bg-tertiary-fixed text-on-tertiary-fixed-variant" : "bg-error/10 text-error"}`}>
                              {fu.status === "in_progress" ? "In Progress" : "Open"}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${daysColor}`}>{days} days</span>
                          </div>
                          <p className="text-sm text-on-surface leading-relaxed">{fu.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant flex-wrap">
                            <Link href={`/meetings/${fu.relatedMeetingId}`} className="hover:underline">
                              {formatDateShort(fu.dateRaised)}
                            </Link>
                            <div className="flex gap-1">
                              {fu.categories.map((catId) => {
                                const cat = CATEGORIES.find((c) => c.id === catId);
                                const icon = CATEGORY_ICONS[catId];
                                if (!cat) return null;
                                return (
                                  <Link key={catId} href={`/topics/${catId}`} className="inline-flex items-center gap-0.5 bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded-full text-[9px] font-bold uppercase hover:opacity-80">
                                    {icon && <span className="material-symbols-outlined text-[11px]">{icon}</span>}
                                    {cat.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {resolvedFUs.length > 0 && (
                <div>
                  <h3 className="font-headline text-xl font-bold text-primary mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">task_alt</span>
                    Resolved ({resolvedFUs.length})
                  </h3>
                  <div className="space-y-3">
                    {resolvedFUs.map((fu) => (
                      <div key={fu.id} className="bg-surface-container-low border border-outline-variant/10 p-4 md:p-5 rounded-lg opacity-70">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed">
                            {fu.status === "dropped" ? "Dropped" : "Resolved"}
                          </span>
                        </div>
                        <p className="text-sm text-on-surface-variant">{fu.description}</p>
                        {fu.resolution && <p className="text-xs text-secondary mt-1 italic">{fu.resolution}</p>}
                        <div className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant">
                          <Link href={`/meetings/${fu.relatedMeetingId}`} className="hover:underline">
                            {formatDateShort(fu.dateRaised)}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
