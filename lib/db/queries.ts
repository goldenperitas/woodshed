import "server-only";
import { db } from "./index";
import {
  standards,
  recordings,
  regions,
  notes,
  groups,
  standardGroups,
  reviewLog,
} from "./schema";
import { eq, desc, asc, sql, and } from "drizzle-orm";

export type StandardListItem = {
  id: number;
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

export function listStandards(): StandardListItem[] {
  const rows = db
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
      nextDue: sql<number | null>`(SELECT MIN(next_due) FROM review_log rl WHERE rl.standard_id = ${standards.id})`,
    })
    .from(standards)
    .orderBy(desc(standards.calledOften), asc(standards.title))
    .all();

  const gm = db
    .select({
      standardId: standardGroups.standardId,
      name: groups.name,
    })
    .from(standardGroups)
    .innerJoin(groups, eq(groups.id, standardGroups.groupId))
    .all();

  const byStd = new Map<number, string[]>();
  for (const g of gm) {
    const arr = byStd.get(g.standardId) ?? [];
    arr.push(g.name);
    byStd.set(g.standardId, arr);
  }

  // Take counts per standard (a correlated subquery in the select above
  // returned 0 for every row under drizzle, so tally it explicitly).
  const rc = db
    .select({ sid: recordings.standardId, c: sql<number>`COUNT(*)` })
    .from(recordings)
    .groupBy(recordings.standardId)
    .all();
  const rcByStd = new Map<number, number>();
  for (const r of rc) rcByStd.set(r.sid, Number(r.c));

  return rows.map((r) => ({
    ...r,
    groupNames: byStd.get(r.id) ?? [],
    recordingCount: rcByStd.get(r.id) ?? 0,
  }));
}

export function getStandard(id: number) {
  const std = db.select().from(standards).where(eq(standards.id, id)).get();
  if (!std) return null;

  const recs = db
    .select()
    .from(recordings)
    .where(eq(recordings.standardId, id))
    .orderBy(desc(recordings.isReference), asc(recordings.id))
    .all();

  const recIds = recs.map((r) => r.id);
  const regs = recIds.length
    ? db
        .select()
        .from(regions)
        .where(
          sql`${regions.recordingId} IN (${sql.join(recIds.map((x) => sql`${x}`), sql`, `)})`,
        )
        .orderBy(asc(regions.startSec))
        .all()
    : [];

  const ns = db
    .select()
    .from(notes)
    .where(eq(notes.standardId, id))
    .orderBy(desc(notes.createdAt))
    .all();

  const grpAll = db.select().from(groups).orderBy(asc(groups.name)).all();
  const memberRows = db
    .select({ groupId: standardGroups.groupId })
    .from(standardGroups)
    .where(eq(standardGroups.standardId, id))
    .all();
  const memberIds = new Set(memberRows.map((m) => m.groupId));

  const reviews = db
    .select()
    .from(reviewLog)
    .where(eq(reviewLog.standardId, id))
    .orderBy(desc(reviewLog.reviewedAt))
    .all();

  return {
    standard: std,
    recordings: recs,
    regions: regs,
    notes: ns,
    allGroups: grpAll,
    memberGroupIds: memberIds,
    reviews,
  };
}

export function listGroupsWithCounts() {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      count: sql<number>`(SELECT COUNT(*) FROM standard_groups sg WHERE sg.group_id = ${groups.id})`,
    })
    .from(groups)
    .orderBy(asc(groups.name))
    .all();
}

export type DrillItem = {
  id: number;
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
  dueName: number | null; // latest nextDue for name_to_info
  dueAudio: number | null; // latest nextDue for audio_to_name
  head: { src: string; start: number; end: number } | null; // for audio drill
};

export function getDrillDeck(): DrillItem[] {
  const stds = db.select().from(standards).all();

  // group names per standard
  const gm = db
    .select({ standardId: standardGroups.standardId, name: groups.name })
    .from(standardGroups)
    .innerJoin(groups, eq(groups.id, standardGroups.groupId))
    .all();
  const groupsByStd = new Map<number, string[]>();
  for (const g of gm) {
    const arr = groupsByStd.get(g.standardId) ?? [];
    arr.push(g.name);
    groupsByStd.set(g.standardId, arr);
  }

  // latest nextDue per (standard, mode)
  const revs = db
    .select()
    .from(reviewLog)
    .orderBy(desc(reviewLog.reviewedAt))
    .all();
  const dueName = new Map<number, number>();
  const dueAudio = new Map<number, number>();
  for (const r of revs) {
    const target = r.mode === "audio_to_name" ? dueAudio : dueName;
    if (!target.has(r.standardId)) target.set(r.standardId, r.nextDue);
  }

  // one head clip per standard (prefer the reference recording)
  const headRows = db
    .select({
      standardId: recordings.standardId,
      filePath: recordings.filePath,
      isReference: recordings.isReference,
      startSec: regions.startSec,
      endSec: regions.endSec,
    })
    .from(regions)
    .innerJoin(recordings, eq(recordings.id, regions.recordingId))
    .where(eq(regions.label, "head"))
    .all();
  const headByStd = new Map<number, { src: string; start: number; end: number; ref: number }>();
  for (const h of headRows) {
    const existing = headByStd.get(h.standardId);
    if (!existing || (h.isReference && !existing.ref)) {
      headByStd.set(h.standardId, {
        src: "/" + h.filePath,
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
      head: head ? { src: head.src, start: head.start, end: head.end } : null,
    };
  });
}

// Most recent interval (in days) for a standard+mode, to feed the SRS.
export function lastIntervalDays(standardId: number, mode: string): number {
  const rows = db
    .select({ reviewedAt: reviewLog.reviewedAt, nextDue: reviewLog.nextDue })
    .from(reviewLog)
    .where(and(eq(reviewLog.standardId, standardId), eq(reviewLog.mode, mode)))
    .orderBy(desc(reviewLog.reviewedAt))
    .limit(1)
    .all();
  if (!rows.length) return 0;
  const diff = rows[0].nextDue - rows[0].reviewedAt;
  return Math.max(0, Math.round(diff / (24 * 60 * 60 * 1000)));
}

// Every take of every standard, flattened — for the Listening Room queue.
export type ListeningTake = {
  takeId: number;
  filePath: string;
  performer: string | null;
  originalName: string | null;
  year: number | null;
  instrumentation: string | null;
  durationSec: number | null;
  isReference: number;
  standardId: number;
  title: string;
  key: string | null;
  chordInterpretation: string | null;
  status: number;
  artworkPath: string | null;
  groupNames: string[];
};

export function listAllTakes(): ListeningTake[] {
  const rows = db
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
    .orderBy(asc(standards.title), desc(recordings.isReference))
    .all();

  const gm = db
    .select({ standardId: standardGroups.standardId, name: groups.name })
    .from(standardGroups)
    .innerJoin(groups, eq(groups.id, standardGroups.groupId))
    .all();
  const byStd = new Map<number, string[]>();
  for (const g of gm) {
    const arr = byStd.get(g.standardId) ?? [];
    arr.push(g.name);
    byStd.set(g.standardId, arr);
  }

  return rows.map((r) => ({ ...r, groupNames: byStd.get(r.standardId) ?? [] }));
}
