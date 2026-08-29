import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { SYNC_TABLES, syncColumns } from "@/lib/sync/protocol";

// The Mac's copy of the library. It no longer renders anything — screens are
// built from each device's own database now. This exists to be the durable
// peer every device reconciles against, and to keep serving the legacy audio
// that was uploaded back when files lived on disk.

const DATA_DIR = path.join(process.cwd(), "data");
export const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
export const ART_DIR = path.join(process.cwd(), "public", "art");
export const SHEET_DIR = path.join(process.cwd(), "public", "sheets");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(ART_DIR, { recursive: true });
fs.mkdirSync(SHEET_DIR, { recursive: true });

export const sqlite = new Database(path.join(DATA_DIR, "woodshed.db"));
sqlite.pragma("busy_timeout = 10000");
sqlite.pragma("journal_mode = WAL");
// Off for the same reason as on the device: a pull can carry a child row
// ahead of its parent, and tombstones make cascades actively harmful.
sqlite.pragma("foreign_keys = OFF");

// Mirrors lib/sync/schema.ts, plus server_seq — the monotonic cursor devices
// page through. Devices never send it; the server assigns it on every accept.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS standards (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, composer TEXT, key TEXT, form TEXT,
  feel TEXT, tempo_bpm INTEGER, status INTEGER NOT NULL DEFAULT 0,
  called_often INTEGER NOT NULL DEFAULT 0, lyrics TEXT, chord_interpretation TEXT,
  artwork_path TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, file_path TEXT NOT NULL,
  original_name TEXT, performer TEXT, year INTEGER, instrumentation TEXT,
  is_reference INTEGER NOT NULL DEFAULT 0, duration_sec REAL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY, recording_id TEXT NOT NULL, label TEXT,
  start_sec REAL NOT NULL, end_sec REAL NOT NULL, note TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, body TEXT NOT NULL, tag TEXT,
  recording_id TEXT, timestamp_sec REAL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sheets (
  id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, file_path TEXT NOT NULL,
  original_name TEXT, kind TEXT NOT NULL DEFAULT 'image',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS standard_groups (
  id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, group_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS review_log (
  id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, mode TEXT NOT NULL,
  rating INTEGER NOT NULL, reviewed_at INTEGER NOT NULL, next_due INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
`);

for (const t of SYNC_TABLES) {
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_seq ON ${t} (server_seq)`);
}
sqlite.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_sg_pair ON standard_groups (standard_id, group_id)",
);

/** Next value of the global accept counter. Bumped once per sync request. */
export function nextSeq(): number {
  const row = sqlite.prepare("SELECT value FROM sync_state WHERE key = 'seq'").get() as
    | { value: number }
    | undefined;
  const next = (row?.value ?? 0) + 1;
  sqlite
    .prepare(
      "INSERT INTO sync_state (key, value) VALUES ('seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(next);
  return next;
}

export function currentSeq(): number {
  const row = sqlite.prepare("SELECT value FROM sync_state WHERE key = 'seq'").get() as
    | { value: number }
    | undefined;
  return row?.value ?? 0;
}

export { SYNC_TABLES, syncColumns };
