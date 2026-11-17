/** Decide which newly posted minutes to extract, extract them in date order, and summarise for review. */
import type { ListedMeeting } from "./county";
import { extractMeeting, type Llm } from "./extraction";
import type { IngestRecord } from "./record";
import { applyToState, openBefore, type PipelineState } from "./state";

export interface IngestOptions {
  /** Most meetings to process in one run. */
  limit: number;
  /** Only these dates, if given. Lets an older gap be filled. */
  only?: string[];
}

export interface IngestPlan {
  /** Meetings to extract, oldest first. */
  toProcess: (ListedMeeting & { minutesUrl: string })[];
  /** Listed meetings whose minutes are not posted yet. */
  awaitingMinutes: ListedMeeting[];
  /** Meetings that cannot be processed, with the reason. */
  skipped: { meeting: ListedMeeting; reason: string }[];
  /** Missing meetings older than the newest one on record. Fill them with --date. */
  gaps: ListedMeeting[];
}

/** Decide what to do with each listed meeting, without calling the model. */
export function planIngest(listed: ListedMeeting[], state: PipelineState, options: IngestOptions, today: string): IngestPlan {
  const newest = [...state.meetingIds].sort().at(-1) ?? "";
  const plan: IngestPlan = { toProcess: [], awaitingMinutes: [], skipped: [], gaps: [] };
  const seen = new Set<string>();

  for (const meeting of [...listed].sort((a, b) => a.date.localeCompare(b.date))) {
    if (meeting.date > today) continue;
    if (options.only && !options.only.includes(meeting.date)) continue;
    if (state.meetingIds.has(meeting.date)) continue;
    if (seen.has(meeting.date)) {
      plan.skipped.push({ meeting, reason: "a second meeting on the same date; only one per date is tracked" });
      continue;
    }
    seen.add(meeting.date);
    if (!meeting.minutesUrl) {
      plan.awaitingMinutes.push(meeting);
      continue;
    }
    if (!/\.pdf($|\?)/i.test(meeting.minutesUrl)) {
      plan.skipped.push({ meeting, reason: "minutes are not a PDF" });
      continue;
    }
    if (!options.only && meeting.date < newest) {
      plan.gaps.push(meeting);
      continue;
    }
    plan.toProcess.push({ ...meeting, minutesUrl: meeting.minutesUrl });
  }

  plan.toProcess = plan.toProcess.slice(0, options.limit);
  return plan;
}

export interface IngestRun {
  records: IngestRecord[];
  /** Set when a meeting failed. Meetings before it were kept; it and later ones were not processed. */
  stopped?: { date: string; error: string };
}

/** Extract the planned meetings in date order, saving each record as it is finished. */
export async function runIngest(input: {
  plan: IngestPlan;
  state: PipelineState;
  llm: Llm;
  model: string;
  downloadPdf: (url: string) => Promise<Buffer>;
  save: (record: IngestRecord) => void;
  log?: (line: string) => void;
}): Promise<IngestRun> {
  const { plan, state, llm, model, downloadPdf, save } = input;
  const log = input.log ?? (() => {});
  const records: IngestRecord[] = [];

  for (const listed of plan.toProcess) {
    log(`  ${listed.date} ${listed.title}`);
    try {
      const pdf = await downloadPdf(listed.minutesUrl);
      const { record } = await extractMeeting({
        llm,
        model,
        pdf,
        listed,
        openFollowUps: openBefore(state, listed.date),
        activeThreads: [...state.activeThreads],
      });
      save(record);
      applyToState(state, record);
      records.push(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`    failed: ${message}`);
      return { records, stopped: { date: listed.date, error: message } };
    }
  }
  return { records };
}

/** GitHub rejects pull request descriptions longer than 65,536 characters. */
const MAX_REPORT_LENGTH = 60_000;

/**
 * Markdown summary for the pull request a reviewer reads. A large run gets a
 * shorter form so it fits; each record keeps its full list of concerns in
 * `extraction.warnings`.
 */
