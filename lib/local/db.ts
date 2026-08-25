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

type Method = "run" | "all" | "values" | "get";
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
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
  window.addEventListener("pagehide", () => {
    void call("close").catch(() => {});
  });
  // Reopening is lazy: the worker opens on the next query, so a restored page
  // needs nothing here beyond its normal render.
}

/** Resolves once the database is open and migrated. Safe to await repeatedly. */
export async function ready(): Promise<{ version: string }> {
  const info = await call<{ version: string }>("init");
  await assertNotSilentlyEmpty();
  return info;
}

// A database that opens successfully but empty is indistinguishable, on screen,
// from a library with nothing in it — the worst possible way to report a
// storage failure. Tombstones make the real row count monotonic (deletes leave
// rows behind), so "we had rows before and now have none" can only mean the
// wrong file was opened.
const ROW_MARKER = "woodshed.rowFloor";

async function assertNotSilentlyEmpty(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  const total = await totalRows();
  if (total > 0) {
    localStorage.setItem(ROW_MARKER, String(total));
    return;
  }
  if (Number(localStorage.getItem(ROW_MARKER) ?? 0) > 0) {
    throw new Error(
      "この端末のデータを読み込めませんでした（空のデータベースが開かれています）",
    );
  }
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

export { schema };
