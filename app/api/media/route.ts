import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { AUDIO_DIR, ART_DIR, SHEET_DIR } from "@/lib/server/db";

// Where media is kept.
//
// The Mac holds the originals; devices hold copies. That is the only
// arrangement in which losing a phone's storage is recoverable — metadata
// comes back from /api/sync and the audio comes back from here. See §5 of
// HANDOFF.md for the condition this rests on: nobody but the owner uses this.
//
// Not cached by the service worker (/api/ and /audio/ are both skipped):
// takes are large and Safari wants real Range responses, which is also why a
// device keeps its copies as whole blobs in IndexedDB rather than streaming.

const KINDS = {
  audio: { dir: AUDIO_DIR, prefix: "audio", ext: /^(mp3|m4a|aac|wav|ogg|opus|flac)$/ },
  art: { dir: ART_DIR, prefix: "art", ext: /^(png|jpe?g|webp|gif|avif)$/ },
  // Lead sheets: a photo of the page, or a scan of several.
  sheet: { dir: SHEET_DIR, prefix: "sheet", ext: /^(pdf|png|jpe?g|webp|heic|heif|avif)$/ },
} as const;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad form" }, { status: 400 });
  }

  const kind = KINDS[String(form.get("kind")) as keyof typeof KINDS];
  const file = form.get("file");
  if (!kind || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "kind と file が要ります" }, { status: 400 });
  }

  // The stored name is generated here, never taken from the upload: the
  // client's filename is the one part of this an attacker would choose.
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!kind.ext.test(ext)) {
    return NextResponse.json({ error: `扱えない形式です: .${ext}` }, { status: 415 });
  }
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  await fs.writeFile(path.join(kind.dir, name), Buffer.from(await file.arrayBuffer()));

  // Relative, because that is the shape the rows already hold and what
  // resolveMediaUrl() expects.
  return NextResponse.json({ path: `${kind.prefix}/${name}` });
}
