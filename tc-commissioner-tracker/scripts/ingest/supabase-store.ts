/** The real `Store`, backed by Supabase. Uses the service role key, which bypasses row-level security. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Store, ThreadRow } from "./publish";

export function supabaseFromEnv(options: { write: boolean }): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = options.write
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      options.write
        ? "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to publish."
        : "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY for read-only use).",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Supabase ${what} failed: ${result.error.message}`);
  return result.data;
}

export function supabaseStore(db: SupabaseClient): Store {
  return {
    async meetingIds() {
      const rows = check(await db.from("meetings").select("id"), "reading meetings") as { id: string }[];
      return rows.map((r) => r.id);
    },
    async openFollowUps() {
      const rows = check(
        await db.from("follow_ups").select("id, date_raised, owner, description, status").in("status", ["open", "in_progress"]).order("date_raised"),
        "reading follow-ups",
      ) as { id: string; date_raised: string; owner: string; description: string; status: "open" | "in_progress" }[];
      return rows.map((r) => ({ id: r.id, dateRaised: r.date_raised.slice(0, 10), owner: r.owner, description: r.description, status: r.status }));
    },
    async activeThreads() {
      const rows = check(await db.from("topic_threads").select("id, title").eq("status", "active"), "reading threads") as { id: string; title: string }[];
      return rows;
    },
    async upsertMeeting(row) {
      check(await db.from("meetings").upsert(row), `saving meeting ${row.id}`);
    },
    async upsertFollowUp(row) {
      check(await db.from("follow_ups").upsert(row), `saving follow-up ${row.id}`);
    },
    async updateFollowUp(id, changes) {
      check(await db.from("follow_ups").update(changes).eq("id", id), `updating follow-up ${id}`);
    },
    async getThread(id) {
      const rows = check(await db.from("topic_threads").select("*").eq("id", id).limit(1), `reading thread ${id}`) as Record<string, unknown>[];
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id as string,
        title: r.title as string,
        categories: (r.categories as string[]) ?? [],
        first_mentioned_date: String(r.first_mentioned_date).slice(0, 10),
        first_mentioned_meeting_id: r.first_mentioned_meeting_id as string,
        status: r.status as ThreadRow["status"],
        mentions: (r.mentions as ThreadRow["mentions"]) ?? [],
      };
    },
    async upsertThread(row) {
      check(await db.from("topic_threads").upsert(row), `saving thread ${row.id}`);
    },
  };
}
