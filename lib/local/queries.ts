"use client";

// Every read the UI does, against the device's own database.
//
// These are ports of the old server-side queries in lib/db/queries.ts: same
// SQL shape, but async (the worker is across a message port) and filtered on
// `deletedAt IS NULL`, because deletes are now tombstones rather than
// physical removals.

import { localDb } from "./db";
import {
  standards,
  recordings,
  regions,
  notes,
  groups,
  standardGroups,
  reviewLog,
} from "@/lib/sync/schema";
import { eq, desc, asc, sql, and, isNull } from "drizzle-orm";

const alive = isNull;

export type StandardListItem = {
  id: string;
  title: string;
  composer: string | null;
  key: string | null;
  form: string | null;
  feel: string | null;
  status: number;
  calledOften: number;
  artworkPath: string | null;
  recordingCount: number;
  groupNames: string[];
  nextDue: number | null; // soonest due across drill modes
};

export async function listStandards(): Promise<StandardListItem[]> {
  const rows = await localDb
    .select({
      id: standards.id,
      title: standards.title,
      composer: standards.composer,
      key: standards.key,
      form: standards.form,
      feel: standards.feel,
      status: standards.status,
      calledOften: standards.calledOften,
      artworkPath: standards.artworkPath,
      nextDue: sql<
        number | null
      >`(SELECT MIN(next_due) FROM review_log rl WHERE rl.standard_id = ${standards.id} AND rl.deleted_at IS NULL)`,
    })
    .from(standards)
    .where(alive(standards.deletedAt))
    .orderBy(desc(standards.calledOften), asc(standards.title));

  const groupNames = await groupNamesByStandard();

  const rc = await localDb
    .select({ sid: recordings.standardId, c: sql<number>`COUNT(*)` })
    .from(recordings)
    .where(alive(recordings.deletedAt))
    .groupBy(recordings.standardId);
  const rcByStd = new Map<string, number>();
  for (const r of rc) rcByStd.set(r.sid, Number(r.c));

  return rows.map((r) => ({
    ...r,
    groupNames: groupNames.get(r.id) ?? [],
    recordingCount: rcByStd.get(r.id) ?? 0,
  }));
}

async function groupNamesByStandard(): Promise<Map<string, string[]>> {
  const gm = await localDb
    .select({ standardId: standardGroups.standardId, name: groups.name })
    .from(standardGroups)
    .innerJoin(groups, eq(groups.id, standardGroups.groupId))
    .where(and(alive(standardGroups.deletedAt), alive(groups.deletedAt)));
  const byStd = new Map<string, string[]>();
  for (const g of gm) {
    const arr = byStd.get(g.standardId) ?? [];
    arr.push(g.name);
    byStd.set(g.standardId, arr);
  }
  return byStd;
}

export async function getStandard(id: string) {
  const std = await localDb
    .select()
    .from(standards)
    .where(and(eq(standards.id, id), alive(standards.deletedAt)))
    .get();
  if (!std) return null;

  const recs = await localDb
    .select()
    .from(recordings)
    .where(and(eq(recordings.standardId, id), alive(recordings.deletedAt)))
    .orderBy(desc(recordings.isReference), asc(recordings.createdAt));

  const recIds = recs.map((r) => r.id);
  const regs = recIds.length
    ? await localDb
        .select()
        .from(regions)
        .where(
          and(
            sql`${regions.recordingId} IN (${sql.join(
              recIds.map((x) => sql`${x}`),
              sql`, `,
            )})`,
            alive(regions.deletedAt),
          ),
        )
        .orderBy(asc(regions.startSec))
    : [];

  const ns = await localDb
    .select()
    .from(notes)
    .where(and(eq(notes.standardId, id), alive(notes.deletedAt)))
    .orderBy(desc(notes.createdAt));

  const grpAll = await localDb
    .select()
    .from(groups)
    .where(alive(groups.deletedAt))
    .orderBy(asc(groups.name));

  const memberRows = await localDb
    .select({ groupId: standardGroups.groupId })
    .from(standardGroups)
    .where(and(eq(standardGroups.standardId, id), alive(standardGroups.deletedAt)));

  const reviews = await localDb
    .select()
    .from(reviewLog)
    .where(and(eq(reviewLog.standardId, id), alive(reviewLog.deletedAt)))
    .orderBy(desc(reviewLog.reviewedAt));

  return {
    standard: std,
    recordings: recs,
    regions: regs,
    notes: ns,
    allGroups: grpAll,
    memberGroupIds: new Set(memberRows.map((m) => m.groupId)),
    reviews,
    now: Date.now(),
  };
}

export async function listGroupsWithCounts() {
  return localDb
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      count: sql<number>`(SELECT COUNT(*) FROM standard_groups sg WHERE sg.group_id = ${groups.id} AND sg.deleted_at IS NULL)`,
    })
    .from(groups)
    .where(alive(groups.deletedAt))
    .orderBy(asc(groups.name));
}

