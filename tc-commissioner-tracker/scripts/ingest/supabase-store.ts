/** The real `Store`, backed by Supabase. Uses the service role key, which bypasses row-level security. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Store, ThreadRow } from "./publish";

/** Secrets pasted into GitHub sometimes carry quotes or a trailing newline. */
function clean(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/^["']|["']$/g, "").trim();
  return v || undefined;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Explain why Supabase might reject a key, without revealing the key or the
 * project id (workflow logs are public).
 */
export function describeKeySetup(url: string | undefined, key: string | undefined): string[] {
  const notes: string[] = [];
  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (raw && raw !== raw.trim()) notes.push("The key secret had spaces or line breaks around it (now trimmed).");
  if (/^["']|["']$/.test(raw.trim())) notes.push("The key secret was wrapped in quotes (now removed).");

  let ref: string | undefined;
  try {
    const host = new URL(url ?? "").hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/);
    if (match) ref = match[1];
    else notes.push(`The URL host does not look like <project>.supabase.co (it ends in "${host.split(".").slice(-2).join(".")}"). Use the Project URL from Supabase, not the dashboard address.`);
  } catch {
    notes.push("The URL secret is not a valid URL. It should look like https://<project>.supabase.co");
  }

  if (!key) return [...notes, "No key was provided."];
  if (key.startsWith("sb_publishable_")) notes.push("The key is a publishable (public) key. Use a secret key (sb_secret_...) or the legacy service_role key.");
  else if (key.startsWith("sb_secret_")) notes.push(`The key is a new-style secret key (${key.length} characters).`);
  else {
    const payload = decodeJwtPayload(key);
    if (!payload) notes.push(`The key is neither a Supabase secret key (sb_secret_...) nor a legacy JWT key (${key.length} characters). It may be the JWT secret or a database password rather than an API key.`);
    else {
      notes.push(`The key is a legacy JWT key with role "${String(payload.role)}".`);
      if (payload.role !== "service_role") notes.push('Its role is not "service_role": use the service_role key, not the anon key.');
      if (ref && typeof payload.ref === "string") {
        notes.push(payload.ref === ref ? "The key and the URL are for the same project." : "The key is for a DIFFERENT project than the URL.");
      }
    }
  }
  return notes;
}

export function supabaseFromEnv(options: { write: boolean }): SupabaseClient {
  const url = clean(process.env.SUPABASE_URL) || clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = options.write
    ? clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    : clean(process.env.SUPABASE_SERVICE_ROLE_KEY) || clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
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
  if (result.error) {
    let message = `Supabase ${what} failed: ${result.error.message}`;
    if (/api key|jwt|unauthori[sz]ed/i.test(result.error.message)) {
      const url = clean(process.env.SUPABASE_URL) || clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
      const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY) || clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      message += `\nAbout the configured secrets:\n${describeKeySetup(url, key).map((n) => `  - ${n}`).join("\n")}`;
    }
    throw new Error(message);
  }
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
