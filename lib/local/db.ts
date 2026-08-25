"use client";

// The device's copy of the library. Everything the UI reads comes from here,
// so screens open with no network at all; /api/sync only reconciles it with
// the Mac afterwards.
//
// One worker per tab, created once at module scope. The OPFS SAHPool VFS
// takes exclusive access handles on its files, so a second worker opening the
// same database fails hard — React's StrictMode double-mount is enough to
// trigger it, which is why this must not live in a component effect.

import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/lib/sync/schema";
import { SYNC_TABLES } from "@/lib/sync/schema";
import { logEvent } from "./log";

type Method = "run" | "all" | "values" | "get";
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  logEvent("db.worker");
  worker = new Worker("/db-worker.js", { type: "module" });
  installHandoff();
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(new Error(error));
  };
  worker.onerror = (e) => {
    logEvent("db.worker.fail", { msg: e.message });
    const err = new Error(`db worker failed: ${e.message}`);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  return worker;
}

function call<T>(type: string, payload?: unknown): Promise<T> {
  const w = getWorker();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, type, payload });
  });
}

/**
 * Hands the database back when the page goes away, and takes it again when it
 * comes back.
 *
 * Offline, Next cannot fetch a route payload, so navigation degrades to a full
 * document load — and on iOS the outgoing document is often only frozen into
 * the back/forward cache, worker and OPFS handles intact. Without this, the
 * incoming document finds the database already claimed.
 */
let handoffInstalled = false;
function installHandoff() {
  if (handoffInstalled || typeof window === "undefined") return;
  handoffInstalled = true;
  window.addEventListener("pagehide", (e) => {
    logEvent("db.close", { bfcache: e.persisted });
    void call("close").catch(() => {});
  });
  // Reopening is lazy: the worker opens on the next query, so a restored page
  // needs nothing here beyond its normal render.
}

type OpenInfo = {
  version: string;
  /** false when the worker already had it open and this call cost nothing */
  opened?: boolean;
  ms?: number;
  lockMs?: number;
  lockTimedOut?: boolean;
  attempts?: number;
};

/** Resolves once the database is open and migrated. Safe to await repeatedly. */
export async function ready(): Promise<{ version: string }> {
  let info: OpenInfo;
  try {
    info = await call<OpenInfo>("init");
  } catch (e) {
    logEvent("db.open.fail", { msg: (e as Error).message });
    throw e;
  }
  // Only a real open is worth a line. This runs ahead of every query, and a
  // log full of "already open" would bury the events that matter.
  if (info.opened) {
    logEvent("db.open", {
      ms: info.ms,
      attempts: info.attempts,
      lockMs: info.lockMs,
      ...(info.lockTimedOut ? { lockTimedOut: true } : {}),
    });
  }
  await checkedNotEmpty();
  return info;
}

// A database that opens successfully but empty is indistinguishable, on screen,
// from a library with nothing in it — the worst possible way to report a
// storage failure. Tombstones make the real row count monotonic (deletes leave
// rows behind), so "we had rows before and now have none" can only mean the
// device lost its storage, or the wrong file was opened.
//
// iOS reclaims script storage from sites it has not seen in a while. When that
// happens the Mac still has everything, so the honest response is to go and
// get it rather than to stop with an error — and then to say what happened,
// because the audio copies went with it and only the owner can put those back.
const ROW_MARKER = "woodshed.rowFloor";
const RECOVERED_MARKER = "woodshed.recovered";

/**
 * Remembers that this device does have rows, so that opening to an empty
 * database later is recognisable as a loss rather than a first run.
 *
 * Called after a sync rather than only at boot: a device's very first open is
 * legitimately empty, and the rows arrive seconds later.
 */
export async function recordRowFloor(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  const total = await totalRows();
  if (total > 0) localStorage.setItem(ROW_MARKER, String(total));
}

/** Set when this device rebuilt itself from the Mac; read by RecoveryNotice. */
export function recoveredAt(): number | null {
  const v = Number(localStorage.getItem(RECOVERED_MARKER) ?? 0);
  return v > 0 ? v : null;
}

export function clearRecovered(): void {
  localStorage.removeItem(RECOVERED_MARKER);
}

