// Local-first database worker.
//
// Runs SQLite (WASM) against the origin private file system using the
// OPFS SAHPool VFS. SAHPool is the one OPFS backend that needs neither
// SharedArrayBuffer nor COOP/COEP headers, so the app stays a plain
// same-origin page and still gets a real, durable, transactional DB —
// including inside the iOS PWA.
//
// Loaded from /db-worker.js (outside the bundler) so the wasm lives at a
// stable URL the service worker can precache for offline boot.

import sqlite3InitModule from "/sqlite/sqlite3.mjs";

const DB_PATH = "/woodshed.sqlite3";
const POOL_NAME = "woodshed-pool";

let db = null;

// Every syncable row carries: a UUID primary key (so a device can mint IDs
// while offline), updated_at (last-write-wins), deleted_at (tombstone — rows
// are never physically removed, or a peer would resurrect them on the next
// pull) and dirty (1 = written locally, not yet pushed).
//
// Foreign keys are deliberately OFF: a sync pull can deliver a child row
// before its parent, and cascades would fight the tombstones. Referential
// integrity is maintained by the app layer instead.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS standards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  composer TEXT,
  key TEXT,
  form TEXT,
  feel TEXT,
  tempo_bpm INTEGER,
  status INTEGER NOT NULL DEFAULT 0,
  called_often INTEGER NOT NULL DEFAULT 0,
  lyrics TEXT,
  chord_interpretation TEXT,
  artwork_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  standard_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  performer TEXT,
  year INTEGER,
  instrumentation TEXT,
  is_reference INTEGER NOT NULL DEFAULT 0,
  duration_sec REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL,
  label TEXT,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  standard_id TEXT NOT NULL,
  body TEXT NOT NULL,
  tag TEXT,
  recording_id TEXT,
  timestamp_sec REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);

-- Membership gets its own UUID rather than a composite key: sync moves rows
-- by id, and a tombstoned membership has to be addressable.
CREATE TABLE IF NOT EXISTS standard_groups (
  id TEXT PRIMARY KEY,
  standard_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS review_log (
  id TEXT PRIMARY KEY,
  standard_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  rating INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL,
  next_due INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sg_pair ON standard_groups (standard_id, group_id);
CREATE INDEX IF NOT EXISTS idx_rec_std ON recordings (standard_id);
CREATE INDEX IF NOT EXISTS idx_reg_rec ON regions (recording_id);
CREATE INDEX IF NOT EXISTS idx_note_std ON notes (standard_id);
CREATE INDEX IF NOT EXISTS idx_rl_std ON review_log (standard_id);

-- Local-only bookkeeping; never synced.
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

async function boot() {
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME });
  db = new pool.OpfsSAHPoolDb(DB_PATH);
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(SCHEMA);
  return { version: sqlite3.version.libVersion };
}

// sqlite-wasm rejects `undefined` binds; drizzle emits them for absent values.
function normalize(params) {
  return (params ?? []).map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

// Shaped for drizzle's sqlite-proxy driver, which wants positional rows —
// and, for `get`, the single row itself rather than a list of rows.
function run(sql, params, method) {
  const bind = normalize(params);
  if (method === "run") {
    db.exec({ sql, bind });
    return { rows: [] };
  }
  const rows = db.exec({ sql, bind, rowMode: "array", returnValue: "resultRows" });
  if (method === "get") return { rows: rows[0] ?? undefined };
  return { rows };
}

const handlers = {
  init: () => bootPromise,
  exec: ({ sql, params, method }) => run(sql, params, method),
  batch: ({ items }) => items.map((it) => run(it.sql, it.params, it.method)),
  // Whole-statement scripts (migrations, bulk sync application). Wrapped in a
  // transaction so a partial pull can never land.
  script: ({ statements }) => {
    db.exec("BEGIN");
    try {
      for (const s of statements) run(s.sql, s.params, "run");
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { ok: true };
  },
};

const bootPromise = boot();

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    await bootPromise;
    const result = await handlers[type](payload ?? {});
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
