"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMeetings } from "@/lib/meetings-context";
import { CATEGORIES, CATEGORY_ICONS } from "@/lib/constants";
import { getFollowUpsAsync } from "@/lib/data";
import { isSupabaseEnabled } from "@/lib/supabase";
import type { FollowUpItem, StaffActivityItem } from "@/lib/types";

interface StaffProfile {
  name: string;
  role: string;
  presentations: Array<{ meetingId: string; date: string; items: string[] }>;
  followUps: FollowUpItem[];
}

function buildStaffProfiles(
  meetings: ReturnType<typeof useMeetings>["meetings"],
  followUps: FollowUpItem[]
): StaffProfile[] {
  const profileMap: Record<string, StaffProfile> = {};

  for (const m of meetings) {
    if (!m.staffActivity) continue;
    for (const sa of m.staffActivity) {
      if (!profileMap[sa.name]) {
        profileMap[sa.name] = {
          name: sa.name,
          role: sa.role,
          presentations: [],
          followUps: [],
        };
      }
      // Update role to latest
      profileMap[sa.name].role = sa.role;
      profileMap[sa.name].presentations.push({
        meetingId: m.id,
        date: m.date,
        items: sa.items,
      });
    }
  }

  // Attach follow-ups by owner name
  for (const fu of followUps) {
    const profile = Object.values(profileMap).find(
      (p) => p.name.toLowerCase() === fu.owner.toLowerCase() || fu.owner.includes(p.name.split(" ").pop() || "")
    );
    if (profile) {
      profile.followUps.push(fu);
    }
  }

  // Sort by most presentations
  return Object.values(profileMap).sort(
    (a, b) => b.presentations.length - a.presentations.length
  );
}

