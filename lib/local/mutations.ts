"use client";

// Every write the UI does. Deliberately the same function names and argument
// shapes as the old server actions in app/actions.ts, so the components that
// call them barely changed — what changed is where the row lands: this
// device's SQLite first, /api/sync later.
//
// Two rules hold for all of them:
//   1. stamp updatedAt and dirty=1 so the pusher can find the row
//   2. never DELETE — set deletedAt, or a peer still holding the row will
//      hand it back on the next pull

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
import { eq, and, inArray, isNull } from "drizzle-orm";
import { computeNextDue } from "@/lib/srs";
import { lastIntervalDays } from "./queries";
import { notifyChanged } from "./bus";
import { removeOffline } from "@/lib/offline";

const now = () => Date.now();
const uid = () => crypto.randomUUID();
const touch = () => ({ updatedAt: now(), dirty: 1 });

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
};

// ---- standards ----

/** Returns the new id so the caller can navigate to it. */
export async function createStandard(fd: FormData): Promise<string | null> {
  const title = (fd.get("title") ?? "").toString().trim();
  if (!title) return null;
  const t = now();
  const id = uid();
  await localDb.insert(standards).values({
    id,
    title,
    composer: strOrNull(fd.get("composer")),
    key: strOrNull(fd.get("key")),
    form: strOrNull(fd.get("form")),
    feel: strOrNull(fd.get("feel")),
    tempoBpm: numOrNull(fd.get("tempoBpm")),
    status: numOrNull(fd.get("status")) ?? 0,
    calledOften: fd.get("calledOften") ? 1 : 0,
    createdAt: t,
    updatedAt: t,
    dirty: 1,
  });
  notifyChanged();
  return id;
}

// Metadata only. Chords & lyrics have their own writers so a metadata edit
// never clobbers your free-form writing.
export async function updateStandardMeta(id: string, fd: FormData) {
  await localDb
    .update(standards)
    .set({
      title: (fd.get("title") ?? "").toString().trim() || "無題",
      composer: strOrNull(fd.get("composer")),
      key: strOrNull(fd.get("key")),
      form: strOrNull(fd.get("form")),
      feel: strOrNull(fd.get("feel")),
      tempoBpm: numOrNull(fd.get("tempoBpm")),
      status: numOrNull(fd.get("status")) ?? 0,
      calledOften: fd.get("calledOften") ? 1 : 0,
      ...touch(),
    })
    .where(eq(standards.id, id));
  notifyChanged();
}

export async function saveChords(id: string, text: string) {
  await localDb
    .update(standards)
    .set({ chordInterpretation: text.trim() || null, ...touch() })
    .where(eq(standards.id, id));
  notifyChanged();
}

export async function saveLyrics(id: string, text: string) {
  await localDb
    .update(standards)
    .set({ lyrics: text.trim() || null, ...touch() })
    .where(eq(standards.id, id));
  notifyChanged();
}

export async function setArtwork(id: string, artworkPath: string | null) {
  const prev = await localDb
    .select({ p: standards.artworkPath })
    .from(standards)
    .where(eq(standards.id, id))
    .get();
  await localDb
    .update(standards)
    .set({ artworkPath, ...touch() })
    .where(eq(standards.id, id));
  if (prev?.p && prev.p !== artworkPath) await dropBlob(prev.p);
  notifyChanged();
}

export const removeArtwork = (id: string) => setArtwork(id, null);

export async function toggleCalledOften(id: string, value: boolean) {
  await localDb
    .update(standards)
    .set({ calledOften: value ? 1 : 0, ...touch() })
    .where(eq(standards.id, id));
  notifyChanged();
}

export async function setStatus(id: string, status: number) {
  await localDb
    .update(standards)
    .set({ status, ...touch() })
    .where(eq(standards.id, id));
  notifyChanged();
}

