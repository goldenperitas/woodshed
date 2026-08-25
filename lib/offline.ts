"use client";

// This device's media. Audio and artwork are kept here as whole Blobs and
// played via object URLs — the browser then has the entire file, so seeking,
// looping and slow playback all work (unlike SW-streamed Range requests,
// which Safari handles poorly).
//
// The originals live on the Mac (see app/api/media/route.ts); a device keeps
// copies of whatever it wants to play without a signal. So a path like
// "audio/1786571731823-li5t8ocm.mp3" is both the address on the Mac and the
// key of this device's copy — one name, two places, and losing the device
// loses nothing that cannot be fetched again.
//
// "local:<uuid>" keys predate that and exist only on the device that added
// them. Nothing writes them any more; resolveMediaUrl still reads them.

const DB_NAME = "woodshed-offline";
const STORE = "audio";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Keeps bytes already in hand, under the path they were stored at. */
export async function keepOffline(key: string, blob: Blob): Promise<void> {
  await tx("readwrite", (s) => s.put({ key, blob, savedAt: Date.now() }));
}

export async function saveOffline(key: string, url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("ダウンロード失敗");
  const blob = await res.blob();
  await tx("readwrite", (s) => s.put({ key, blob, savedAt: Date.now() }));
}

export async function removeOffline(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}

export async function getOfflineBlob(key: string): Promise<Blob | null> {
  const row = await tx<{ key: string; blob: Blob } | undefined>("readonly", (s) =>
    s.get(key),
  );
  return row?.blob ?? null;
}

export async function listOfflineKeys(): Promise<string[]> {
  return tx<string[]>("readonly", (s) => s.getAllKeys() as IDBRequest<string[]>);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  }
  return { usage: 0, quota: 0 };
}

/**
 * Sends a picked file to the Mac and keeps a copy here, returning the path to
 * record on the row.
 *
 * Deliberately fails when the Mac cannot be reached rather than falling back
 * to a device-only key. A take that exists on one phone and nowhere else is
 * gone the day iOS reclaims the storage, and no amount of syncing brings it
 * back — better to say so at the moment of adding.
 */
export async function uploadMedia(file: File, kind: "audio" | "art"): Promise<string> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);

  let res: Response;
  try {
    res = await fetch("/api/media", { method: "POST", body: form });
  } catch {
    throw new Error("Macに繋がっていないので追加できません。原本はMacに置きます。");
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `保存に失敗しました (HTTP ${res.status})`);
  }
  const { path } = (await res.json()) as { path: string };

  // The adding device should not have to download what it just handed over.
  await keepOffline(path, file);
  return path;
}

/**
 * Where the Mac serves a stored path from. Not public/ — `next start` only
 * answers for files that existed at build time, and media arrives afterwards
 * (see app/media/[...file]/route.ts).
 */
export function mediaUrl(path: string): string {
  return "/media/" + path;
}

/**
 * A URL the <audio> tag or <img> can use. Returns null when a device-local
 * file is referenced from a device that does not have the bytes — the row
 * synced, the media did not.
 */
export async function resolveMediaUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const blob = await getOfflineBlob(path);
  if (blob) return URL.createObjectURL(blob);
  return path.startsWith("local:") ? null : mediaUrl(path);
}

/** True when the bytes for this path are on this device. */
export async function hasOffline(path: string): Promise<boolean> {
  return (await getOfflineBlob(path)) !== null;
}

/**
 * The server-held media this device does not have a copy of.
 *
 * Rebuilding from the Mac brings back every row but none of the bytes, so
 * after a recovery this is the whole shelf. It is also the honest answer to
 * "what will not play in the car".
 */
export async function missingOffline(paths: string[]): Promise<string[]> {
  const here = new Set(await listOfflineKeys());
  return [...new Set(paths)].filter((p) => p && !p.startsWith("local:") && !here.has(p));
}

/**
 * Fetches copies of the given paths, reporting progress. Keeps going past a
 * failure: one unreachable take should not stop the other forty.
 */
export async function fetchOfflineCopies(
  paths: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const [i, path] of paths.entries()) {
    try {
      await saveOffline(path, mediaUrl(path));
      saved++;
    } catch {
      failed++;
    }
    onProgress?.(i + 1, paths.length);
  }
  return { saved, failed };
}
