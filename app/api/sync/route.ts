import { NextResponse } from "next/server";
import { sqlite, nextSeq, currentSeq } from "@/lib/server/db";
import { SYNC_TABLES, syncColumns, incomingWins } from "@/lib/sync/protocol";
import type { PushRequest, PullResponse, SyncRow, SyncPayload } from "@/lib/sync/protocol";

// One round trip does both directions: the device sends what it changed, the
// server replies with everything the device has not seen. Whole thing runs in
// a single transaction so a device can never observe half a sync.

export async function POST(req: Request) {
  let body: PushRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const since = Number.isFinite(body?.since) ? Math.max(0, Math.floor(body.since)) : 0;
  const changes = body?.changes ?? {};

  const apply = sqlite.transaction(() => {
    const seq = nextSeq();
    let accepted = 0;

    for (const table of SYNC_TABLES) {
      const rows = changes[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const cols = syncColumns(table);
      const placeholders = cols.map(() => "?").join(", ");
      const insert = sqlite.prepare(
        `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}, server_seq)
         VALUES (${placeholders}, ?)`,
      );
      const readClock = sqlite.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`);

      for (const row of rows) {
        const id = row?.id;
        if (typeof id !== "string" || !id) continue;
        const incomingAt = Number(row.updated_at);
        if (!Number.isFinite(incomingAt)) continue;

        const existing = readClock.get(id) as { updated_at: number } | undefined;
        if (existing && !incomingWins(incomingAt, existing.updated_at)) continue;

        insert.run(...cols.map((c) => row[c] ?? null), seq);
        accepted++;
      }
    }

    // Collect the reply inside the same transaction, so rows accepted above
    // are included and nothing can slip in between write and read.
    const out: SyncPayload = {};
    for (const table of SYNC_TABLES) {
      const cols = syncColumns(table);
      const rows = sqlite
        .prepare(
          `SELECT ${cols.join(", ")} FROM ${table} WHERE server_seq > ? ORDER BY server_seq`,
        )
        .all(since) as SyncRow[];
      if (rows.length) out[table] = rows;
    }

    return { accepted, changes: out };
  });

  const { accepted, changes: pulled } = apply();

  const res: PullResponse & { accepted: number } = {
    cursor: currentSeq(),
    changes: pulled,
    serverTime: Date.now(),
    accepted,
  };
  return NextResponse.json(res);
}

// Cheap reachability probe — the client uses it to decide whether a sync is
// worth attempting before serialising a payload.
export async function GET() {
  return NextResponse.json({ ok: true, cursor: currentSeq(), serverTime: Date.now() });
}