/**
 * Tombstones the standard and everything hanging off it. Cascades are done
 * here rather than by SQLite because ON DELETE CASCADE only fires on a real
 * DELETE, and a real DELETE is exactly what sync cannot tolerate.
 */
export async function deleteStandard(id: string) {
  const t = now();
  const dead = { deletedAt: t, updatedAt: t, dirty: 1 };

  const recs = await localDb
    .select({ id: recordings.id, filePath: recordings.filePath })
    .from(recordings)
    .where(eq(recordings.standardId, id));

  if (recs.length) {
    const ids = recs.map((r) => r.id);
    await localDb.update(regions).set(dead).where(inArray(regions.recordingId, ids));
    await localDb.update(recordings).set(dead).where(inArray(recordings.id, ids));
  }
  await localDb.update(notes).set(dead).where(eq(notes.standardId, id));
  await localDb.update(reviewLog).set(dead).where(eq(reviewLog.standardId, id));
  await localDb.update(standardGroups).set(dead).where(eq(standardGroups.standardId, id));

  const std = await localDb
    .select({ p: standards.artworkPath })
    .from(standards)
    .where(eq(standards.id, id))
    .get();
  await localDb.update(standards).set(dead).where(eq(standards.id, id));

  // Reclaim the space now; the metadata rows stay as tombstones.
  for (const r of recs) await dropBlob(r.filePath);
  if (std?.p) await dropBlob(std.p);
  notifyChanged();
}

// ---- recordings ----

export async function addRecording(data: {
  standardId: string;
  filePath: string;
  originalName: string | null;
  durationSec: number | null;
}): Promise<string> {
  const t = now();
  const id = uid();
  const existing = await localDb
    .select({ id: recordings.id })
    .from(recordings)
    .where(and(eq(recordings.standardId, data.standardId), isNull(recordings.deletedAt)));
  await localDb.insert(recordings).values({
    id,
    standardId: data.standardId,
    filePath: data.filePath,
    originalName: data.originalName,
    durationSec: data.durationSec,
    isReference: existing.length === 0 ? 1 : 0, // first take is the reference
    createdAt: t,
    updatedAt: t,
    dirty: 1,
  });
  notifyChanged();
  return id;
}

export async function updateRecording(id: string, _standardId: string, fd: FormData) {
  await localDb
    .update(recordings)
    .set({
      performer: strOrNull(fd.get("performer")),
      year: numOrNull(fd.get("year")),
      instrumentation: strOrNull(fd.get("instrumentation")),
      ...touch(),
    })
    .where(eq(recordings.id, id));
  notifyChanged();
}

export async function setReference(recordingId: string, standardId: string) {
  await localDb
    .update(recordings)
    .set({ isReference: 0, ...touch() })
    .where(eq(recordings.standardId, standardId));
  await localDb
    .update(recordings)
    .set({ isReference: 1, ...touch() })
    .where(eq(recordings.id, recordingId));
  notifyChanged();
}

export async function deleteRecording(id: string, _standardId: string) {
  const t = now();
  const dead = { deletedAt: t, updatedAt: t, dirty: 1 };
  const rec = await localDb
    .select({ filePath: recordings.filePath })
    .from(recordings)
    .where(eq(recordings.id, id))
    .get();
  await localDb.update(regions).set(dead).where(eq(regions.recordingId, id));
  await localDb.update(recordings).set(dead).where(eq(recordings.id, id));
  if (rec) await dropBlob(rec.filePath);
  notifyChanged();
}

// ---- regions ----

export async function addRegion(
  recordingId: string,
  _standardId: string,
  data: { label: string; startSec: number; endSec: number; note?: string },
) {
  const t = now();
  await localDb.insert(regions).values({
    id: uid(),
    recordingId,
    label: data.label || null,
    startSec: data.startSec,
    endSec: data.endSec,
    note: data.note?.trim() || null,
    createdAt: t,
    updatedAt: t,
    dirty: 1,
  });
  notifyChanged();
}

