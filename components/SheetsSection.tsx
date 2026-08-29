"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Maximize2, Minimize2, Plus, Trash2, X } from "lucide-react";
import type { Sheet } from "@/lib/sync/schema";
import { uploadMedia } from "@/lib/offline";
import { useMediaUrl } from "@/lib/local/media";
import { addSheet, deleteSheet, moveSheet } from "@/lib/local/mutations";

const kindOf = (file: File): "image" | "pdf" =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : "image";

/** One page's thumbnail. Its own component so each can resolve its own file. */
function Thumb({ sheet }: { sheet: Sheet }) {
  const url = useMediaUrl(sheet.filePath);
  if (sheet.kind === "pdf") {
    return <span className="sheet-pdf"><FileText size={22} strokeWidth={1.75} /><span>PDF</span></span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" /> : <span className="sheet-missing">この端末にはありません</span>;
}

/** Full-screen reader. One page at a time, big, with a zoom for small print. */
function Viewer({ sheets, start, onClose }: { sheets: Sheet[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const sheet = sheets[i];
  const url = useMediaUrl(sheet?.filePath);

  // Turning the page always drops back to the fitted view — a zoom belongs to
  // the page it was made on.
  const go = (n: number) => { setI(Math.min(Math.max(n, 0), sheets.length - 1)); setZoom(false); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") { setI((n) => Math.min(n + 1, sheets.length - 1)); setZoom(false); }
      if (e.key === "ArrowLeft") { setI((n) => Math.max(n - 1, 0)); setZoom(false); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, sheets.length]);

  if (!sheet) return null;

  return (
    <div className="sv">
      <header className="sv-top">
        <button className="fp-icon" onClick={onClose} aria-label="閉じる"><X size={22} strokeWidth={2} /></button>
        <span className="eyebrow">{i + 1} / {sheets.length}</span>
        {sheet.kind === "image" ? (
          <button className="fp-icon" onClick={() => setZoom((z) => !z)} aria-label={zoom ? "全体表示" : "拡大"}>
            {zoom ? <Minimize2 size={20} strokeWidth={2} /> : <Maximize2 size={20} strokeWidth={2} />}
          </button>
        ) : <span style={{ width: 44 }} />}
      </header>

      <div className={`sv-page ${zoom ? "zoom" : ""}`}>
        {!url ? (
          <p className="sv-note">この端末にはこのページの画像がありません。Macと同じネットワークで開くと表示できます。</p>
        ) : sheet.kind === "pdf" ? (
          <iframe src={url} title={sheet.originalName ?? "リードシート"} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={sheet.originalName ?? ""} onClick={() => setZoom((z) => !z)} />
        )}
      </div>

      {sheets.length > 1 && (
        <div className="sv-nav">
          <button className="fp-t" disabled={i === 0} onClick={() => go(i - 1)} aria-label="前のページ">
            <ChevronLeft size={26} strokeWidth={2} />
          </button>
          <button className="fp-t" disabled={i === sheets.length - 1} onClick={() => go(i + 1)} aria-label="次のページ">
            <ChevronRight size={26} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

// Lead sheets for one tune: the Real Book page, a phone photo of it, or a
// scan. Several per tune, in reading order.
export default function SheetsSection({ standardId, sheets }: { standardId: string; sheets: Sheet[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [edit, setEdit] = useState(false);

  async function upload(files: FileList) {
    setFailure("");
    const list = [...files];
    for (const [n, file] of list.entries()) {
      setBusy(list.length > 1 ? `${n + 1} / ${list.length}` : "…");
      try {
        const path = await uploadMedia(file, "sheet");
        await addSheet({ standardId, filePath: path, originalName: file.name, kind: kindOf(file) });
      } catch (e) {
        setFailure((e as Error).message);
        break;
      }
    }
    setBusy("");
  }

  return (
    <div>
      {sheets.length > 0 && (
        <div className="sheets">
          {sheets.map((s, i) => (
            <div key={s.id} className="sheet-card">
              <button className="sheet-open" onClick={() => setOpen(i)} aria-label={`${i + 1}ページ目を開く`}>
                <Thumb sheet={s} />
                <span className="sheet-n mono">{String(i + 1).padStart(2, "0")}</span>
              </button>
              {edit && (
                <div className="sheet-tools">
                  <button className="chip" disabled={i === 0} onClick={() => moveSheet(standardId, s.id, -1)} aria-label="前へ"><ChevronLeft size={13} strokeWidth={2} /></button>
                  <button className="chip" disabled={i === sheets.length - 1} onClick={() => moveSheet(standardId, s.id, 1)} aria-label="後ろへ"><ChevronRight size={13} strokeWidth={2} /></button>
                  <button
                    className="chip"
                    style={{ color: "#ef8f7e", borderColor: "#5a3128" }}
                    aria-label="このページを削除"
                    onClick={() => { if (confirm("このページを削除？")) deleteSheet(s.id); }}
                  ><Trash2 size={13} strokeWidth={2} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: sheets.length ? 12 : 0 }}>
        <button className="btn" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy ? busy : <><Plus size={15} strokeWidth={2.5} /> ページを追加</>}
        </button>
        {sheets.length > 0 && (
          <button className="btn" onClick={() => setEdit((v) => !v)}>{edit ? "並べ替え終了" : "並べ替え・削除"}</button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => { const f = e.target.files; if (f?.length) upload(f); e.target.value = ""; }}
        />
      </div>

      {sheets.length === 0 && !busy && (
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 8 }}>
          Real Book のページを撮った写真や、スキャンしたPDFを置いておけます。原本はMacに、コピーはこの端末に。
        </p>
      )}
      {failure && <p className="text-xs" style={{ color: "#ef8f7e", marginTop: 8 }}>{failure}</p>}

      {open !== null && sheets[open] && (
        <Viewer sheets={sheets} start={open} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
