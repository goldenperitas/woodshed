"use client";

// This device's media. Audio and artwork are kept here as whole Blobs and
// played via object URLs — the browser then has the entire file, so seeking,
// looping and slow playback all work (unlike SW-streamed Range requests,
// which Safari handles poorly).
//
// Media never goes to the server. Newly added files get a "local:<uuid>" key
// that lives only on the device that added them; sync carries the metadata
// row naming that key, not the bytes. Paths without the prefix are legacy
// uploads still sitting in public/audio on the Mac, and are fetched over HTTP
// when it is reachable.

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

/** Store a picked file and return the key to record on the row. */
export async function saveFileOffline(file: Blob): Promise<string> {
  const key = "local:" + crypto.randomUUID();
  await tx("readwrite", (s) => s.put({ key, blob: file, savedAt: Date.now() }));
  return key;
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
  return path.startsWith("local:") ? null : "/" + path;
}

/** True when the bytes for this path are on this device. */
export async function hasOffline(path: string): Promise<boolean> {
  return (await getOfflineBlob(path)) !== null;
}
