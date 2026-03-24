"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CATEGORIES, CATEGORY_ICONS } from "@/lib/constants";
import { getThreadsAsync } from "@/lib/data";
import type { TopicThread } from "@/lib/types";
import Pagination, { paginate } from "@/components/Pagination";

function ThreadsContent() {
  const [threads, setThreads] = useState<TopicThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    getThreadsAsync()
      .then(setThreads)
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, []);

  const catFilter = searchParams.get("cat") || "";
  const statusFilter = searchParams.get("status") || "";

  const filtered = useMemo(() => {
    let items = threads;
    if (catFilter) {
      items = items.filter((t) => t.categories.includes(catFilter));
    }
    if (statusFilter) {
      items = items.filter((t) => t.status === statusFilter);
    }
    return items;
  }, [threads, catFilter, statusFilter]);

  // Sort: most recently mentioned first
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aLast = a.mentions.length > 0 ? a.mentions[a.mentions.length - 1].date : a.firstMentionedDate;
      const bLast = b.mentions.length > 0 ? b.mentions[b.mentions.length - 1].date : b.firstMentionedDate;
      return bLast.localeCompare(aLast);
    });
  }, [filtered]);

  const activeThreads = sorted.filter((t) => t.status === "active" || t.status === "recurring");
  const resolvedThreads = sorted.filter((t) => t.status === "resolved");

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function getLastMentionDate(thread: TopicThread): string {
    if (thread.mentions.length === 0) return thread.firstMentionedDate;
    return thread.mentions[thread.mentions.length - 1].date;
  }

  function daysBetween(d1: string, d2: string): number {
    return Math.abs(Math.floor((new Date(d1).getTime() - new Date(d2).getTime()) / (1000 * 60 * 60 * 24)));
  }

  return (
    <div className="px-4 md:px-8 lg:px-12 py-8 md:py-16 max-w-screen-2xl mx-auto">
      <header className="mb-10 md:mb-16">
        <span className="text-secondary font-label font-bold tracking-widest text-xs uppercase mb-4 block">Longitudinal Tracker</span>
        <h1 className="font-headline text-3xl md:text-5xl lg:text-6xl font-extrabold text-primary tracking-tight leading-none mb-4 md:mb-6">
          Topic Threads
        </h1>
        <p className="text-on-surface-variant text-lg leading-relaxed font-body max-w-2xl">
          Tracking specific items as they progress across multiple meetings — capital projects, studies, policy initiatives, and ongoing issues.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-10">
        <select
          value={catFilter}
          onChange={(e) => setFilter("cat", e.target.value)}
          className="bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-xs font-label font-bold uppercase tracking-tight focus:ring-1 focus:ring-primary focus:border-primary outline-none"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setFilter("status", e.target.value)}
          className="bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-xs font-label font-bold uppercase tracking-tight focus:ring-1 focus:ring-primary focus:border-primary outline-none"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="recurring">Recurring</option>
          <option value="resolved">Resolved</option>
        </select>

        {(catFilter || statusFilter) && (
          <button
            onClick={() => router.push(pathname, { scroll: false })}
            className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold uppercase tracking-tight text-error hover:bg-error/5 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            Clear
          </button>
        )}

        <span className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider ml-auto">
          {sorted.length} thread{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-12 justify-center text-on-surface-variant">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="font-label text-sm">Loading threads...</span>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">timeline</span>
          <p className="text-on-surface-variant font-bold">No topic threads yet</p>
          <p className="text-sm text-on-surface-variant mt-1">Threads are created automatically when meetings are processed. Process a meeting to get started.</p>
        </div>
      ) : (
        <>
          {/* Active Threads */}
          {activeThreads.length > 0 && (
            <section className="mb-16">
              <h2 className="font-headline text-3xl font-bold text-primary mb-8 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">timeline</span>
                Active Threads
              </h2>
              <div id="active-threads" className="space-y-3">
                {paginate(activeThreads, activePage).paginated.map((thread) => {
                  const isExpanded = expandedId === thread.id;
                  const lastDate = getLastMentionDate(thread);
                  const span = daysBetween(thread.firstMentionedDate, lastDate);

                  return (
                    <div key={thread.id} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : thread.id)}
                        className="w-full text-left p-5 md:p-6 flex items-start gap-4 hover:bg-surface-container-low transition-colors min-h-[44px]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              thread.status === "recurring" ? "bg-tertiary-fixed text-on-tertiary-fixed-variant" : "bg-primary/10 text-primary"
                            }`}>
                              {thread.status}
                            </span>
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                              {thread.mentions.length} meeting{thread.mentions.length !== 1 ? "s" : ""}
                              {span > 0 && ` · ${span} days`}
                            </span>
                          </div>
                          <h3 className="font-headline text-xl font-bold text-primary">{thread.title}</h3>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs text-on-surface-variant">
                              {new Date(thread.firstMentionedDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                              {lastDate !== thread.firstMentionedDate && (
                                <> — {new Date(lastDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</>
                              )}
                            </span>
                            <div className="flex gap-1">
                              {thread.categories.map((catId) => {
                                const cat = CATEGORIES.find((c) => c.id === catId);
                                const icon = CATEGORY_ICONS[catId];
                                if (!cat) return null;
                                return (
                                  <span key={catId} className="inline-flex items-center gap-0.5 bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded-full text-[9px] font-bold uppercase">
                                    {icon && <span className="material-symbols-outlined text-[11px]">{icon}</span>}
                                    {cat.label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform mt-1" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                          expand_more
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="px-5 md:px-6 pb-6 border-t border-outline-variant/10 pt-4">
                          <div className="relative pl-6">
                            <div className="absolute left-[3px] top-0 bottom-0 w-px bg-outline-variant/30" />
                            <div className="space-y-6">
                              {thread.mentions.map((mention, i) => (
                                <div key={mention.meetingId + i} className="relative">
                                  <div className="absolute -left-[22px] top-1.5 w-[11px] h-[11px] bg-primary rounded-full border-3 border-surface" />
                                  <div>
                                    <Link href={`/meetings/${mention.meetingId}`} className="text-sm font-bold text-primary hover:underline">
                                      {new Date(mention.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                    </Link>
                                    <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">{mention.summary}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Pagination currentPage={activePage} totalPages={paginate(activeThreads, activePage).totalPages} onPageChange={setActivePage} scrollTargetId="active-threads" />
              </div>
            </section>
          )}

          {/* Resolved Threads */}
          {resolvedThreads.length > 0 && (
            <section>
              <h2 className="font-headline text-3xl font-bold text-primary mb-8 flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary">check_circle</span>
                Resolved Threads
              </h2>
              <div id="resolved-threads" className="space-y-3">
                {paginate(resolvedThreads, resolvedPage).paginated.map((thread) => {
                  const isExpanded = expandedId === thread.id;

                  return (
                    <div key={thread.id} className="bg-surface-container-low border border-outline-variant/10 rounded-lg overflow-hidden opacity-70">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : thread.id)}
                        className="w-full text-left p-5 flex items-center gap-4 hover:bg-surface-container transition-colors min-h-[44px]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed">Resolved</span>
                            <span className="text-[10px] text-on-surface-variant">{thread.mentions.length} meetings</span>
                          </div>
                          <h3 className="font-headline text-lg font-bold text-primary">{thread.title}</h3>
                        </div>
                        <span className="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                          expand_more
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="px-5 pb-5 border-t border-outline-variant/10 pt-4">
                          <div className="space-y-3">
                            {thread.mentions.map((mention, i) => (
                              <div key={mention.meetingId + i} className="flex items-start gap-3 text-sm">
                                <Link href={`/meetings/${mention.meetingId}`} className="font-bold text-primary hover:underline shrink-0">
                                  {new Date(mention.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </Link>
                                <span className="text-on-surface-variant">{mention.summary}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Pagination currentPage={resolvedPage} totalPages={paginate(resolvedThreads, resolvedPage).totalPages} onPageChange={setResolvedPage} scrollTargetId="resolved-threads" />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function ThreadsPage() {
  return (
    <Suspense>
      <ThreadsContent />
    </Suspense>
  );
}
