"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { features } from "@/lib/feature-flags";
import { getFollowUpsAsync } from "@/lib/data";
import { isSupabaseEnabled } from "@/lib/supabase";
import { isFollowUpOverdue } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/commissioners", label: "Commissioners" },
  { href: "/staff", label: "Staff" },
  { href: "/topics", label: "Topics", matchPrefix: "/topics" },
  { href: "/threads", label: "Threads" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/meetings", label: "Meetings" },
  { href: "/budget", label: "Budget" },
  ...(features.investigations ? [{ href: "/investigations", label: "Investigations", matchPrefix: "/investigations" }] : []),
];

function useOverdueCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isSupabaseEnabled()) return;

    getFollowUpsAsync().then((items) => {
      setCount(items.filter((f) => isFollowUpOverdue(f)).length);
    }).catch(() => {});
  }, []);

  return count;
}

export default function NavLinks() {
  const pathname = usePathname();
  const overdueCount = useOverdueCount();

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = item.matchPrefix
          ? pathname.startsWith(item.matchPrefix)
          : pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href === "/topics" ? "/topics/fiscal" : item.href}
            className={`font-label text-sm tracking-tight transition-all duration-300 relative ${
              active
                ? "text-primary font-semibold border-b-2 border-primary pb-1"
                : "text-secondary hover:text-primary"
            }`}
          >
            {item.label}
            {item.href === "/follow-ups" && overdueCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center bg-error text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] px-1 -translate-y-1">
                {overdueCount}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
