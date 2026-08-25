#!/usr/bin/env node
// One-time conversion of the Mac's database to the sync-ready shape:
// integer primary keys become UUIDs, and every row gains updated_at,
// deleted_at and server_seq.
//
// Integer keys cannot survive offline editing — two devices adding a tune
// would both mint id 7 — so the ids have to change before any device pulls.
// Audio and artwork paths are left exactly as they are: those files stay in
// public/ and remain fetchable while the Mac is reachable.
//
//   node scripts/migrate-to-uuid.js
//
// Safe to run twice: it detects an already-migrated database and stops.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const DB_PATH = path.join(process.cwd(), "data", "woodshed.db");

if (!fs.existsSync(DB_PATH)) {
  console.error(`no database at ${DB_PATH} — nothing to migrate`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("foreign_keys = OFF");

const columns = (table) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);

if (!columns("standards").length) {
  console.error("standards table missing — is this the right database?");
  process.exit(1);
}
if (columns("standards").includes("server_seq")) {
  console.log("already migrated — nothing to do");
  process.exit(0);
}

// Checkpoint the WAL first so the backup copy is complete on its own.
db.pragma("wal_checkpoint(TRUNCATE)");
const backup = DB_PATH.replace(/\.db$/, `-pre-uuid-${Date.now()}.db`);
fs.copyFileSync(DB_PATH, backup);
console.log(`backup written: ${path.basename(backup)}`);

const NOW = Date.now();
const uid = () => crypto.randomUUID();

const NEW_TABLES = {
  standards: `CREATE TABLE standards (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, composer TEXT, key TEXT, form TEXT,
    feel TEXT, tempo_bpm INTEGER, status INTEGER NOT NULL DEFAULT 0,
    called_often INTEGER NOT NULL DEFAULT 0, lyrics TEXT, chord_interpretation TEXT,
    artwork_path TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0)`,
  recordings: `CREATE TABLE recordings (
    id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, file_path TEXT NOT NULL,
    original_name TEXT, performer TEXT, year INTEGER, instrumentation TEXT,
    is_reference INTEGER NOT NULL DEFAULT 0, duration_sec REAL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0)`,
  regions: `CREATE TABLE regions (
    id TEXT PRIMARY KEY, recording_id TEXT NOT NULL, label TEXT,
    start_sec REAL NOT NULL, end_sec REAL NOT NULL, note TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0)`,
  notes: `CREATE TABLE notes (
    id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, body TEXT NOT NULL, tag TEXT,
    recording_id TEXT, timestamp_sec REAL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0)`,
  groups: `CREATE TABLE groups (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0)`,
  standard_groups: `CREATE TABLE standard_groups (
    id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, group_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0)`,
  review_log: `CREATE TABLE review_log (
    id TEXT PRIMARY KEY, standard_id TEXT NOT NULL, mode TEXT NOT NULL,
    rating INTEGER NOT NULL, reviewed_at INTEGER NOT NULL, next_due INTEGER NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    deleted_at INTEGER, server_seq INTEGER NOT NULL DEFAULT 0)`,
};

const migrate = db.transaction(() => {
  const old = {};
  for (const table of Object.keys(NEW_TABLES)) {
    old[table] = columns(table).length ? db.prepare(`SELECT * FROM ${table}`).all() : [];
    db.exec(`DROP TABLE IF EXISTS ${table}`);
    db.exec(NEW_TABLES[table]);
  }

  // Old integer id -> new UUID, per table, so foreign keys can be rewritten.
  const map = { standards: new Map(), recordings: new Map(), groups: new Map() };
  for (const t of Object.keys(map)) {
    for (const row of old[t]) map[t].set(row.id, uid());
  }

  // Rows predate the updated_at column in some cases; fall back to created_at
  // and finally to migration time, so last-write-wins always has a number.
  const stamp = (row) => row.updated_at ?? row.created_at ?? NOW;
  const born = (row) => row.created_at ?? NOW;
  const seq = 1;

  const ins = (table, cols) =>
    db.prepare(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    );

  const stdIns = ins("standards", [
    "id", "title", "composer", "key", "form", "feel", "tempo_bpm", "status",
    "called_often", "lyrics", "chord_interpretation", "artwork_path",
    "created_at", "updated_at", "deleted_at", "server_seq",
  ]);
  for (const r of old.standards) {
    stdIns.run(
      map.standards.get(r.id), r.title, r.composer, r.key, r.form, r.feel,
      r.tempo_bpm, r.status ?? 0, r.called_often ?? 0, r.lyrics,
      r.chord_interpretation, r.artwork_path, born(r), stamp(r), null, seq,
    );
  }

  const grpIns = ins("groups", [
    "id", "name", "description", "created_at", "updated_at", "deleted_at", "server_seq",
  ]);
  for (const r of old.groups) {
    grpIns.run(map.groups.get(r.id), r.name, r.description, NOW, NOW, null, seq);
  }

  const recIns = ins("recordings", [
    "id", "standard_id", "file_path", "original_name", "performer", "year",
    "instrumentation", "is_reference", "duration_sec",
    "created_at", "updated_at", "deleted_at", "server_seq",
  ]);
  let orphans = 0;
  for (const r of old.recordings) {
    const parent = map.standards.get(r.standard_id);
    if (!parent) { orphans++; continue; }
    recIns.run(
      map.recordings.get(r.id), parent, r.file_path, r.original_name, r.performer,
      r.year, r.instrumentation, r.is_reference ?? 0, r.duration_sec,
      born(r), stamp(r), null, seq,
    );
  }

  const regIns = ins("regions", [
    "id", "recording_id", "label", "start_sec", "end_sec", "note",
    "created_at", "updated_at", "deleted_at", "server_seq",
  ]);
  for (const r of old.regions) {
    const parent = map.recordings.get(r.recording_id);
    if (!parent) { orphans++; continue; }
    regIns.run(uid(), parent, r.label, r.start_sec, r.end_sec, r.note, NOW, NOW, null, seq);
  }

  const noteIns = ins("notes", [
    "id", "standard_id", "body", "tag", "recording_id", "timestamp_sec",
    "created_at", "updated_at", "deleted_at", "server_seq",
  ]);
  for (const r of old.notes) {
    const parent = map.standards.get(r.standard_id);
    if (!parent) { orphans++; continue; }
    noteIns.run(
      uid(), parent, r.body, r.tag,
      r.recording_id != null ? map.recordings.get(r.recording_id) ?? null : null,
      r.timestamp_sec, born(r), stamp(r), null, seq,
    );
  }

  const sgIns = ins("standard_groups", [
    "id", "standard_id", "group_id", "sort_order",
    "created_at", "updated_at", "deleted_at", "server_seq",
  ]);
  for (const r of old.standard_groups) {
    const sid = map.standards.get(r.standard_id);
    const gid = map.groups.get(r.group_id);
    if (!sid || !gid) { orphans++; continue; }
    // Same deterministic id the app mints, so a membership created on a device
    // and one migrated here converge instead of colliding.
    sgIns.run(`${sid}:${gid}`, sid, gid, r.sort_order ?? 0, NOW, NOW, null, seq);
  }

  const rlIns = ins("review_log", [
    "id", "standard_id", "mode", "rating", "reviewed_at", "next_due",
    "created_at", "updated_at", "deleted_at", "server_seq",
  ]);
  for (const r of old.review_log) {
    const parent = map.standards.get(r.standard_id);
    if (!parent) { orphans++; continue; }
    rlIns.run(
      uid(), parent, r.mode, r.rating, r.reviewed_at, r.next_due,
      r.reviewed_at, r.reviewed_at, null, seq,
    );
  }

  db.exec("CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL)");
  db.prepare(
    "INSERT INTO sync_state (key, value) VALUES ('seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(seq);

  return {
    counts: Object.fromEntries(Object.keys(NEW_TABLES).map((t) => [t, old[t].length])),
    orphans,
  };
});

const { counts, orphans } = migrate();
db.pragma("wal_checkpoint(TRUNCATE)");
db.close();

console.log("migrated:", counts);
if (orphans) console.log(`skipped ${orphans} orphaned row(s) with no surviving parent`);
console.log("done — every device will pull this on its next sync");