export type DrillItem = {
  id: string;
  title: string;
  composer: string | null;
  key: string | null;
  form: string | null;
  feel: string | null;
  tempoBpm: number | null;
  status: number;
  chordInterpretation: string | null;
  lyrics: string | null;
  groupNames: string[];
  dueName: number | null;
  dueAudio: number | null;
  dueSession: number | null;
  head: { src: string; start: number; end: number } | null;
};

export async function getDrillDeck(): Promise<DrillItem[]> {
  const stds = await localDb.select().from(standards).where(alive(standards.deletedAt));
  const groupsByStd = await groupNamesByStandard();

  // Latest nextDue per (standard, mode).
  const revs = await localDb
    .select()
    .from(reviewLog)
    .where(alive(reviewLog.deletedAt))
    .orderBy(desc(reviewLog.reviewedAt));
  const dueName = new Map<string, number>();
  const dueAudio = new Map<string, number>();
  const dueSession = new Map<string, number>();
  for (const r of revs) {
    const target =
      r.mode === "audio_to_name" ? dueAudio : r.mode === "session_key" ? dueSession : dueName;
    if (!target.has(r.standardId)) target.set(r.standardId, r.nextDue);
  }

  // One head clip per standard, preferring the reference take.
  const headRows = await localDb
    .select({
      standardId: recordings.standardId,
      filePath: recordings.filePath,
      isReference: recordings.isReference,
      startSec: regions.startSec,
      endSec: regions.endSec,
    })
    .from(regions)
    .innerJoin(recordings, eq(recordings.id, regions.recordingId))
    .where(
      and(eq(regions.label, "head"), alive(regions.deletedAt), alive(recordings.deletedAt)),
    );
  const headByStd = new Map<
    string,
    { src: string; start: number; end: number; ref: number }
  >();
  for (const h of headRows) {
    const existing = headByStd.get(h.standardId);
    if (!existing || (h.isReference && !existing.ref)) {
      headByStd.set(h.standardId, {
        src: h.filePath,
        start: h.startSec,
        end: h.endSec,
        ref: h.isReference,
      });
    }
  }

  return stds.map((s) => {
    const head = headByStd.get(s.id);
    return {
      id: s.id,
      title: s.title,
      composer: s.composer,
      key: s.key,
      form: s.form,
      feel: s.feel,
      tempoBpm: s.tempoBpm,
      status: s.status,
      chordInterpretation: s.chordInterpretation,
      lyrics: s.lyrics,
      groupNames: groupsByStd.get(s.id) ?? [],
      dueName: dueName.get(s.id) ?? null,
      dueAudio: dueAudio.get(s.id) ?? null,
      dueSession: dueSession.get(s.id) ?? null,
      head: head ? { src: head.src, start: head.start, end: head.end } : null,
    };
  });
}

// Most recent interval (in days) for a standard+mode, to feed the SRS.
export async function lastIntervalDays(standardId: string, mode: string): Promise<number> {
  const row = await localDb
    .select({ reviewedAt: reviewLog.reviewedAt, nextDue: reviewLog.nextDue })
    .from(reviewLog)
    .where(
      and(
        eq(reviewLog.standardId, standardId),
        eq(reviewLog.mode, mode),
        alive(reviewLog.deletedAt),
      ),
    )
    .orderBy(desc(reviewLog.reviewedAt))
    .limit(1)
    .get();
  if (!row) return 0;
  return Math.max(0, Math.round((row.nextDue - row.reviewedAt) / (24 * 60 * 60 * 1000)));
}

export type ListeningTake = {
  takeId: string;
  filePath: string;
  performer: string | null;
  originalName: string | null;
  year: number | null;
  instrumentation: string | null;
  durationSec: number | null;
  isReference: number;
  standardId: string;
  title: string;
  key: string | null;
  chordInterpretation: string | null;
  status: number;
  artworkPath: string | null;
  groupNames: string[];
};

export async function listAllTakes(): Promise<ListeningTake[]> {
  const rows = await localDb
    .select({
      takeId: recordings.id,
      filePath: recordings.filePath,
      performer: recordings.performer,
      originalName: recordings.originalName,
      year: recordings.year,
      instrumentation: recordings.instrumentation,
      durationSec: recordings.durationSec,
      isReference: recordings.isReference,
      standardId: standards.id,
      title: standards.title,
      key: standards.key,
      chordInterpretation: standards.chordInterpretation,
      status: standards.status,
      artworkPath: standards.artworkPath,
    })
    .from(recordings)
    .innerJoin(standards, eq(standards.id, recordings.standardId))
    .where(and(alive(recordings.deletedAt), alive(standards.deletedAt)))
    .orderBy(asc(standards.title), desc(recordings.isReference));

  const byStd = await groupNamesByStandard();
  return rows.map((r) => ({ ...r, groupNames: byStd.get(r.standardId) ?? [] }));
}