export default function StaffPage() {
  const { meetings } = useMeetings();
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);

  useEffect(() => {
    // Get follow-ups from meeting data as fallback
    const meetingFUs: FollowUpItem[] = [];
    for (const m of meetings) {
      if (m.followUps) meetingFUs.push(...m.followUps);
    }
    setFollowUps(meetingFUs);

    // Try Supabase for authoritative follow-up statuses
    if (isSupabaseEnabled()) {
      getFollowUpsAsync()
        .then((sbItems) => {
          if (sbItems.length > 0) setFollowUps(sbItems);
        })
        .catch(() => {});
    }
  }, [meetings]);

  const profiles = buildStaffProfiles(meetings, followUps);

  const totalPresentations = profiles.reduce(
    (sum, p) => sum + p.presentations.reduce((s, pr) => s + pr.items.length, 0),
    0
  );

  return (
    <div className="px-4 md:px-8 lg:px-12 py-8 md:py-16 max-w-screen-2xl mx-auto">
      {/* Header */}
      <header className="mb-12 md:mb-16">
        <span className="font-label text-xs uppercase tracking-[0.2em] text-secondary mb-4 block font-bold">Administrative Record</span>
        <h1 className="font-headline text-3xl md:text-5xl lg:text-6xl font-bold text-primary mb-4">
          County Staff Activity
        </h1>
        <p className="font-body text-lg text-on-surface-variant max-w-2xl leading-relaxed">
          Tracking presentations, reports, and recommendations from key county staff across all meetings.
        </p>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-12 md:mb-16">
        <div className="bg-surface-container-low p-4 md:p-6 rounded-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">Staff Tracked</p>
          <h3 className="font-headline text-3xl md:text-4xl">{profiles.length}</h3>
        </div>
        <div className="bg-surface-container-low p-4 md:p-6 rounded-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">Total Presentations</p>
          <h3 className="font-headline text-3xl md:text-4xl">{totalPresentations}</h3>
        </div>
        <div className="bg-surface-container-low p-4 md:p-6 rounded-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">Meetings With Staff</p>
          <h3 className="font-headline text-3xl md:text-4xl">
            {meetings.filter((m) => m.staffActivity && m.staffActivity.length > 0).length}
          </h3>
        </div>
        <div className="bg-surface-container-low p-4 md:p-6 rounded-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-2">Open Follow-ups</p>
          <h3 className="font-headline text-3xl md:text-4xl">
            {profiles.reduce((sum, p) => sum + p.followUps.filter((f) => f.status === "open" || f.status === "in_progress").length, 0)}
          </h3>
        </div>
      </section>

      {/* Staff Profiles */}
      {profiles.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">person_search</span>
          <p className="text-on-surface-variant font-body">
            No staff activity data yet. Staff presentations will appear here as meetings are processed.
          </p>
        </div>
      ) : (
        <section className="space-y-6">
          <div className="flex items-end border-b border-outline-variant/30 pb-4">
            <h2 className="font-headline text-3xl font-bold text-primary">Staff Profiles</h2>
          </div>

          {profiles.map((profile) => {
            const isExpanded = expandedStaff === profile.name;
            const openFUs = profile.followUps.filter((f) => f.status === "open" || f.status === "in_progress");
            const resolvedFUs = profile.followUps.filter((f) => f.status === "resolved" || f.status === "dropped");
            const totalItems = profile.presentations.reduce((s, p) => s + p.items.length, 0);

            return (
              <div key={profile.name} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedStaff(isExpanded ? null : profile.name)}
                  className="w-full p-6 md:p-8 flex items-start md:items-center gap-6 text-left hover:bg-surface-container-low/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-primary-fixed text-lg font-bold shrink-0">
                    {profile.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-headline text-xl md:text-2xl font-bold text-primary">{profile.name}</h3>
                    <p className="text-sm text-on-surface-variant">{profile.role}</p>
                  </div>
                  <div className="hidden md:flex items-center gap-8">
                    <div className="text-center">
                      <p className="font-headline text-xl text-primary">{profile.presentations.length}</p>
                      <p className="text-[9px] uppercase font-bold text-secondary tracking-wider">Meetings</p>
                    </div>
                    <div className="text-center">
                      <p className="font-headline text-xl text-primary">{totalItems}</p>
                      <p className="text-[9px] uppercase font-bold text-secondary tracking-wider">Items</p>
                    </div>
                    <div className="text-center">
                      <p className="font-headline text-xl text-primary">{openFUs.length}</p>
                      <p className="text-[9px] uppercase font-bold text-secondary tracking-wider">Open FUs</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant transition-transform shrink-0" style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}>
                    expand_more
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-outline-variant/10 p-6 md:p-8 space-y-8">
                    {/* Mobile stats */}
                    <div className="flex gap-6 md:hidden">
                      <div><span className="font-headline text-lg text-primary">{profile.presentations.length}</span> <span className="text-[9px] uppercase font-bold text-secondary">meetings</span></div>
                      <div><span className="font-headline text-lg text-primary">{totalItems}</span> <span className="text-[9px] uppercase font-bold text-secondary">items</span></div>
                      <div><span className="font-headline text-lg text-primary">{openFUs.length}</span> <span className="text-[9px] uppercase font-bold text-secondary">open FUs</span></div>
                    </div>

                    {/* Activity Timeline */}
                    <div>
                      <h4 className="font-headline text-lg font-bold text-primary mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">timeline</span>
                        Meeting Activity
                      </h4>
                      <div className="relative pl-6 md:pl-8 space-y-6">
                        <div className="absolute left-2 md:left-3 top-0 bottom-0 w-px bg-outline-variant/30" />
                        {[...profile.presentations]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((pres) => (
                            <div key={pres.meetingId} className="relative">
                              <div className="absolute -left-[18px] md:left-[-23px] top-1.5 w-3 h-3 rounded-full bg-primary ring-4 ring-surface-container-lowest" />
                              <div>
                                <Link
                                  href={`/meetings/${pres.meetingId}`}
                                  className="font-label text-sm font-bold text-primary hover:underline"
                                >
                                  {new Date(pres.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                </Link>
                                <ul className="mt-2 space-y-2">
                                  {pres.items.map((item, i) => (
                                    <li key={i} className="text-sm text-on-surface-variant leading-relaxed flex items-start gap-2">
                                      <span className="material-symbols-outlined text-[14px] text-secondary shrink-0 mt-0.5">chevron_right</span>
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Follow-ups */}
                    {profile.followUps.length > 0 && (
                      <div>
                        <h4 className="font-headline text-lg font-bold text-primary mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg">pending_actions</span>
                          Follow-up Items ({openFUs.length} open, {resolvedFUs.length} resolved)
                        </h4>
                        <div className="space-y-3">
                          {openFUs.map((fu) => (
                            <div key={fu.id} className="bg-surface-container-low border border-outline-variant/10 rounded p-4 flex items-start gap-3">
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-error/10 text-error shrink-0 mt-0.5">Open</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-on-surface leading-relaxed">{fu.description}</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {fu.categories.map((catId) => {
                                    const cat = CATEGORIES.find((c) => c.id === catId);
                                    const icon = CATEGORY_ICONS[catId];
                                    if (!cat) return null;
                                    return (
                                      <Link key={catId} href={`/topics/${catId}`} className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-surface-container text-on-surface-variant uppercase rounded hover:opacity-80">
                                        {icon && <span className="material-symbols-outlined text-[10px]">{icon}</span>}
                                        {cat.label}
                                      </Link>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ))}
                          {resolvedFUs.map((fu) => (
                            <div key={fu.id} className="bg-surface-container-low border border-outline-variant/10 rounded p-4 flex items-start gap-3 opacity-70">
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed shrink-0 mt-0.5">Resolved</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-on-surface leading-relaxed">{fu.description}</p>
                                {fu.resolution && (
                                  <p className="text-xs text-secondary mt-1">{fu.resolution}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
