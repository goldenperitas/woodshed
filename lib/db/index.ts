import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Where the SQLite file and uploaded audio live. Kept out of the app bundle,
// on the Mac's disk. AUDIO goes in public/audio so Next serves it with HTTP
// Range support (Safari needs 206 responses to seek/loop audio).
const DATA_DIR = path.join(process.cwd(), "data");
export const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
export const ART_DIR = path.join(process.cwd(), "public", "art");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(ART_DIR, { recursive: true });

const sqlite = new Database(path.join(DATA_DIR, "woodshed.db"));
// Wait instead of erroring when another connection holds the lock. Next's
// build spawns several worker processes that each open this file at once.
sqlite.pragma("busy_timeout = 10000");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Idempotent schema creation — no migration tooling needed for a solo app.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS standards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  composer TEXT,
  key TEXT,
  form TEXT,
  feel TEXT,
  tempo_bpm INTEGER,
  status INTEGER NOT NULL DEFAULT 1,
  called_often INTEGER NOT NULL DEFAULT 0,
  lyrics TEXT,
  chord_interpretation TEXT,
  artwork_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  standard_id INTEGER NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  original_name TEXT,
  performer TEXT,
  year INTEGER,
  instrumentation TEXT,
  is_reference INTEGER NOT NULL DEFAULT 0,
  duration_sec REAL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  label TEXT,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  standard_id INTEGER NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  tag TEXT,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE SET NULL,
  timestamp_sec REAL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS standard_groups (
  standard_id INTEGER NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (standard_id, group_id)
);

CREATE TABLE IF NOT EXISTS review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  standard_id INTEGER NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  rating INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL,
  next_due INTEGER NOT NULL
);
`);

// Idempotent column add for DBs created before artwork support.
try {
  sqlite.exec("ALTER TABLE standards ADD COLUMN artwork_path TEXT");
} catch {
  // column already exists — fine
}

export const db = drizzle(sqlite, { schema });
export { schema };
