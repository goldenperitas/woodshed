import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db, ART_DIR } from "@/lib/db";
import { standards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// Upload a jacket image for a standard (replaces any existing one).
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const file = fd.get("file");
  const standardId = Number(fd.get("standardId"));
  if (!(file instanceof File) || !standardId) {
    return NextResponse.json({ error: "file と standardId が必要です" }, { status: 400 });
  }

  const ext = (path.extname(file.name) || ".jpg").toLowerCase();
  const safeExt = /^\.(jpg|jpeg|png|webp|gif|avif)$/.test(ext) ? ext : ".jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
  fs.writeFileSync(path.join(ART_DIR, fileName), Buffer.from(await file.arrayBuffer()));

  // remove previous artwork file
  const prev = db.select({ p: standards.artworkPath }).from(standards).where(eq(standards.id, standardId)).get();
  if (prev?.p) {
    try { fs.unlinkSync(path.join(ART_DIR, path.basename(prev.p))); } catch {}
  }

  db.update(standards).set({ artworkPath: `art/${fileName}`, updatedAt: Date.now() }).where(eq(standards.id, standardId)).run();
  return NextResponse.json({ artworkPath: `art/${fileName}` });
}
