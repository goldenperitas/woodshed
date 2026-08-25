"use client";

// Reconciles this device with the Mac. Never blocks the UI: if it fails, the
// app keeps working entirely from local SQLite and the next attempt picks up
// where this one left off.
//
// Push and pull happen in one request. The device sends every row flagged
// dirty; the server replies with everything past the device's cursor.

import { rawAll, runScript, getMeta, setMeta, recordRowFloor } from "./db";
import { notifyChanged } from "./bus";
import { logEvent } from "./log";
import { SYNC_TABLES, syncColumns } from "@/lib/sync/protocol";
import type { PullResponse, SyncPayload, SyncRow, SyncTable } from "@/lib/sync/protocol";

const CURSOR_KEY = "sync.cursor";

export type SyncResult = {
  ok: boolean;
  pushed: number;
  pulled: number;
  error?: string;
};

let inFlight: Promise<SyncResult> | null = null;

// Kept so the diagnostics screen can show why a sync failed. Sync is silent by
// design — the app works without it — which otherwise leaves no trace at all.
const LAST_KEY = "woodshed.lastSync";

export function lastSync(): (SyncResult & { at: number }) | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
  } catch {
    return null;
  }
}

function recordSync(result: SyncResult) {
  logEvent(result.ok ? "sync.ok" : "sync.fail", {
    pushed: result.pushed,
    pulled: result.pulled,
    ...(result.error ? { msg: result.error } : {}),
  });
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ ...result, at: Date.now() }));
  } catch {
    // storage full or blocked — diagnostics are not worth failing a sync over
  }
}

/** Runs a full sync. Concurrent callers share the one in-flight attempt. */
export function sync(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runSync()
      .then((r) => {
        recordSync(r);
        return r;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
  try {
    const since = Number((await getMeta(CURSOR_KEY)) ?? 0);
    const { changes, stamps } = await collectDirty();
    const pushed = stamps.length;

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ since, changes }),
    });
    if (!res.ok) throw new Error(`sync failed: HTTP ${res.status}`);
    const payload: PullResponse = await res.json();

    const pulled = await applyPull(payload.changes);
    await clearDirty(stamps);
    await setMeta(CURSOR_KEY, String(payload.cursor));
    // Now that rows are definitely here, note it — this is what makes a later
    // empty open recognisable as lost storage instead of a first run.
    if (pulled) await recordRowFloor();

    if (pulled > 0) notifyChanged();
    return { ok: true, pushed, pulled };
  } catch (e) {
    return { ok: false, pushed: 0, pulled: 0, error: String((e as Error)?.message ?? e) };
  }
}

type Stamp = { table: SyncTable; id: string; updatedAt: number };

/**
 * Everything written locally since the last successful push. The updatedAt of
 * each row is remembered so that an edit made *during* the request is not
 * mistakenly marked clean afterwards.
 */
async function collectDirty(): Promise<{ changes: SyncPayload; stamps: Stamp[] }> {
  const changes: SyncPayload = {};
  const stamps: Stamp[] = [];

  for (const table of SYNC_TABLES) {
    const cols = syncColumns(table);
    const rows = await rawAll(`SELECT ${cols.join(", ")} FROM ${table} WHERE dirty = 1`);
    if (!rows.length) continue;

    const objects = rows.map((values) => {
      const row: SyncRow = {};
      cols.forEach((c, i) => (row[c] = values[i] as string | number | null));
      return row;
    });
    changes[table] = objects;
    for (const row of objects) {
      stamps.push({ table, id: String(row.id), updatedAt: Number(row.updated_at) });
    }
  }
  return { changes, stamps };
}

/**
 * Applies the server's rows, guarding each one with the same last-write-wins
 * rule the server used. The guard matters: a row edited on this device while
 * the request was in flight must not be overwritten by the older copy coming
 * back down.
 */
async function applyPull(changes: SyncPayload): Promise<number> {
  const statements: { sql: string; params: unknown[] }[] = [];

  for (const table of SYNC_TABLES) {
    const rows = changes[table];
    if (!rows?.length) continue;
    const cols = syncColumns(table);
    const placeholders = cols.map(() => "?").join(", ");
    const assignments = cols
      .filter((c) => c !== "id")
      .map((c) => `${c} = excluded.${c}`)
      .join(", ");

    for (const row of rows) {
      statements.push({
        sql: `INSERT INTO ${table} (${cols.join(", ")}, dirty) VALUES (${placeholders}, 0)
              ON CONFLICT(id) DO UPDATE SET ${assignments}, dirty = 0
              WHERE excluded.updated_at > ${table}.updated_at`,
        params: cols.map((c) => row[c] ?? null),
      });
    }
  }

  if (statements.length) await runScript(statements);
  return statements.length;
}

async function clearDirty(stamps: Stamp[]): Promise<void> {
  if (!stamps.length) return;
  await runScript(
    stamps.map((s) => ({
      sql: `UPDATE ${s.table} SET dirty = 0 WHERE id = ? AND updated_at = ?`,
      params: [s.id, s.updatedAt],
    })),
  );
}

/** Highest server change this device has applied. */
export async function cursor(): Promise<number> {
  return Number((await getMeta(CURSOR_KEY)) ?? 0);
}

/** Number of rows waiting to be pushed — drives the "unsynced" indicator. */
export async function pendingCount(): Promise<number> {
  let total = 0;
  for (const table of SYNC_TABLES) {
    const rows = await rawAll(`SELECT COUNT(*) FROM ${table} WHERE dirty = 1`);
    total += Number(rows[0]?.[0] ?? 0);
  }
  return total;
}
