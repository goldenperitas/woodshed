import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db, AUDIO_DIR } from "@/lib/db";
import { recordings } from "@/lib/db/schema";

export const runtime = "nodejs";

// Upload one audio file and attach it to a standard.
// Sent as multipart/form-data from the browser (drag & drop on the Mac).
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const file = fd.get("file");
  const standardId = Number(fd.get("standardId"));

  if (!(file instanceof File) || !standardId) {
    return NextResponse.json({ error: "file と standardId が必要です" }, { status: 400 });
  }

  const ext = (path.extname(file.name) || ".mp3").toLowerCase();
  const safeExt = /^\.(mp3|m4a|aac|wav|ogg|opus|flac)$/.test(ext) ? ext : ".mp3";
  const rand = Math.random().toString(36).slice(2, 10);
  const fileName = `${Date.now()}-${rand}${safeExt}`;

  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(AUDIO_DIR, fileName), buf);

  const row = db
    .insert(recordings)
    .values({
      standardId,
      filePath: `audio/${fileName}`,
      originalName: file.name,
      performer: str(fd.get("performer")),
      year: num(fd.get("year")),
      instrumentation: str(fd.get("instrumentation")),
      isReference: 0,
      durationSec: num(fd.get("durationSec")),
      createdAt: Date.now(),
    })
    .returning()
    .get();

  return NextResponse.json({ recording: row });
}

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
}
function num(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