export async function deleteRegion(id: string, _standardId: string) {
  const t = now();
  await localDb
    .update(regions)
    .set({ deletedAt: t, updatedAt: t, dirty: 1 })
    .where(eq(regions.id, id));
  notifyChanged();
}

// ---- notes ----

export async function addNote(
  standardId: string,
  data: {
    body: string;
    tag: string;
    recordingId?: string | null;
    timestampSec?: number | null;
  },
) {
  if (!data.body.trim()) return;
  const t = now();
  await localDb.insert(notes).values({
    id: uid(),
    standardId,
    body: data.body.trim(),
    tag: data.tag || "general",
    recordingId: data.recordingId ?? null,
    timestampSec: data.timestampSec ?? null,
    createdAt: t,
    updatedAt: t,
    dirty: 1,
  });
  notifyChanged();
}

export async function deleteNote(id: string, _standardId: string) {
  const t = now();
  await localDb
    .update(notes)
    .set({ deletedAt: t, updatedAt: t, dirty: 1 })
    .where(eq(notes.id, id));
  notifyChanged();
}

// ---- groups ----

export async function createGroup(fd: FormData) {
  const name = (fd.get("name") ?? "").toString().trim();
  if (!name) return;
  const t = now();
  await localDb.insert(groups).values({
    id: uid(),
    name,
    description: strOrNull(fd.get("description")),
    createdAt: t,
    updatedAt: t,
    dirty: 1,
  });
  notifyChanged();
}

export async function deleteGroup(id: string) {
  const t = now();
  const dead = { deletedAt: t, updatedAt: t, dirty: 1 };
  await localDb.update(standardGroups).set(dead).where(eq(standardGroups.groupId, id));
  await localDb.update(groups).set(dead).where(eq(groups.id, id));
  notifyChanged();
}

export async function setStandardGroup(standardId: string, groupId: string, member: boolean) {
  const t = now();
  const existing = await localDb
    .select({ id: standardGroups.id })
    .from(standardGroups)
    .where(
      and(eq(standardGroups.standardId, standardId), eq(standardGroups.groupId, groupId)),
    )
    .get();

  if (member) {
    // Re-joining a group revives the tombstoned membership rather than
    // inserting a second row, which the unique index would reject anyway.
    if (existing) {
      await localDb
        .update(standardGroups)
        .set({ deletedAt: null, ...touch() })
        .where(eq(standardGroups.id, existing.id));
    } else {
      await localDb.insert(standardGroups).values({
        // Deterministic rather than random: if two devices join the same
        // standard to the same group while offline, they mint the same id and
        // last-write-wins settles it. A UUID each would collide on the
        // (standard, group) unique index instead, failing the whole pull.
        id: `${standardId}:${groupId}`,
        standardId,
        groupId,
        sortOrder: 0,
        createdAt: t,
        updatedAt: t,
        dirty: 1,
      });
    }
  } else if (existing) {
    await localDb
      .update(standardGroups)
      .set({ deletedAt: t, updatedAt: t, dirty: 1 })
      .where(eq(standardGroups.id, existing.id));
  }
  notifyChanged();
}

// ---- drill ----

export async function logReview(standardId: string, mode: string, rating: number) {
  const prev = await lastIntervalDays(standardId, mode);
  const t = now();
  const { nextDue } = computeNextDue(rating, prev, t);
  await localDb.insert(reviewLog).values({
    id: uid(),
    standardId,
    mode,
    rating,
    reviewedAt: t,
    nextDue,
    createdAt: t,
    updatedAt: t,
    dirty: 1,
  });
  notifyChanged();
}

// ---- helpers ----

// Media only ever lives on the device, so a tombstoned row's bytes can go
// immediately. Legacy "audio/..." paths point at files on the Mac and are
// left alone.
async function dropBlob(path: string) {
  if (!path.startsWith("local:")) return;
  try {
    await removeOffline(path);
  } catch {
    // already gone — fine
  }
}
