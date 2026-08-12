"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { removeArtwork } from "@/app/actions";

export default function ArtworkUploader({ standardId, artworkPath }: { standardId: number; artworkPath: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file); fd.set("standardId", String(standardId));
    await fetch("/api/artwork", { method: "POST", body: fd });
    setBusy(false); router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {artworkPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={"/" + artworkPath} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "…" : artworkPath ? "ジャケを差し替え" : "ジャケ写をアップ"}
        </button>
        {artworkPath && (
          <button className="btn btn-danger" onClick={async () => { await removeArtwork(standardId); router.refresh(); }}>削除</button>
        )}
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>
    </div>
  );
}
