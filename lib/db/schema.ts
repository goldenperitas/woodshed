import { sqliteTable, integer, text, real, primaryKey } from "drizzle-orm/sqlite-core";

// The main table. A standard you want to drill into your head.
// status: 0 = not yet known (default), 1 = knows it exists, 2 = knows chords /
// can play the head, 3 = gig-ready.
export const standards = sqliteTable("standards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  composer: text("composer"),
  key: text("key"), // original key, e.g. "F", "Bb"
  form: text("form"), // e.g. "AABA 32", "Blues 12", "ABAC"
  feel: text("feel"), // e.g. "med swing", "bossa", "ballad", "up"
  tempoBpm: integer("tempo_bpm"),
  status: integer("status").notNull().default(0), // 0 | 1 | 2 | 3
  calledOften: integer("called_often").notNull().default(0), // 0 | 1, jam-frequent flag
  lyrics: text("lyrics"),
  chordInterpretation: text("chord_interpretation"), // free-form, your own words
  artworkPath: text("artwork_path"), // optional uploaded jacket, e.g. "art/xxx.jpg"
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Multiple audio takes per standard. Files live on disk under public/audio.
export const recordings = sqliteTable("recordings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  standardId: integer("standard_id")
    .notNull()
    .references(() => standards.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(), // relative, e.g. "audio/xxxx.mp3"
  originalName: text("original_name"),
  performer: text("performer"),
  year: integer("year"),
  instrumentation: text("instrumentation"),
  isReference: integer("is_reference").notNull().default(0), // the "learn this first" take
  durationSec: real("duration_sec"),
  createdAt: integer("created_at").notNull(),
});

// Loop points / markers on a recording. Doubles as the source for the
// "hear the head, name the tune" drill (label = 'head').
export const regions = sqliteTable("regions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recordingId: integer("recording_id")
    .notNull()
    .references(() => recordings.id, { onDelete: "cascade" }),
  label: text("label"), // head | bridge | A | B | solo | custom text
  startSec: real("start_sec").notNull(),
  endSec: real("end_sec").notNull(),
  note: text("note"),
});

// Multiple notes per standard. Can optionally be pinned to a moment in a recording.
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  standardId: integer("standard_id")
    .notNull()
    .references(() => standards.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  tag: text("tag"), // harmony | melody | comping | soloist | general
  recordingId: integer("recording_id").references(() => recordings.id, {
    onDelete: "set null",
  }),
  timestampSec: real("timestamp_sec"),
  createdAt: integer("created_at").notNull(),
});

// Grouping (rhythm changes family, blues family, "ballads I'm learning", etc.)
export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
});

// Many-to-many: a standard can belong to several groups.
export const standardGroups = sqliteTable(
  "standard_groups",
  {
    standardId: integer("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.standardId, t.groupId] })],
);

// Recall-drill history. Lite spaced repetition: nextDue computed from rating.
export const reviewLog = sqliteTable("review_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  standardId: integer("standard_id")
    .notNull()
    .references(() => standards.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(), // name_to_info | audio_to_name
  rating: integer("rating").notNull(), // 1 again | 2 hard | 3 good | 4 easy
  reviewedAt: integer("reviewed_at").notNull(),
  nextDue: integer("next_due").notNull(),
});

export type Standard = typeof standards.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
export type Region = typeof regions.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type ReviewLogRow = typeof reviewLog.$inferSelect;
