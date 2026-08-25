import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { AUDIO_DIR, ART_DIR } from "@/lib/server/db";

// Serves the media the Mac holds.
//
// Not served out of public/: `next start` answers from a listing taken at
// build time, so a file uploaded after the build 404s until the next build.
// Media arrives while the server is running, so it has to be read from disk on
// request — which also puts Range handling here, and Safari will not scrub or
// loop a take without real 206 responses.

const ROOTS: Record<string, string> = { audio: AUDIO_DIR, art: ART_DIR };

const TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

export async function GET(req: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const { file } = await params;
  const [kind, ...rest] = file;
  const root = ROOTS[kind];
  // One path segment, and only the name we generated on upload. Anything with
  // a separator or a dot-dot in it is not a file this server put there.
  const name = rest.join("/");
  if (!root || rest.length !== 1 || !/^[\w.-]+$/.test(name) || name.includes("..")) {
    return new Response("not found", { status: 404 });
  }

  const full = path.join(root, name);
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(full);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const type = TYPES[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    // Names are minted once and never reused, so a copy can be kept forever.
    "cache-control": "public, max-age=31536000, immutable",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${stat.size}` } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(full, { start, end })) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "content-length": String(end - start + 1),
      },
    });
  }

  return new Response(Readable.toWeb(fs.createReadStream(full)) as ReadableStream, {
    headers: { ...headers, "content-length": String(stat.size) },
  });
}