// Counted once per document, not once per query. ready() runs ahead of every
// read, and the check walks all seven tables — cheap on its own, wasteful
// several times a screen. The database cannot lose its contents while a
// document holds it open: the one thing that empties it, rebuilding from the
// diagnostics screen, reloads the page.
let emptyCheck: Promise<void> | null = null;

function checkedNotEmpty(): Promise<void> {
  if (!emptyCheck) emptyCheck = assertNotSilentlyEmpty();
  return emptyCheck;
}

async function assertNotSilentlyEmpty(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  const total = await totalRows();
  if (total > 0) {
    localStorage.setItem(ROW_MARKER, String(total));
    return;
  }
  const floor = Number(localStorage.getItem(ROW_MARKER) ?? 0);
  if (floor === 0) return; // genuinely a first run

  logEvent("db.empty", { floor });

  // Imported here rather than at the top: sync.ts reads from this module, and
  // a cycle between them at load time is not worth the tidier import list.
  const { sync } = await import("./sync");
  const result = await sync();
  const after = await totalRows();
  logEvent("db.recover", { ok: result.ok, pulled: result.pulled, rows: after });

  if (after === 0) {
    // Do not leave a "rebuilt from the Mac" banner standing over a failure.
    localStorage.removeItem(RECOVERED_MARKER);
    throw new Error(
      result.ok
        ? "この端末のデータを読み込めませんでした（空のデータベースが開かれています）"
        : "この端末のデータが消えており、Macにも繋がらないため取り直せません。" +
          "Macと同じネットワークに入ってから開き直してください。",
    );
  }

  localStorage.setItem(ROW_MARKER, String(after));
  localStorage.setItem(RECOVERED_MARKER, String(Date.now()));
}

async function totalRows(): Promise<number> {
  const sql = SYNC_TABLES.map((t) => `SELECT COUNT(*) FROM ${t}`).join(" UNION ALL ");
  const rows = await rawAll(sql);
  return rows.reduce((sum, r) => sum + Number(r[0] ?? 0), 0);
}

/**
 * Drizzle over the worker. The same query builders the server used against
 * better-sqlite3 work here — only the await is new.
 */
export const localDb = drizzle(
  async (sql, params, method) => call<{ rows: unknown[] }>("exec", { sql, params, method }),
  async (batch) => call<{ rows: unknown[] }[]>("batch", { items: batch }),
  { schema },
);

/**
 * Several statements in one transaction. Used by sync so a partially applied
 * pull can never be observed, and by the initial import.
 */
export function runScript(statements: { sql: string; params: unknown[] }[]) {
  if (!statements.length) return Promise.resolve({ ok: true });
  return call<{ ok: true }>("script", { statements });
}

/**
 * Positional rows for SQL built at runtime. Sync walks seven tables whose
 * column lists are only known as strings, which drizzle's builders can't
 * express without a schema lookup per table.
 */
export async function rawAll(sql: string, params: unknown[] = []): Promise<unknown[][]> {
  const r = await call<{ rows: unknown[][] }>("exec", { sql, params, method: "all" });
  return r.rows;
}

/** Local-only key/value bookkeeping (sync cursor, device id). */
export async function getMeta(key: string): Promise<string | null> {
  const r = await call<{ rows: unknown[] }>("exec", {
    sql: "SELECT value FROM sync_meta WHERE key = ?",
    params: [key],
    method: "get",
  });
  const row = r.rows as unknown[] | undefined;
  return row ? (row[0] as string) : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await call("exec", {
    sql: "INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    params: [key, value],
    method: "run",
  });
}

/**
 * Throws away this device's database and reloads, so the next boot rebuilds it
 * from the Mac.
 *
 * Safe by construction: the metadata all lives on the Mac too, and media is in
 * IndexedDB rather than here — the rebuilt rows point straight back at the
 * blobs that are still on the device.
 */
export async function resetLocalDatabase(): Promise<void> {
  await call("close").catch(() => {});
  worker?.terminate();
  worker = null;
  emptyCheck = null;
  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) {
    if (name.includes("woodshed")) await root.removeEntry(name, { recursive: true });
  }
  localStorage.removeItem(ROW_MARKER);
}

export { schema };
