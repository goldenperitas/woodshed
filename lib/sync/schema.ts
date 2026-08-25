// Shared table definitions. Both the browser (OPFS SQLite) and the Mac
// (better-sqlite3) run this exact schema — sync is just moving rows between
// two copies of the same shape, so the definition must not fork.
//
// No "server-only" here on purpose: this module is imported by client code.
import { sqliteTable, integer, text, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// Columns every syncable row carries.
//   id         UUID minted by whichever device created the row (offline-safe)
//   updatedAt  last-write-wins clock
//   deletedAt  tombstone; rows are never physically deleted, or the next pull
//              from a peer that still has the row would resurrect it
//   dirty      1 = written locally since the last successful push (local only)
const syncCols = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
  dirty: integer("dirty").notNull().default(0),
};

export const standards = sqliteTable("standards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  composer: text("composer"),
  key: text("key"), // original key, e.g. "F", "Bb"
  form: text("form"), // e.g. "AABA 32", "Blues 12", "ABAC"
  feel: text("feel"), // e.g. "med swing", "bossa", "ballad", "up"
  tempoBpm: integer("tempo_bpm"),
  status: integer("status").notNull().default(0), // 0 | 1 | 2 | 3
  calledOften: integer("called_often").notNull().default(0), // jam-frequent flag
  lyrics: text("lyrics"),
  chordInterpretation: text("chord_interpretation"),
  artworkPath: text("artwork_path"), // "art/xxx.jpg" (legacy, server) or "local:art:<id>"
  ...syncCols,
});

// Audio takes. filePath is either a legacy server path ("audio/xxx.mp3") or a
// "local:<uuid>" key into this device's blob store — see lib/offline.ts.
export const recordings = sqliteTable(
  "recordings",
  {
    id: text("id").primaryKey(),
    standardId: text("standard_id").notNull(),
    filePath: text("file_path").notNull(),
    originalName: text("original_name"),
    performer: text("performer"),
    year: integer("year"),
    instrumentation: text("instrumentation"),
    isReference: integer("is_reference").notNull().default(0),
    durationSec: real("duration_sec"),
    ...syncCols,
  },
  (t) => [index("idx_rec_std").on(t.standardId)],
);

export const regions = sqliteTable(
  "regions",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id").notNull(),
    label: text("label"), // head | bridge | A | B | solo | custom
    startSec: real("start_sec").notNull(),
    endSec: real("end_sec").notNull(),
    note: text("note"),
    ...syncCols,
  },
  (t) => [index("idx_reg_rec").on(t.recordingId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    standardId: text("standard_id").notNull(),
    body: text("body").notNull(),
    tag: text("tag"), // harmony | melody | comping | soloist | general
    recordingId: text("recording_id"),
    timestampSec: real("timestamp_sec"),
    ...syncCols,
  },
  (t) => [index("idx_note_std").on(t.standardId)],
);

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ...syncCols,
});

// Membership carries its own UUID rather than a composite key: sync addresses
// rows by id, and a tombstoned membership still has to be nameable.
export const standardGroups = sqliteTable(
  "standard_groups",
  {
    id: text("id").primaryKey(),
    standardId: text("standard_id").notNull(),
    groupId: text("group_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...syncCols,
  },
  (t) => [uniqueIndex("idx_sg_pair").on(t.standardId, t.groupId)],
);

export const reviewLog = sqliteTable(
  "review_log",
  {
    id: text("id").primaryKey(),
    standardId: text("standard_id").notNull(),
    mode: text("mode").notNull(), // name_to_info | audio_to_name | session_key
    rating: integer("rating").notNull(), // 1 again | 2 hard | 3 good | 4 easy
    reviewedAt: integer("reviewed_at").notNull(),
    nextDue: integer("next_due").notNull(),
    ...syncCols,
  },
  (t) => [index("idx_rl_std").on(t.standardId)],
);

export type Standard = typeof standards.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
export type Region = typeof regions.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type ReviewLogRow = typeof reviewLog.$inferSelect;

// The tables sync moves, in dependency order (parents first) so a full pull
// applied in sequence never leaves a dangling reference mid-transaction.
export const SYNC_TABLES = [
  "standards",
  "groups",
  "recordings",
  "regions",
  "notes",
  "standard_groups",
  "review_log",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];
