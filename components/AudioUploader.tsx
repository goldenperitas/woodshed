"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function AudioUploader({ standardId }: { standardId: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [performer, setPerformer] = useState("");
  const [year, setYear] = useState("");
  const [instrumentation, setInstrumentation] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState("");

  function pick(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list).filter((f) => f.type.startsWith("audio") || /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(f.name))]);
  }

  async function upload() {
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`${i + 1}/${files.length} アップロード中…`);
        const fd = new FormData();
        fd.set("file", files[i]);
        fd.set("standardId", String(standardId));
        if (performer) fd.set("performer", performer);
        if (year) fd.set("year", year);
        if (instrumentation) fd.set("instrumentation", instrumentation);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(await res.text());
      }
      setFiles([]);
      setPerformer("");
      setYear("");
      setInstrumentation("");
      setProgress("");
      router.refresh();
    } catch (e) {
      setProgress("失敗: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed py-6 text-center text-sm"
        style={{
          borderColor: drag ? "var(--accent)" : "var(--border)",
          background: drag ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
          color: "var(--muted)",
        }}
      >
        <span className="text-2xl">＋♪</span>
        <span className="mt-1">音源をドラッグ＆ドロップ / タップして選択</span>
        <span className="text-xs">mp3 · m4a · wav など（複数可）</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />

      {files.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">{f.name}</span>
                <button
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" placeholder="演奏者" value={performer} onChange={(e) => setPerformer(e.target.value)} />
            <input className="input" placeholder="年" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
            <input className="input" placeholder="編成" value={instrumentation} onChange={(e) => setInstrumentation(e.target.value)} />
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            ※ 演奏者などは全ファイル共通で付きます（後で個別編集可）
          </p>
          <button className="btn btn-accent" disabled={busy} onClick={upload}>
            {busy ? progress || "アップロード中…" : `${files.length}件をアップロード`}
          </button>
        </div>
      )}
      {progress && files.length === 0 && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{progress}</p>
      )}
    </div>
  );
}
