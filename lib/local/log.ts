"use client";

// What actually happened on this device, in order.
//
// The screens render from a database inside a worker inside a service worker's
// cache inside a PWA on a phone no debugger here will ever attach to. When
// something goes wrong there, the only thing that can explain it is a record
// written at the time — so this writes one.
//
// Kept in localStorage rather than the local database, because the failures
// most worth reading about are the database's own. Workers have no
// localStorage at all, so anything the db worker learns has to ride home on
// its reply and be logged from here.

const KEY = "woodshed.log";
const LIMIT = 300;

export type LogEntry = {
  /** epoch ms */
  t: number;
  /** which document wrote it — a full page load starts a new one */
  run: string;
  ev: string;
  d?: Record<string, unknown>;
};

// A run is a document, not a session. Counting runs across one journey is
// exactly how a client-side transition is told apart from a page reload, which
// is the thing this instrument exists to measure.
export const RUN_ID = Math.random().toString(36).slice(2, 8);

function read(): LogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Records one event. Re-reads before appending: two documents can be alive at
 * once (a Safari tab beside the PWA, or a page frozen in the back/forward
 * cache waking up), and that overlap is precisely the case worth capturing —
 * a cached in-memory buffer would have each document overwrite the other's.
 */
export function logEvent(ev: string, d?: Record<string, unknown>): void {
  if (typeof localStorage === "undefined") return;
  const entries = read();
  entries.push({ t: Date.now(), run: RUN_ID, ev, ...(d && Object.keys(d).length ? { d } : {}) });
  if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Quota, or storage blocked. Diagnostics must never be the reason
    // something fails, so drop the oldest half and let the next write retry.
    try {
      localStorage.setItem(KEY, JSON.stringify(entries.slice(-Math.floor(LIMIT / 2))));
    } catch {
      // give up
    }
  }
}

export function readLog(): LogEntry[] {
  return read();
}

export function clearLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}

/** Plain text, for pasting out of the phone and into a bug report. */
export function formatLog(entries: LogEntry[] = read()): string {
  return entries
    .map((e) => {
      const at = new Date(e.t).toISOString().slice(11, 23);
      const detail = e.d
        ? " " +
          Object.entries(e.d)
            .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
            .join(" ")
        : "";
      return `${at} ${e.run} ${e.ev}${detail}`;
    })
    .join("\n");
}

export type LogSummary = {
  /** minutes covered by the window these numbers describe */
  windowMin: number;
  /** full document loads — the number this whole exercise is trying to drive down */
  boots: number;
  /** how many of those were the browser reloading rather than a first visit */
  reloads: number;
  /** times the device database had to be opened from scratch */
  dbOpens: number;
  /** slowest database open in the window */
  dbOpenMaxMs: number;
  /** opens that needed more than one attempt at the OPFS access handles */
  dbContended: number;
  failures: number;
};

const WINDOW_MIN = 60;

/**
 * The few numbers worth reading at a glance. Boots and dbOpens are the pair to
 * watch: while offline navigation is a full document load, every screen change
 * adds one of each.
 */
export function summarize(entries: LogEntry[] = read()): LogSummary {
  const since = Date.now() - WINDOW_MIN * 60_000;
  const recent = entries.filter((e) => e.t >= since);
  const num = (e: LogEntry, k: string) => Number(e.d?.[k] ?? 0);

  const boots = recent.filter((e) => e.ev === "boot");
  const opens = recent.filter((e) => e.ev === "db.open");

  return {
    windowMin: WINDOW_MIN,
    boots: boots.length,
    reloads: boots.filter((e) => e.d?.nav === "reload" || e.d?.nav === "back_forward").length,
    dbOpens: opens.length,
    dbOpenMaxMs: opens.reduce((m, e) => Math.max(m, num(e, "ms")), 0),
    dbContended: opens.filter((e) => num(e, "attempts") > 1 || num(e, "lockMs") > 0).length,
    failures: recent.filter((e) => e.ev.endsWith(".fail") || e.ev === "error").length,
  };
}
