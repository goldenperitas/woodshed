"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Plus, X, Star, Pencil, Trash2, Download, Check, PenLine } from "lucide-react";
import type { Recording, Region, Standard } from "@/lib/db/schema";
import { REGION_LABELS, NOTE_TAGS, NOTE_TAG_LABEL } from "@/lib/constants";
import { accentFor } from "@/lib/sleeve";
import { fmtTime } from "@/lib/format";
import {
  addRegion, deleteRegion, setReference, deleteRecording, updateRecording, addNote,
} from "@/app/actions";
import { saveOffline, removeOffline, getOfflineBlob, listOfflineKeys } from "@/lib/offline";

const RATES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const R = 46;
const C = 2 * Math.PI * R;

export default function Woodshed({
  standard, recordings, regions,
}: { standard: Standard; recordings: Recording[]; regions: Region[] }) {
  const router = useRouter();
  const accent = accentFor(standard.title);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [takeIdx, setTakeIdx] = useState(0);
  const take = recordings[takeIdx];

  const [src, setSrc] = useState<string | null>(null);
  const [offlineSet, setOfflineSet] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<{ n: string; s: number; e: number } | null>(null);

  const [markA, setMarkA] = useState<number | null>(null);
  const [markB, setMarkB] = useState<number | null>(null);
  const [regLabel, setRegLabel] = useState("head");

  const [noteAt, setNoteAt] = useState<number | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteTag, setNoteTag] = useState("general");
  const [showTakeEdit, setShowTakeEdit] = useState(false);

  const takeRegions = take ? regions.filter((r) => r.recordingId === take.id) : [];

  useEffect(() => { listOfflineKeys().then((ks) => setOfflineSet(new Set(ks))); }, []);

  // Load active take (offline blob if we have it, else the file on disk).
  useEffect(() => {
    if (!take) { setSrc(null); return; }
    let revoked: string | null = null;
    setLoop(null); setPos(0); setPlaying(false);
    getOfflineBlob(take.filePath).then((blob) => {
      if (blob) { const u = URL.createObjectURL(blob); revoked = u; setSrc(u); }
      else setSrc("/" + take.filePath);
    });
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [take]);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    a.playbackRate = rate;
    const anyA = a as unknown as Record<string, unknown>;
    anyA.preservesPitch = true; anyA.webkitPreservesPitch = true;
  }, [rate, src]);

  const onTime = () => {
    const a = audioRef.current; if (!a) return;
    if (loop && a.currentTime >= loop.e) a.currentTime = loop.s;
    setPos(a.currentTime);
  };
  const togglePlay = () => { const a = audioRef.current; if (!a) return; a.paused ? a.play() : a.pause(); };
  const seek = (t: number) => { const a = audioRef.current; if (!a) return; a.currentTime = t; setPos(t); };

  const playRegion = (r: Region) => {
    const a = audioRef.current; if (!a) return;
    setLoop({ n: r.label || "loop", s: r.startSec, e: r.endSec });
    a.currentTime = r.startSec; a.play();
  };
  const clearLoop = () => setLoop(null);

  const saveRegion = async () => {
    if (markA === null || markB === null || !take) return;
    const s = Math.min(markA, markB), e = Math.max(markA, markB);
    if (e - s < 0.3) return;
    await addRegion(take.id, standard.id, { label: regLabel, startSec: s, endSec: e });
    setMarkA(null); setMarkB(null); router.refresh();
  };

  const saveNote = async () => {
    if (!noteBody.trim() || noteAt === null || !take) return;
    await addNote(standard.id, { body: noteBody, tag: noteTag, recordingId: take.id, timestampSec: noteAt });
    setNoteBody(""); setNoteAt(null); router.refresh();
  };

  const toggleOffline = useCallback(async () => {
    if (!take) return;
    const key = take.filePath;
    const next = new Set(offlineSet);
    try {
      if (offlineSet.has(key)) { await removeOffline(key); next.delete(key); setSrc("/" + key); }
      else { await saveOffline(key, "/" + key); const b = await getOfflineBlob(key); if (b) setSrc(URL.createObjectURL(b)); next.add(key); }
      setOfflineSet(next);
    } catch { alert("オフライン保存に失敗しました"); }
  }, [take, offlineSet]);

  // ---- disc geometry ----
  const spin = (1.8 / rate).toFixed(3) + "s";
  // Tonearm: parked & lifted off the platter at rest; drops onto the outer
  // groove when playing and travels inward toward the center as it progresses.
  const armOn = playing || pos > 0.3;
  const armAngle = armOn && dur ? -12 + (pos / dur) * 18 : -34;
  const arcStyle: React.CSSProperties | undefined = loop && dur
    ? { strokeDasharray: `${(((loop.e - loop.s) / dur) * C).toFixed(2)} ${((1 - (loop.e - loop.s) / dur) * C).toFixed(2)}`,
        strokeDashoffset: (-(loop.s / dur) * C).toFixed(2) }
    : undefined;

  return (
    <div style={{ ["--accent" as string]: accent }}>
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d); }}
        onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* turntable */}
      <div className="stage">
        <div className="turntable">
          <div className={`disc ${playing ? "spinning" : ""}`} style={{ ["--spin" as string]: spin }}>
            <div className="label">
              {standard.artworkPath
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={"/" + standard.artworkPath} alt="" />
                : <span className="lt">{standard.title.split(" ").slice(0, 2).join(" ")}</span>}
            </div>
          </div>
          <div className="hole" />
          <div className="sheen" />
          <svg className="ring" viewBox="0 0 100 100">
            <circle className="track" cx="50" cy="50" r={R} />
            <circle className={`arc ${loop ? "on" : ""}`} cx="50" cy="50" r={R} style={arcStyle} />
          </svg>
          <div className="tonearm" style={{ ["--arm" as string]: `${armAngle}deg` }}>
            <div className="bar2" /><div className="pivot" /><div className="head" />
          </div>
        </div>
      </div>

      <div className="meta">
        <h1>{standard.title}</h1>
        <div className="liner">
          {[standard.composer, standard.key && `KEY ${standard.key}`, standard.form].filter(Boolean).join(" · ")}
        </div>
      </div>

      {/* takes */}
      {recordings.length > 0 && (
        <>
          <div className="blabel"><span className="l">Takes · 音源</span><span className="v">{recordings.length} 件</span></div>
          <div className="takes">
            {recordings.map((r, i) => (
              <button key={r.id} className={`take ${i === takeIdx ? "on" : ""}`} onClick={() => setTakeIdx(i)}>
                <div className="p">{r.performer || r.originalName || "無名の録音"}</div>
                <div className="d">{[r.year, r.instrumentation, r.durationSec ? fmtTime(r.durationSec) : null].filter(Boolean).join(" · ") || "情報未設定"}</div>
                <div className="bd">
                  {r.isReference === 1 && <span className="ref"><Star size={11} strokeWidth={2} fill="currentColor" /> REF</span>}
                  {offlineSet.has(r.filePath) && <span className="off"><Download size={11} strokeWidth={2} /> TAPE</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {take ? (
        <>
          {/* transport */}
          <div className="transport">
            <button className="play" onClick={togglePlay} aria-label={playing ? "一時停止" : "再生"}>
              {playing ? <Pause size={22} fill="currentColor" strokeWidth={0} /> : <Play size={22} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}
            </button>
            <div className="pbar-wrap">
              <div className="pbar" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * (dur || 0)); }}>
                {loop && dur ? <div className="ploop" style={{ left: `${(loop.s / dur) * 100}%`, width: `${((loop.e - loop.s) / dur) * 100}%` }} /> : null}
                <div className="pfill" style={{ width: `${dur ? (pos / dur) * 100 : 0}%` }} />
              </div>
              <div className="ptime"><span>{fmtTime(pos)}</span><span>{fmtTime(dur)}</span></div>
            </div>
          </div>

          {/* speed */}
          <div className="blabel"><span className="l">速度 · ピッチ維持</span><span className="v">{rate.toFixed(2)}×</span></div>
          <div className="chips">
            {RATES.map((r) => (
              <button key={r} className={`chip ${rate === r ? "on" : ""}`} onClick={() => setRate(r)}>{r.toFixed(2)}×</button>
            ))}
          </div>

          {/* loop regions */}
          <div className="blabel"><span className="l">Loop 区間</span><span className="v">{loop ? `${loop.n} ${fmtTime(loop.s)}–${fmtTime(loop.e)}` : "—"}</span></div>
          <div className="chips">
            {takeRegions.map((r) => (
              <span key={r.id} style={{ display: "inline-flex" }}>
                <button className={`chip ${loop && loop.s === r.startSec && loop.e === r.endSec ? "on" : ""}`}
                  style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }} onClick={() => playRegion(r)}>
                  {r.label || "区間"} {fmtTime(r.startSec)}–{fmtTime(r.endSec)}
                </button>
                <button className="chip" title="削除" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "none", color: "var(--muted)" }}
                  onClick={async () => { await deleteRegion(r.id, standard.id); clearLoop(); router.refresh(); }}><X size={13} strokeWidth={2} /></button>
              </span>
            ))}
            {loop && <button className="chip" onClick={clearLoop}>解除</button>}
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            <button className="chip" onClick={() => setMarkA(pos)}>A {markA !== null ? `= ${fmtTime(markA)}` : "記録"}</button>
            <button className="chip" onClick={() => setMarkB(pos)}>B {markB !== null ? `= ${fmtTime(markB)}` : "記録"}</button>
            <select className="chip" value={regLabel} onChange={(e) => setRegLabel(e.target.value)}>
              {REGION_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            {markA !== null && markB !== null && <button className="chip on" onClick={saveRegion}><Plus size={13} strokeWidth={2.5} /> 区間保存</button>}
          </div>
          <p className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>※ head 区間はヘッド当てドリルに使われます</p>

          {/* timestamp note + per-take controls */}
          <div className="chips" style={{ marginTop: 14 }}>
            {noteAt === null && <button className="btn" onClick={() => setNoteAt(pos)}><PenLine size={15} strokeWidth={2} /> {fmtTime(pos)} にメモ</button>}
            <button className="btn" onClick={toggleOffline}>{offlineSet.has(take.filePath) ? <><Check size={15} strokeWidth={2} /> オフライン</> : <><Download size={15} strokeWidth={2} /> オフライン保存</>}</button>
            {take.isReference !== 1 && <button className="btn" onClick={async () => { await setReference(take.id, standard.id); router.refresh(); }}><Star size={15} strokeWidth={2} /> 基準にする</button>}
            <button className="btn" onClick={() => setShowTakeEdit((v) => !v)}><Pencil size={15} strokeWidth={2} /> テイク情報</button>
            <button className="btn btn-danger" aria-label="テイクを削除" onClick={async () => { if (confirm("このテイクを削除？")) { if (offlineSet.has(take.filePath)) await removeOffline(take.filePath); await deleteRecording(take.id, standard.id); setTakeIdx(0); router.refresh(); } }}><Trash2 size={15} strokeWidth={2} /></button>
          </div>

          {noteAt !== null && (
            <div className="card" style={{ padding: 12, marginTop: 10 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>{fmtTime(noteAt)} のメモ</div>
              <textarea className="textarea" style={{ minHeight: 60 }} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="ここのリハモが…" autoFocus />
              <div className="chips" style={{ marginTop: 8 }}>
                <select className="select" style={{ width: "auto" }} value={noteTag} onChange={(e) => setNoteTag(e.target.value)}>
                  {NOTE_TAGS.map((t) => <option key={t} value={t}>{NOTE_TAG_LABEL[t]}</option>)}
                </select>
                <button className="btn btn-accent" onClick={saveNote}>保存</button>
                <button className="btn" onClick={() => { setNoteAt(null); setNoteBody(""); }}>×</button>
              </div>
            </div>
          )}

          {showTakeEdit && (
            <form className="card" style={{ padding: 12, marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
              action={async (fd) => { await updateRecording(take.id, standard.id, fd); setShowTakeEdit(false); router.refresh(); }}>
              <input name="performer" className="input" placeholder="演奏者" defaultValue={take.performer ?? ""} />
              <input name="year" className="input" placeholder="年" inputMode="numeric" defaultValue={take.year ?? ""} />
              <input name="instrumentation" className="input" placeholder="編成" defaultValue={take.instrumentation ?? ""} />
              <button className="btn btn-accent" style={{ gridColumn: "1 / -1" }} type="submit">保存</button>
            </form>
          )}
        </>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 16 }}>まだ音源がありません。下の枠から追加してください。</p>
      )}
    </div>
  );
}
