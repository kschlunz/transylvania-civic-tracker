"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { COMMISSIONERS, CATEGORIES, CATEGORY_ICONS, ELECTION_INFO } from "@/lib/constants";
import budgetJson from "@/data/budget-fy26.json";
import type { BudgetData } from "@/lib/budget-types";
import { useMeetings } from "@/lib/meetings-context";
import { parseFiltersFromParams, filterMeetings } from "@/lib/filters";
import { getFollowUpsAsync } from "@/lib/data";
import { isSupabaseEnabled } from "@/lib/supabase";
import UpcomingMeetingBanner from "@/components/UpcomingMeetingBanner";
import { type FollowUpItem, type Meeting, isFollowUpOverdue } from "@/lib/types";
import { announcements as announcementsData } from "@/data/announcements";

function getCommissionerStats(commissionerId: string, meetings: ReturnType<typeof useMeetings>["meetings"]) {
  let topicCount = 0;
  let motionsMade = 0;
  let motionsSeconded = 0;
  let meetingsPresent = 0;

  for (const meeting of meetings) {
    if (!meeting.attendees.includes(commissionerId)) continue;
    meetingsPresent++;
    const activity = meeting.commissionerActivity[commissionerId];
    if (!activity) continue;
    topicCount += (activity.topics || []).length;
    motionsMade += activity.motionsMade || 0;
    motionsSeconded += activity.motionsSeconded || 0;
  }

  return { meetingsPresent, topicCount, motionsMade, motionsSeconded };
}