export function buildReport(run: IngestRun, plan: IngestPlan, maxLength: number = MAX_REPORT_LENGTH): string {
  const full = renderReport(run, plan, false);
  if (full.length <= maxLength) return full;
  const compact = renderReport(run, plan, true);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 80)}\n\n_Summary cut short. See the files in this pull request._\n`;
}

function renderReport(run: IngestRun, plan: IngestPlan, compact: boolean): string {
  const { records, stopped } = run;
  const lines: string[] = [];
  if (compact) {
    lines.push("_Shortened to fit: meeting summaries and follow-up details are left out here. Each record's full list of concerns is in its `extraction.warnings`._", "");
  }
  if (stopped) {
    const remaining = plan.toProcess.filter((m) => m.date >= stopped.date).map((m) => m.date);
    lines.push(`> **This run stopped early.** ${stopped.date} failed (${stopped.error}), so these meetings were not processed: ${remaining.join(", ")}. They will be picked up by the next run after this is merged.`, "");
  }
  const model = records[0]?.extraction.model ?? "Claude";
  lines.push(
    `Adds ${records.length} meeting${records.length === 1 ? "" : "s"} extracted from the county's official minutes by ${model}. Each record was checked against its PDF by a second pass; anything that pass was unsure about is listed under "To check".`,
    "",
    "**Merging publishes these meetings to the live site** (Supabase), including their new follow-ups, follow-up status changes and topic threads. To correct something, edit the file in this pull request before merging.",
    "",
  );

  for (const record of records) {
    const { meeting, extraction } = record;
    const split = meeting.keyVotes.filter((v) => !v.passed || (v.votes && v.votes.nays.length > 0));
    lines.push(`## ${meeting.date} — ${meeting.type} meeting`, "");
    lines.push(
      `[Minutes PDF](${meeting.sourceUrl}) · ${meeting.attendees.length} commissioners present · ${meeting.keyVotes.length} votes (${split.length} split or failed) · ${meeting.publicComments.length} public comments · ${meeting.staffActivity.length} staff presenters · ${meeting.followUps.length} new follow-ups${extraction.revised ? " · revised once after review" : ""}`,
      "",
    );
    if (!compact) lines.push(meeting.tldr, "");
    if (split.length > 0) {
      lines.push("**Split or failed votes**", "");
      for (const v of split) {
        const against = v.votes?.nays.length ? `, against: ${v.votes.nays.join(", ")}` : "";
        lines.push(`- ${v.description} — ${v.passed ? "passed" : "failed"} ${v.result}${against}${v.page ? ` (p. ${v.page})` : ""}`);
      }
      lines.push("");
    }
    const moved = record.resolvedFollowUps;
    if (moved.length > 0 && compact) {
      lines.push(`${moved.length} earlier follow-up${moved.length === 1 ? "" : "s"} updated.`, "");
    } else if (moved.length > 0) {
      lines.push("**Earlier follow-ups updated**", "");
      for (const u of moved) lines.push(`- \`${u.id}\` → ${u.status.replace("_", " ")}: ${u.resolution}`);
      lines.push("");
    }
    if (!compact && (record.newThreads.length > 0 || record.threadUpdates.length > 0)) {
      lines.push(`Topic threads: ${record.newThreads.length} new (${record.newThreads.map((t) => t.title).join("; ") || "none"}), ${record.threadUpdates.length} updated.`, "");
    }
    if (extraction.warnings.length > 0) {
      lines.push("**To check**", "");
      for (const w of extraction.warnings) lines.push(`- ${compact && w.length > 300 ? `${w.slice(0, 300)}…` : w}`);
      lines.push("");
    } else {
      lines.push("No concerns raised by the automated review.", "");
    }
  }

  if (plan.gaps.length > 0) {
    lines.push(
      "## Not on record",
      "",
      `These meetings have posted minutes but are not in Supabase, and are older than the newest meeting on record: ${plan.gaps.map((m) => m.date).join(", ")}. Run the ingest workflow with "dates" set to fill them.`,
      "",
    );
  }
  if (plan.skipped.length > 0) {
    lines.push("## Skipped", "");
    for (const s of plan.skipped) lines.push(`- ${s.meeting.date} ${s.meeting.title}: ${s.reason}`);
    lines.push("");
  }
  if (plan.awaitingMinutes.length > 0) {
    lines.push(`Minutes not yet posted for: ${plan.awaitingMinutes.map((m) => m.date).join(", ")}.`, "");
  }
  return lines.join("\n");
}
