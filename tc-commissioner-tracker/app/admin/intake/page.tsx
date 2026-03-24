"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useMeetings } from "@/lib/meetings-context";
import MeetingIntakeForm from "@/components/MeetingIntakeForm";
import type { Meeting } from "@/lib/types";

interface ResolvedFollowUp {
  id: string;
  status: "in_progress" | "resolved";
  resolution: string;
}

export default function AdminIntake() {
  const router = useRouter();
  const { addMeeting } = useMeetings();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      if (!supabase) {
        setAuthorized(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push("/admin/login");
        return;
      }

      // Verify user ID matches admin UUID
      const adminUserId = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
      if (adminUserId && session.user.id !== adminUserId) {
        setAuthorized(false);
        return;
      }

      setAuthorized(true);
    }

    checkAuth();
  }, [router]);

  async function handleAccept(meeting: Meeting, acceptedResolutions: ResolvedFollowUp[]) {
    await addMeeting(meeting);

    // Apply accepted follow-up resolutions to Supabase
    if (acceptedResolutions.length > 0 && supabase) {
      for (const r of acceptedResolutions) {
        const { error } = await supabase
          .from("follow_ups")
          .update({ status: r.status, resolution: r.resolution })
          .eq("id", r.id);
        if (error) {
          console.error(`Failed to update follow-up ${r.id}:`, error);
        }
      }
    }

    // Keep showing the form for the next meeting
    setShowForm(false);
    setTimeout(() => setShowForm(true), 100);
  }

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/admin/login");
  }

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-error mb-4 block">lock</span>
          <h1 className="font-headline text-3xl text-primary font-bold mb-2">Unauthorized</h1>
          <p className="text-on-surface-variant mb-6">Your account does not have admin access.</p>
          <button
            onClick={handleLogout}
            className="text-primary font-bold text-sm underline"
          >
            Sign out and try a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-screen-2xl mx-auto px-4 md:px-12 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-headline text-3xl text-primary font-bold">Meeting Intake</h1>
            <p className="text-on-surface-variant text-sm">Process and save meeting minutes</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm font-label text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Sign out
          </button>
        </div>

        {showForm && (
          <MeetingIntakeForm
            onAccept={handleAccept}
            onClose={() => router.push("/meetings")}
          />
        )}
      </div>
    </div>
  );
}
