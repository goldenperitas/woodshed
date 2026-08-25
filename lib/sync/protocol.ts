// The wire format between a device and the Mac, and the one conflict rule
// both sides apply.
//
// Two clocks are in play and they do different jobs:
//   updatedAt  — the row's own clock, set by whoever edited it. Decides who
//                wins a conflict (last write wins).
//   serverSeq  — a counter the server bumps for every row it accepts. Decides
//                what a puller has not seen yet. Kept separate because device
//                clocks drift, and a cursor built on a drifting clock silently
//                skips rows.

import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { SYNC_TABLES, type SyncTable } from "./schema";
import * as schema from "./schema";

export type SyncRow = Record<string, string | number | null>;
export type SyncPayload = Partial<Record<SyncTable, SyncRow[]>>;

export type PushRequest = {
  /** Highest serverSeq this device has already applied. 0 = first ever sync. */
  since: number;
  changes: SyncPayload;
};

export type PullResponse = {
  /** New cursor to store once `changes` has been applied. */
  cursor: number;
  changes: SyncPayload;
  /** Server wall clock, so a device can warn about a badly skewed clock. */
  serverTime: number;
};

const TABLE_BY_NAME: Record<SyncTable, SQLiteTable> = {
  standards: schema.standards,
  groups: schema.groups,
  recordings: schema.recordings,
  regions: schema.regions,
  notes: schema.notes,
  standard_groups: schema.standardGroups,
  review_log: schema.reviewLog,
};

/**
 * Physical column names for a table, excluding `dirty` — that flag is each
 * device's private bookkeeping and must never cross the wire.
 */
export function syncColumns(table: SyncTable): string[] {
  const cols = getTableColumns(TABLE_BY_NAME[table]);
  return Object.values(cols)
    .map((c) => c.name)
    .filter((name) => name !== "dirty");
}

export { SYNC_TABLES };
export type { SyncTable };

/**
 * Last-write-wins, with a deliberate tie-break: on equal timestamps the
 * incoming row loses. Re-pushing an unchanged row is common (a device pulls
 * back what it just pushed), and letting it lose keeps that a no-op.
 */
export function incomingWins(incomingUpdatedAt: number, localUpdatedAt: number): boolean {
  return incomingUpdatedAt > localUpdatedAt;
}
