"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMeetings } from "@/lib/meetings-context";
import { parseFiltersFromParams, filterMeetings } from "@/lib/filters";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import FilterBar from "@/components/FilterBar";
import Pagination, { paginate } from "@/components/Pagination";
import { getRelatedMeetingCount } from "@/lib/data";

function MeetingsContent() {
  const { meetings: allMeetings } = useMeetings();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin } = useIsAdmin();

  const filters = parseFiltersFromParams(searchParams);
  const filtered = filterMeetings(allMeetings, filters);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const { paginated, totalPages } = paginate(sorted, page);

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(p));
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="px-4 md:px-8 lg:px-12 py-8 md:py-16 max-w-screen-2xl mx-auto">
      {/* Hero Section */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8 mb-12 md:mb-20">
        <div className="max-w-2xl">
          <span className="text-secondary font-label font-bold tracking-widest text-xs uppercase mb-4 block">Official Record</span>
          <h1 className="font-headline text-3xl md:text-5xl lg:text-6xl font-extrabold text-primary tracking-tight leading-none mb-4 md:mb-6">
            Meetings &amp; Deliberations
          </h1>
          <p className="text-on-surface-variant text-lg leading-relaxed font-body">
            A permanent archive of civic discourse. Track legislative progression, review committee summaries, and analyze the evolution of local policy through curated meeting transcripts.
          </p>
          <Link href="/methodology" className="inline-flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-label font-bold uppercase tracking-wider mt-3 transition-colors">
            <span className="material-symbols-outlined text-sm">info</span>
            How we categorize
          </Link>
        </div>
        <div className="flex flex-col items-start md:items-end gap-3">
          <div className="text-right">
            <p className="text-on-surface-variant font-label text-xs uppercase tracking-wider">Archive Status</p>
            <p className="text-primary font-headline italic text-xl">Active &amp; Synchronized</p>
          </div>
          {isAdmin && (
            <Link
              href="/admin/intake"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded text-xs font-label font-bold hover:bg-primary-container transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add Meeting
            </Link>
          )}
        </div>
      </header>

      {/* Meeting Ledger */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-headline text-4xl text-primary">Meeting Ledger</h2>
        </div>

        <div className="mb-8">
          <FilterBar />
        </div>

        {/* Results count */}
        <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-6">
          {sorted.length} {sorted.length === 1 ? "meeting" : "meetings"} found
          {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
        </p>

        <div className="space-y-0">
          {paginated.map((meeting, i) => (
            <div key={meeting.id}>
              {i > 0 && <div className="h-px bg-outline-variant/10" />}
              <Link
                href={`/meetings/${meeting.id}`}
                className="group relative flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-8 items-start hover:bg-surface-container-low/30 p-4 md:p-8 -mx-4 md:-mx-8 transition-all rounded-xl min-h-[44px]"
              >
                <div className="md:col-span-2">
                  <span className="text-xs font-label font-bold text-secondary uppercase tracking-widest block mb-1">
                    {new Date(meeting.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </span>
                  <div className="flex items-center gap-2 text-on-surface-variant text-xs">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {meeting.duration}
                  </div>
                </div>
                <div className="md:col-span-3">
                  <h3 className="font-headline text-2xl text-primary mb-2">
                    Board of Commissioners
                  </h3>
                  <span className="inline-flex items-center px-3 py-1 bg-secondary-fixed text-on-secondary-fixed rounded-full text-[10px] font-bold uppercase tracking-tighter capitalize">
                    {meeting.type}
                  </span>
                </div>
                <div className="md:col-span-5">
                  <p className="text-on-surface-variant font-body text-sm leading-relaxed line-clamp-3">
                    {meeting.tldr}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex-wrap">
                    <span>{meeting.attendees.length} commissioners</span>
                    <span>~{meeting.audienceSize} audience</span>
                    <span>{meeting.keyVotes.length} votes</span>
                    {(() => {
                      const count = getRelatedMeetingCount(meeting.id, allMeetings);
                      return count > 0 ? (
                        <span className="text-secondary">
                          <span className="material-symbols-outlined text-[12px] mr-0.5 align-middle">link</span>
                          Connected to {count} other meeting{count !== 1 ? "s" : ""}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div className="hidden md:flex md:col-span-2 justify-end">
                  <span className="p-3 rounded-full group-hover:bg-surface-container-high transition-colors text-primary inline-flex">
                    <span className="material-symbols-outlined">chevron_right</span>
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>

        {sorted.length === 0 && (
          <p className="text-on-surface-variant text-sm italic py-12 text-center">No meetings match the current filters.</p>
        )}

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={goToPage} />
      </section>

    </div>
  );
}

export default function MeetingsList() {
  return (
    <Suspense>
      <MeetingsContent />
    </Suspense>
  );
}
