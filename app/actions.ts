"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { db, AUDIO_DIR, ART_DIR } from "@/lib/db";
import {
  standards,
  recordings,
  regions,
  notes,
  groups,
  standardGroups,
  reviewLog,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { computeNextDue } from "@/lib/srs";
import { lastIntervalDays } from "@/lib/db/queries";

const now = () => Date.now();
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

export async function createStandard(fd: FormData) {
  const title = (fd.get("title") ?? "").toString().trim();
  if (!title) return;
  const t = now();
  const row = db
    .insert(standards)
    .values({
      title,
      composer: strOrNull(fd.get("composer")),
      key: strOrNull(fd.get("key")),
      form: strOrNull(fd.get("form")),
      feel: strOrNull(fd.get("feel")),
      tempoBpm: numOrNull(fd.get("tempoBpm")),
      status: numOrNull(fd.get("status")) ?? 1,
      calledOften: fd.get("calledOften") ? 1 : 0,
      createdAt: t,
      updatedAt: t,
    })
    .returning({ id: standards.id })
    .get();
  revalidatePath("/");
  redirect(`/standards/${row.id}`);
}

// Metadata only. Chord interpretation & lyrics have their own actions so a
// metadata edit never clobbers your free-form writing.
export async function updateStandardMeta(id: number, fd: FormData) {
  db.update(standards)
    .set({
      title: (fd.get("title") ?? "").toString().trim() || "無題",
      composer: strOrNull(fd.get("composer")),
      key: strOrNull(fd.get("key")),
      form: strOrNull(fd.get("form")),
      feel: strOrNull(fd.get("feel")),
      tempoBpm: numOrNull(fd.get("tempoBpm")),
      status: numOrNull(fd.get("status")) ?? 1,
      calledOften: fd.get("calledOften") ? 1 : 0,
      updatedAt: now(),
    })
    .where(eq(standards.id, id))
    .run();
  revalidatePath(`/standards/${id}`);
  revalidatePath("/");
}

export async function saveChords(id: number, text: string) {
  db.update(standards)
    .set({ chordInterpretation: text.trim() || null, updatedAt: now() })
    .where(eq(standards.id, id))
    .run();
  revalidatePath(`/standards/${id}`);
}

export async function saveLyrics(id: number, text: string) {
  db.update(standards)
    .set({ lyrics: text.trim() || null, updatedAt: now() })
    .where(eq(standards.id, id))
    .run();
  revalidatePath(`/standards/${id}`);
}

export async function removeArtwork(id: number) {
  const row = db.select({ p: standards.artworkPath }).from(standards).where(eq(standards.id, id)).get();
  if (row?.p) {
    try { fs.unlinkSync(path.join(ART_DIR, path.basename(row.p))); } catch {}
  }
  db.update(standards).set({ artworkPath: null, updatedAt: now() }).where(eq(standards.id, id)).run();
  revalidatePath(`/standards/${id}`);
  revalidatePath("/");
}

export async function toggleCalledOften(id: number, value: boolean) {
  db.update(standards)
    .set({ calledOften: value ? 1 : 0, updatedAt: now() })
    .where(eq(standards.id, id))
    .run();
  revalidatePath(`/standards/${id}`);
  revalidatePath("/");
}

export async function setStatus(id: number, status: number) {
  db.update(standards)
    .set({ status, updatedAt: now() })
    .where(eq(standards.id, id))
    .run();
  revalidatePath(`/standards/${id}`);
  revalidatePath("/");
}

export async function deleteStandard(id: number) {
  // Remove audio files on disk for this standard's recordings.
  const recs = db
    .select({ filePath: recordings.filePath })
    .from(recordings)
    .where(eq(recordings.standardId, id))
    .all();
  for (const r of recs) safeUnlink(r.filePath);
  const art = db.select({ p: standards.artworkPath }).from(standards).where(eq(standards.id, id)).get();
  if (art?.p) { try { fs.unlinkSync(path.join(ART_DIR, path.basename(art.p))); } catch {} }
  db.delete(standards).where(eq(standards.id, id)).run();
  revalidatePath("/");
  redirect("/");
}

// ---- recordings ----

export async function updateRecording(id: number, standardId: number, fd: FormData) {
  db.update(recordings)
    .set({
      performer: strOrNull(fd.get("performer")),
      year: numOrNull(fd.get("year")),
      instrumentation: strOrNull(fd.get("instrumentation")),
    })
    .where(eq(recordings.id, id))
    .run();
  revalidatePath(`/standards/${standardId}`);
}

export async function setReference(recordingId: number, standardId: number) {
  db.update(recordings)
    .set({ isReference: 0 })
    .where(eq(recordings.standardId, standardId))
    .run();
  db.update(recordings)
    .set({ isReference: 1 })
    .where(eq(recordings.id, recordingId))
    .run();
  revalidatePath(`/standards/${standardId}`);
}

export async function deleteRecording(id: number, standardId: number) {
  const rec = db
    .select({ filePath: recordings.filePath })
    .from(recordings)
    .where(eq(recordings.id, id))
    .get();
  if (rec) safeUnlink(rec.filePath);
  db.delete(recordings).where(eq(recordings.id, id)).run();
  revalidatePath(`/standards/${standardId}`);
}

// ---- regions ----

export async function addRegion(
  recordingId: number,
  standardId: number,
  data: { label: string; startSec: number; endSec: number; note?: string },
) {
  db.insert(regions)
    .values({
      recordingId,
      label: data.label || null,
      startSec: data.startSec,
      endSec: data.endSec,
      note: data.note?.trim() || null,
    })
    .run();
  revalidatePath(`/standards/${standardId}`);
}

export async function deleteRegion(id: number, standardId: number) {
  db.delete(regions).where(eq(regions.id, id)).run();
  revalidatePath(`/standards/${standardId}`);
}

// ---- notes ----

export async function addNote(
  standardId: number,
  data: { body: string; tag: string; recordingId?: number | null; timestampSec?: number | null },
) {
  if (!data.body.trim()) return;
  db.insert(notes)
    .values({
      standardId,
      body: data.body.trim(),
      tag: data.tag || "general",
      recordingId: data.recordingId ?? null,
      timestampSec: data.timestampSec ?? null,
      createdAt: now(),
    })
    .run();
  revalidatePath(`/standards/${standardId}`);
}

export async function deleteNote(id: number, standardId: number) {
  db.delete(notes).where(eq(notes.id, id)).run();
  revalidatePath(`/standards/${standardId}`);
}

// ---- groups ----

export async function createGroup(fd: FormData) {
  const name = (fd.get("name") ?? "").toString().trim();
  if (!name) return;
  db.insert(groups)
    .values({ name, description: strOrNull(fd.get("description")) })
    .run();
  revalidatePath("/groups");
}

export async function deleteGroup(id: number) {
  db.delete(groups).where(eq(groups.id, id)).run();
  revalidatePath("/groups");
}

export async function setStandardGroup(
  standardId: number,
  groupId: number,
  member: boolean,
) {
  if (member) {
    db.insert(standardGroups)
      .values({ standardId, groupId, sortOrder: 0 })
      .onConflictDoNothing()
      .run();
  } else {
    db.delete(standardGroups)
      .where(
        and(
          eq(standardGroups.standardId, standardId),
          eq(standardGroups.groupId, groupId),
        ),
      )
      .run();
  }
  revalidatePath(`/standards/${standardId}`);
}

// ---- drill ----

export async function logReview(standardId: number, mode: string, rating: number) {
  const prev = lastIntervalDays(standardId, mode);
  const t = now();
  const { nextDue } = computeNextDue(rating, prev, t);
  db.insert(reviewLog)
    .values({ standardId, mode, rating, reviewedAt: t, nextDue })
    .run();
  revalidatePath("/drill");
  revalidatePath("/");
}

// ---- helpers ----

function safeUnlink(relPath: string) {
  try {
    // relPath is like "audio/xxxx.mp3"; strip the leading "audio/"
    const base = path.basename(relPath);
    fs.unlinkSync(path.join(AUDIO_DIR, base));
  } catch {
    // already gone — fine
  }
}
