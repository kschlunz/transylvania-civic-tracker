/** Reviewed records waiting in, or already published from, data/ingest. */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { IngestRecordSchema, type IngestRecord } from "./record";

export const INGEST_DIR = path.resolve(__dirname, "../../data/ingest");

export function recordPath(id: string, dir: string = INGEST_DIR): string {
  return path.join(dir, `${id}.json`);
}

export function readRecord(file: string): IngestRecord {
  const parsed = IngestRecordSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${path.basename(file)} is invalid:\n${z.prettifyError(parsed.error)}`);
  const expected = `${parsed.data.meeting.id}.json`;
  if (path.basename(file) !== expected) throw new Error(`${path.basename(file)}: file name must be ${expected}`);
  return parsed.data;
}

export function writeRecord(record: IngestRecord, dir: string = INGEST_DIR): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = recordPath(record.meeting.id, dir);
  fs.writeFileSync(file, JSON.stringify(IngestRecordSchema.parse(record), null, 2) + "\n");
  return file;
}

/** Meeting ids that already have a record file. */
export function recordIds(dir: string = INGEST_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}