function getTopicCounts(meetings: ReturnType<typeof useMeetings>["meetings"]) {
  const counts: Record<string, number> = {};
  for (const meeting of meetings) {
    for (const activity of Object.values(meeting.commissionerActivity)) {
      for (const topic of activity.topics || []) {
        for (const cat of topic.categories || []) {
          counts[cat] = (counts[cat] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function getOwnerDisplayName(owner: string) {
  const commissioner = COMMISSIONERS.find((c) => c.id === owner);
  if (commissioner) return commissioner.name;
  if (owner === "staff") return "County Staff";
  return owner;
}

function daysSince(dateStr: string) {
  const raised = new Date(dateStr + "T12:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - raised.getTime()) / (1000 * 60 * 60 * 24));
}

function HeroStats({ meetings }: { meetings: Meeting[] }) {
  const [followUps, setFollowUps] = useState<FollowUpItem[]>(() => {
    const items: FollowUpItem[] = [];
    for (const m of meetings) {
      if (m.followUps) items.push(...m.followUps);
    }
    return items;
  });

  useEffect(() => {
    if (isSupabaseEnabled()) {
      getFollowUpsAsync().then((sbItems) => {
        if (sbItems.length > 0) setFollowUps(sbItems);
      }).catch(() => {});
    }
  }, []);

  const openCount = followUps.filter((f) => f.status === "open" || f.status === "in_progress").length;
  const ongoingCount = followUps.filter((f) => (f.status === "open" || f.status === "in_progress") && f.type === "ongoing").length;
  const overdueCount = followUps.filter((f) => isFollowUpOverdue(f)).length;

  const budgetTotal = budget.departments.reduce((s, d) => s + d.totalsByYear.fy26Projection, 0);

  function fmt(val: number) {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(0)}M`;
    return `$${(val / 1_000).toFixed(0)}K`;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
      <Link href="/budget" className="bg-surface-container-low p-5 rounded-lg hover:bg-surface-container-high transition-colors group">
        <p className="text-[10px] font-label font-bold uppercase tracking-widest text-secondary mb-1">FY26 County Budget</p>
        <p className="font-headline text-3xl md:text-4xl text-primary">{fmt(budgetTotal)}</p>
        <p className="text-xs text-on-surface-variant mt-1 group-hover:text-primary transition-colors">Explore where it goes →</p>
      </Link>
      <Link href="/follow-ups" className="bg-surface-container-low p-5 rounded-lg hover:bg-surface-container-high transition-colors group">
        <p className="text-[10px] font-label font-bold uppercase tracking-widest text-secondary mb-1">Open Commitments</p>
        <div className="flex items-baseline gap-2">
          <p className="font-headline text-3xl md:text-4xl text-primary">{openCount - ongoingCount}</p>
          {overdueCount > 0 && (
            <span className="text-sm font-bold text-error">{overdueCount} overdue</span>
          )}
          {ongoingCount > 0 && (
            <span className="text-sm text-on-surface-variant">+{ongoingCount} ongoing</span>
          )}
        </div>
        <p className="text-xs text-on-surface-variant mt-1 group-hover:text-primary transition-colors">Are they following through? →</p>
      </Link>
      <Link href="/meetings" className="bg-surface-container-low p-5 rounded-lg hover:bg-surface-container-high transition-colors group">
        <p className="text-[10px] font-label font-bold uppercase tracking-widest text-secondary mb-1">Meetings Tracked</p>
        <p className="font-headline text-3xl md:text-4xl text-primary">{meetings.length}</p>
        <p className="text-xs text-on-surface-variant mt-1 group-hover:text-primary transition-colors">See what happened →</p>
      </Link>
    </div>
  );
}

function OpenItemsSummary({ meetings }: { meetings: Meeting[] }) {
  // Fall back to meeting JSON initially, then replace with Supabase data
  const [followUps, setFollowUps] = useState<FollowUpItem[]>(() => {
    const items: FollowUpItem[] = [];
    for (const m of meetings) {
      if (m.followUps) items.push(...m.followUps);
    }
    return items;
  });

  useEffect(() => {
    if (isSupabaseEnabled()) {
      getFollowUpsAsync().then((sbItems) => {
        if (sbItems.length > 0) setFollowUps(sbItems);
      }).catch(() => {});
    }
  }, []);

  const openItems = followUps.filter((f) => (f.status === "open" || f.status === "in_progress") && f.type !== "ongoing");
  const ongoingItems = followUps.filter((f) => (f.status === "open" || f.status === "in_progress") && f.type === "ongoing");
  const overdueItems = followUps.filter((f) => isFollowUpOverdue(f));
  const resolvedCount = followUps.filter((f) => f.status === "resolved" || f.status === "dropped").length;

  if (openItems.length === 0 && ongoingItems.length === 0) return null;

  // Sort by most overdue first, take top 5
  const topItems = [...openItems]
    .sort((a, b) => a.dateRaised.localeCompare(b.dateRaised))
    .slice(0, 5);

  return (
    <section>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-outline-variant/30 pb-4 mb-8">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-error">pending_actions</span>
          <Link href="/follow-ups" className="font-headline text-3xl hover:text-primary/80 transition-colors">Accountability Tracker</Link>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs font-label font-bold uppercase tracking-wider">
          <span className="text-on-surface-variant">{openItems.length} open</span>
          <span className="text-on-surface-variant">·</span>
          <span className="text-error">{overdueItems.length} overdue</span>
          <span className="text-on-surface-variant">·</span>
          <span className="text-on-surface-variant">{resolvedCount} resolved</span>
          {ongoingItems.length > 0 && (
            <>
              <span className="text-on-surface-variant">·</span>
              <span className="text-on-surface-variant">{ongoingItems.length} ongoing</span>
            </>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {topItems.map((item) => {
          const days = daysSince(item.dateRaised);
          const overdue = isFollowUpOverdue(item);
          const daysColor = overdue ? "text-error" : days >= 60 ? "text-amber-600" : "text-on-surface-variant";
          return (
            <Link
              key={item.id}
              href="/follow-ups"
              className="flex items-center gap-4 bg-surface-container-lowest border border-outline-variant/20 p-4 rounded-lg hover:bg-surface-container-low transition-colors"
            >
              <span className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${daysColor}`}>
                {days}d
              </span>
              <p className="text-sm text-on-surface font-medium truncate flex-1">{item.description}</p>
              <span className="text-xs text-on-surface-variant font-bold whitespace-nowrap shrink-0 hidden md:inline">
                {getOwnerDisplayName(item.owner)}
              </span>
              <div className="flex gap-1 shrink-0">
                {item.categories.slice(0, 1).map((catId) => {
                  const cat = CATEGORIES.find((c) => c.id === catId);
                  const icon = CATEGORY_ICONS[catId];
                  if (!cat) return null;
                  return (
                    <span
                      key={catId}
                      className="inline-flex items-center gap-1 bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
                    >
                      {icon && <span className="material-symbols-outlined text-[12px]">{icon}</span>}
                      {cat.label}
                    </span>
                  );
                })}
              </div>
            </Link>
          );
        })}
      </div>
      <div className="mt-4">
        <Link
          href="/follow-ups"
          className="text-xs font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity flex items-center gap-1"
        >
          View all open items
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
    </section>
  );
}

function RecentDeliberations({ meetings }: { meetings: Meeting[] }) {
  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-expand most recent meeting when data loads
  useEffect(() => {
    if (sorted.length > 0 && expandedId === null) {
      setExpandedId(sorted[0].id);
    }
  }, [sorted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sorted.length === 0) {
    return (
      <section>
        <div className="flex items-end border-b border-outline-variant/30 pb-4 mb-8">
          <Link href="/meetings" className="font-headline text-3xl hover:text-primary/80 transition-colors">Recent Meetings</Link>
        </div>
        <p className="text-on-surface-variant text-sm italic py-8 text-center">No meetings tracked yet.</p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-end justify-between border-b border-outline-variant/30 pb-4 mb-8">
        <Link href="/meetings" className="font-headline text-3xl hover:text-primary/80 transition-colors">Recent Meetings</Link>
        <Link href="/meetings" className="text-[10px] font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity flex items-center gap-1">
          All meetings <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
      <div className="space-y-3">
        {sorted.map((meeting) => {
          const isExpanded = expandedId === meeting.id;
          return (
            <div key={meeting.id} className="bg-surface-container-low rounded-lg relative border-l-4 border-primary overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
                className="w-full text-left p-5 md:p-6 flex items-center gap-4 hover:bg-surface-container transition-colors min-h-[44px]"
              >
                <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                  <p className="font-headline text-lg md:text-xl text-primary font-bold whitespace-nowrap">
                    {new Date(meeting.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span className="capitalize">{meeting.type}</span>
                    <span>·</span>
                    <span>{meeting.duration}</span>
                    <span>·</span>
                    <span>{meeting.keyVotes.length} votes</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                  expand_more
                </span>
              </button>

              {isExpanded && (
                <div className="px-5 md:px-6 pb-6 space-y-6 border-t border-outline-variant/10 pt-4">
                  <p className="font-headline italic text-on-surface-variant leading-relaxed">
                    {meeting.tldr}
                  </p>

                  {meeting.keyVotes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-secondary mb-3">Key Votes</h4>
                      <div className="space-y-2">
                        {meeting.keyVotes.slice(0, 5).map((vote, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm">
                            <span className="bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 mt-0.5">
                              {vote.result}
                            </span>
                            <span className="text-on-surface">{vote.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {meeting.followUps && meeting.followUps.length > 0 && (
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-bold text-error">{meeting.followUps.length}</span> follow-up{meeting.followUps.length !== 1 ? "s" : ""} created from this meeting
                    </p>
                  )}

                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
                  >
                    View full meeting
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentUpdates({ meetings }: { meetings: Meeting[] }) {
  const [dbItems, setDbItems] = useState<{ date: string; icon: string; text: string; href: string }[]>([]);

  // Fetch recent activity from Supabase
  useEffect(() => {
    if (!isSupabaseEnabled()) return;
    import("@/lib/supabase").then(({ supabase: sb }) => {
      if (!sb) return;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Recent meetings by created_at
      sb.from("meetings")
        .select("id, date, type, created_at")
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .then(({ data: recentMeetings }) => {
          if (!recentMeetings) return;
          const items: typeof dbItems = [];
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          for (const m of recentMeetings) {
            const dateStr = (m.date as string).slice(0, 10);
            // Skip backfilled meetings — only show if the meeting date is recent
            if (dateStr < thirtyDaysAgo) continue;
            const dateLabel = new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const typeLabel = ((m.type as string) || "regular").charAt(0).toUpperCase() + ((m.type as string) || "regular").slice(1);
            items.push({
              date: dateStr,
              icon: "event",
              text: `New meeting processed: ${typeLabel} Session, ${dateLabel}`,
              href: `/meetings/${m.id}`,
            });
          }

          // Recent follow-ups — filter by actual date, not created_at
          sb.from("follow_ups")
            .select("id, date_raised, description, status, created_at, related_meeting_id")
            .gte("date_raised", thirtyDaysAgo)
            .order("date_raised", { ascending: false })
            .then(({ data: recentFUs }) => {
              if (recentFUs && recentFUs.length > 0) {
                // Group by meeting
                const byMeeting = new Map<string, number>();
                for (const fu of recentFUs) {
                  const mid = fu.related_meeting_id as string;
                  byMeeting.set(mid, (byMeeting.get(mid) || 0) + 1);
                }
                for (const [mid, count] of byMeeting) {
                  const firstInGroup = recentFUs.find((f) => f.related_meeting_id === mid);
                  const dateStr = firstInGroup ? (firstInGroup.date_raised as string).slice(0, 10) : "";
                  if (dateStr) {
                    items.push({
                      date: dateStr,
                      icon: "add_circle",
                      text: `${count} new follow-up${count !== 1 ? "s" : ""} created`,
                      href: "/follow-ups",
                    });
                  }
                }

                // Check for resolved items
                const resolved = recentFUs.filter((f) => f.status === "resolved");
                for (const fu of resolved.slice(0, 2)) {
                  items.push({
                    date: (fu.date_raised as string).slice(0, 10),
                    icon: "check_circle",
                    text: `Follow-up resolved: ${(fu.description as string).slice(0, 80)}`,
                    href: "/follow-ups",
                  });
                }
              }
              setDbItems(items);
            });
        });
    });
  }, []);

  // Merge: manual announcements + db items + meeting-based fallback
  const now = Date.now();
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;

  const allItems: { date: string; icon: string; text: string; href: string }[] = [];

  // Manual announcements (from data file)
  for (const a of announcementsData) {
    if (new Date(a.date + "T12:00:00").getTime() >= cutoff) {
      allItems.push({
        date: a.date,
        icon: a.icon || "auto_awesome",
        text: a.text,
        href: a.link || "/",
      });
    }
  }

  // DB items
  allItems.push(...dbItems);

  // Fallback: if no db items yet, use meeting dates from context
  if (dbItems.length === 0) {
    for (const m of meetings) {
      const mTime = new Date(m.date + "T12:00:00").getTime();
      if (mTime >= cutoff) {
        const dateLabel = new Date(m.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
        allItems.push({
          date: m.date,
          icon: "event",
          text: `Meeting processed: ${m.type.charAt(0).toUpperCase() + m.type.slice(1)} Session, ${dateLabel}`,
          href: `/meetings/${m.id}`,
        });
      }
    }
  }

  // Deduplicate: if a manual announcement date matches a db meeting date, keep only the manual one
  const manualDates = new Set(announcementsData.map((a) => a.date));
  const deduped = allItems.filter((item, i) => {
    if (item.icon === "event" && manualDates.has(item.date)) {
      // Check if there's a manual announcement for this date
      const hasManual = allItems.some((other, j) => j !== i && other.date === item.date && other.icon !== "event" && other.icon !== "add_circle" && other.icon !== "check_circle");
      if (hasManual) return false;
    }
    return true;
  });

  deduped.sort((a, b) => b.date.localeCompare(a.date));
  const display = deduped.slice(0, 5);

  if (display.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant mb-4">Recent Updates</h2>
      <div className="space-y-2">
        {display.map((item, i) => (
          <Link key={i} href={item.href} className="flex items-center gap-3 text-sm hover:text-primary transition-colors group">
            <span className="text-[10px] font-label font-bold text-on-surface-variant/60 uppercase tracking-wider w-14 shrink-0">
              {new Date(item.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span className="material-symbols-outlined text-secondary text-sm shrink-0">{item.icon}</span>
            <span className="text-on-surface-variant group-hover:text-primary transition-colors">{item.text}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const budget = budgetJson as BudgetData;

function BudgetSnapshot() {
  const departments = budget.departments;
  if (departments.length === 0) return null;

  const sorted = [...departments].sort((a, b) => b.totalsByYear.fy26Projection - a.totalsByYear.fy26Projection).slice(0, 6);
  const maxVal = sorted[0]?.totalsByYear.fy26Projection || 1;
  const grandTotal = departments.reduce((s, d) => s + d.totalsByYear.fy26Projection, 0);

  function fmt(val: number) {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  }

  return (
    <section>
      <div className="flex items-end justify-between border-b border-outline-variant/30 pb-4 mb-8">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-secondary">account_balance</span>
          <Link href="/budget" className="font-headline text-3xl hover:text-primary/80 transition-colors">Where Your Tax Dollars Go</Link>
        </div>
        <span className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider">
          {fmt(grandTotal)} Total · FY26
        </span>
      </div>
      <div className="space-y-3">
        {sorted.map((dept) => {
          const pct = (dept.totalsByYear.fy26Projection / maxVal) * 100;
          const up = dept.percentChange > 1;
          const down = dept.percentChange < -1;
          return (
            <Link
              key={dept.department}
              href={`/budget?dept=${encodeURIComponent(dept.department)}`}
              className="flex items-center gap-4 group min-h-[44px]"
            >
              <span className="text-sm font-medium text-on-surface w-40 md:w-52 truncate group-hover:text-primary transition-colors">{dept.department}</span>
              <div className="flex-1 h-5 bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/70 rounded-full transition-all group-hover:bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm font-bold tabular-nums w-16 text-right">{fmt(dept.totalsByYear.fy26Projection)}</span>
              <span className={`text-[10px] font-bold w-10 text-right ${up ? "text-error" : down ? "text-secondary" : "text-on-surface-variant"}`}>
                {up ? "▲" : down ? "▼" : "—"}
                {Math.abs(dept.percentChange) >= 1 ? `${Math.abs(dept.percentChange).toFixed(0)}%` : ""}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="mt-4">
        <Link
          href="/budget"
          className="text-xs font-bold uppercase tracking-widest text-primary hover:opacity-70 transition-opacity flex items-center gap-1"
        >
          Explore full budget
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
    </section>
  );
}

function DashboardContent() {
  const { meetings: allMeetings } = useMeetings();
  const searchParams = useSearchParams();
  const filters = parseFiltersFromParams(searchParams);
  const meetings = filterMeetings(allMeetings, filters);

  const topicCounts = getTopicCounts(meetings);
  const maxTopicCount = topicCounts[0]?.[1] || 1;
  const topTopics = topicCounts.slice(0, 6);
  const remainingTopics = topicCounts.slice(6);

  return (
    <div>
      <UpcomingMeetingBanner />
      <div className="px-4 md:px-8 lg:px-12 py-8 md:py-12 space-y-10 md:space-y-16">
      {/* Hero Banner */}
      <section className="border-b border-outline-variant/30 pb-12">
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
              <span className="w-2 h-2 bg-primary rounded-full pulse" />
              <span className="font-label text-[10px] font-bold uppercase tracking-widest text-primary">Live Tracking</span>
            </div>
            <span className="text-[10px] font-label font-bold text-on-surface-variant/60 uppercase tracking-widest">
              Last Updated: {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <div className="max-w-4xl">
            <h1 className="font-headline text-4xl md:text-6xl lg:text-7xl xl:text-8xl text-primary leading-[0.95] font-bold -tracking-wider">
              Tracking what your <br />
              <span className="serif-italic font-normal italic pr-2">commissioners do.</span>
            </h1>
            <p className="font-body text-xl text-on-surface-variant mt-8 max-w-2xl leading-relaxed opacity-90">
              What Transylvania County commissioners discuss, vote on, promise, and spend — all sourced from official public records.
            </p>
          </div>

          {/* Live stat cards */}
          <HeroStats meetings={allMeetings} />
        </div>
      </section>

      {/* Recent Updates feed */}
      <RecentUpdates meetings={allMeetings} />

      {/* Recent Meetings — 3 most recent, first expanded */}
      <RecentDeliberations meetings={meetings} />

      {/* Budget Snapshot */}
      <BudgetSnapshot />

      {/* Accountability Tracker — Open Items */}
      <OpenItemsSummary meetings={meetings} />

      {/* Commissioners + Topics two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-12">
        <div className="xl:col-span-7 space-y-8">
          <div className="flex justify-between items-end border-b border-outline-variant/30 pb-4">
            <Link href="/commissioners" className="font-headline text-3xl hover:text-primary/80 transition-colors">Commissioners Overview</Link>
            <Link href="/commissioners" className="text-[10px] font-bold uppercase tracking-widest text-primary border-b border-primary hover:opacity-70 transition-opacity">
              View profiles
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {COMMISSIONERS.map((commissioner, i) => {
              const cStats = getCommissionerStats(commissioner.id, meetings);
              const notRunning = commissioner.id === "dalton" || commissioner.id === "mckelvey";
              const isLast = i === COMMISSIONERS.length - 1 && COMMISSIONERS.length % 2 !== 0;
              return (
                <Link
                  key={commissioner.id}
                  href={`/commissioners/${commissioner.id}`}
                  className={`bg-surface-container-lowest p-5 rounded relative overflow-hidden flex flex-col justify-between group ${isLast ? "md:col-span-2" : ""}`}
                >
                  <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: commissioner.color }} />
                  <div className={isLast ? "flex flex-col md:flex-row md:items-center justify-between" : ""}>
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="font-headline text-xl">{commissioner.name}</h4>
                        {notRunning && (
                          <span className="bg-error/10 text-error text-[8px] px-2 py-0.5 rounded-full font-bold uppercase">
                            Not running &apos;26
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant mb-4">
                        {commissioner.role === "Chair" ? "Board Chair" : commissioner.role}
                      </p>
                    </div>
                    <div className={`grid ${isLast ? "grid-cols-3 gap-12" : "grid-cols-3 gap-2"} py-2`}>
                      <div className="text-center">
                        <p className={`font-headline ${isLast ? "text-2xl" : "text-xl"}`}>{cStats.meetingsPresent}</p>
                        <p className="text-[8px] uppercase font-bold text-secondary">Meetings</p>
                      </div>
                      <div className="text-center">
                        <p className={`font-headline ${isLast ? "text-2xl" : "text-xl"}`}>{cStats.topicCount}</p>
                        <p className="text-[8px] uppercase font-bold text-secondary">Topics</p>
                      </div>
                      <div className="text-center">
                        <p className={`font-headline ${isLast ? "text-2xl" : "text-xl"}`}>{cStats.motionsMade + cStats.motionsSeconded}</p>
                        <p className="text-[8px] uppercase font-bold text-secondary">Motions</p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Most Active Topics */}
        <div className="xl:col-span-5 space-y-8">
          <div className="flex items-end border-b border-outline-variant/30 pb-4">
            <Link href="/topics/fiscal" className="font-headline text-3xl hover:text-primary/80 transition-colors">Most Active Topics</Link>
          </div>
          <div className="space-y-4">
            {topTopics.map(([catId, count]) => {
              const materialIcon = CATEGORY_ICONS[catId];
              const category = CATEGORIES.find((c) => c.id === catId);
              if (!category) return null;
              const pct = Math.round((count / maxTopicCount) * 100);
              return (
                <Link key={catId} href={`/topics/${catId}`} className="block space-y-1 group">
                  <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-tight">
                    <span className="flex items-center gap-2 group-hover:text-primary transition-colors">
                      {materialIcon && <span className="material-symbols-outlined text-[14px]">{materialIcon}</span>}
                      {category.label}
                    </span>
                    <span>{count}</span>
                  </div>
                  <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%`, opacity: 0.4 + (pct / 100) * 0.6 }}
                    />
                  </div>
                </Link>
              );
            })}
            {remainingTopics.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-4">
                {remainingTopics.map(([catId, count]) => {
                  const category = CATEGORIES.find((c) => c.id === catId);
                  if (!category) return null;
                  return (
                    <Link
                      key={catId}
                      href={`/topics/${catId}`}
                      className="rounded-full px-3 py-1 bg-secondary-fixed text-on-secondary-fixed text-[10px] font-bold uppercase hover:opacity-80 transition-opacity"
                    >
                      {category.label} ({count})
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Election Card — Bottom */}
      <section>
        <div className="bg-primary-container text-on-primary-container p-8 rounded-xl border border-primary/20 shadow-xl relative overflow-hidden group max-w-2xl">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <span className="font-label text-[10px] uppercase tracking-widest text-primary-fixed-dim/80 mb-4 block font-extrabold">Upcoming Election</span>
              <h3 className="font-headline text-3xl font-bold leading-tight text-white mb-4">
                {ELECTION_INFO.nextElection} — {ELECTION_INFO.openSeats} Open Seats
              </h3>
              <p className="text-sm font-body text-primary-fixed-dim leading-relaxed mb-4">
                {ELECTION_INFO.note}
              </p>
              <div className="space-y-2 text-sm text-primary-fixed-dim mb-8">
                <p><span className="font-bold text-primary-fixed">GOP:</span> {ELECTION_INFO.gopNominees.join(", ")}</p>
                <p><span className="font-bold text-primary-fixed">Dem:</span> {ELECTION_INFO.demNominees.join(", ")}</p>
              </div>
            </div>
            <Link
              href="/commissioners"
              className="text-primary-fixed font-bold text-xs uppercase tracking-widest flex items-center gap-2 group-hover:gap-3 transition-all underline decoration-primary-fixed/30 underline-offset-8"
            >
              Review commissioner profiles
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
          <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        </div>
      </section>
    </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
