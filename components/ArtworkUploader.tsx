"use client";

import { useEffect, useRef, useState } from "react";
import { uploadMedia, resolveMediaUrl } from "@/lib/offline";
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
  const [failure, setFailure] = useState("");

  // Jackets go to the Mac like audio does, with a copy kept here so the shelf
  // keeps its covers offline.
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
    setFailure("");
    try {
      const key = await uploadMedia(file, "art");
      await setArtwork(standardId, key);
    } catch (e) {
      setFailure((e as Error).message);
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
        {failure && (
          <p className="text-xs" style={{ color: "#ef8f7e", flexBasis: "100%" }}>{failure}</p>
        )}
      </div>
    </div>
  );
}
