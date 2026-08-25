"use client";

import { useEffect, useRef, useState } from "react";
import { saveFileOffline, resolveMediaUrl } from "@/lib/offline";
import { setArtwork, removeArtwork } from "@/lib/local/mutations";

export default function ArtworkUploader({
  standardId,
  artworkPath,
}: {
  standardId: string;
  artworkPath: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  // Artwork lives in the device's blob store like audio does. Older jackets
  // still point at public/art on the Mac; resolveMediaUrl handles both.
  useEffect(() => {
    let created: string | null = null;
    let cancelled = false;
    resolveMediaUrl(artworkPath).then((u) => {
      if (cancelled) {
        if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
        return;
      }
      if (u?.startsWith("blob:")) created = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [artworkPath]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const key = await saveFileOffline(file);
      await setArtwork(standardId, key);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "…" : artworkPath ? "ジャケを差し替え" : "ジャケ写をアップ"}
        </button>
        {artworkPath && (
          <button className="btn btn-danger" onClick={() => removeArtwork(standardId)}>削除</button>
        )}
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>
    </div>
  );
}
