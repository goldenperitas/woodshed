"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Plus, X, Star, Pencil, Trash2, Download, Check, PenLine } from "lucide-react";
import type { Recording, Region, Standard } from "@/lib/sync/schema";
import { REGION_LABELS, NOTE_TAGS, NOTE_TAG_LABEL } from "@/lib/constants";
import { accentFor } from "@/lib/sleeve";
import { fmtTime } from "@/lib/format";
import {
  addRegion, deleteRegion, setReference, deleteRecording, updateRecording, addNote,
} from "@/lib/local/mutations";
import { saveOffline, removeOffline, getOfflineBlob, listOfflineKeys, resolveMediaUrl, mediaUrl } from "@/lib/offline";
import { useMediaUrl } from "@/lib/local/media";
import { usePlayer } from "@/components/player/PlayerProvider";
import Scrubber from "@/components/player/Scrubber";

const RATES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const R = 46;
const C = 2 * Math.PI * R;

type LocalLoop = { n: string; s: number; e: number } | null;

export default function Woodshed({
  standard, recordings, regions,
}: { standard: Standard; recordings: Recording[]; regions: Region[] }) {
  const player = usePlayer();
  const accent = accentFor(standard.title);

  const [takeIdx, setTakeIdx] = useState(0);
  const take = recordings[takeIdx];

  // src is pre-resolved (offline blob or /path) so play() fires inside the
  // user gesture — resolving lazily would break iOS autoplay.
  const [src, setSrc] = useState<string | null>(null);
  const [offlineSet, setOfflineSet] = useState<Set<string>>(new Set());

  // Page-local cues; when this take is the active global track they mirror the
  // player, otherwise they are what a fresh play() will start from.
  const [localRate, setLocalRate] = useState(1);
  const [localLoop, setLocalLoop] = useState<LocalLoop>(null);

  const [markA, setMarkA] = useState<number | null>(null);
  const [markB, setMarkB] = useState<number | null>(null);
  const [regLabel, setRegLabel] = useState("head");

  const [noteAt, setNoteAt] = useState<number | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteTag, setNoteTag] = useState("general");
  const [showTakeEdit, setShowTakeEdit] = useState(false);

  const takeRegions = take ? regions.filter((r) => r.recordingId === take.id) : [];

  // Is this take the one currently loaded in the global player?
  const isThis = !!take && player.isCurrent(take.filePath);
  const playing = isThis && player.playing;
  const pos = isThis ? player.pos : 0;
  const dur = isThis ? player.dur : take?.durationSec ?? 0;
  const rate = isThis ? player.rate : localRate;

  // Track the player's current src so we don't revoke a blob URL it's still using.
  const playerSrcRef = useRef<string | null>(null);
  playerSrcRef.current = player.track?.src ?? null;

  useEffect(() => { listOfflineKeys().then((ks) => setOfflineSet(new Set(ks))); }, []);

  const artUrl = useMediaUrl(standard.artworkPath);

  // While this take is the one playing on its own page, keep it repeating —
  // even if it was started from the Listening Room (which plays through).
  useEffect(() => { if (isThis) player.setRepeat(true); }, [isThis, player]);

  // Resolve the selected take's src, and reset page-local cues for it.
  useEffect(() => {
    if (!take) { setSrc(null); return; }
    let created: string | null = null;
    setLocalLoop(null); setMarkA(null); setMarkB(null); setNoteAt(null);
    resolveMediaUrl(take.filePath).then((u) => {
      if (u?.startsWith("blob:")) created = u;
      setSrc(u);
    });
    return () => {
      if (created && playerSrcRef.current !== created) URL.revokeObjectURL(created);
    };
  }, [take]);

  const loadThis = useCallback((opts: { autoplay?: boolean; loop?: { s: number; e: number } | null } = {}) => {
    if (!take || !src) return;
    player.load(
      {
        id: take.filePath, src,
        title: standard.title,
        subtitle: take.performer || take.originalName || "無名の録音",
        accent, artworkPath: standard.artworkPath, artworkUrl: artUrl,
        href: `/standards/${standard.id}`,
      },
      {
        autoplay: opts.autoplay ?? true,
        rate: localRate,
        loop: opts.loop !== undefined ? opts.loop : (localLoop ? { s: localLoop.s, e: localLoop.e } : null),
        repeat: true, // on the tune page, keep repeating this take
      },
    );
  }, [take, src, standard, accent, artUrl, localRate, localLoop, player]);

  const togglePlay = () => { if (isThis) player.toggle(); else loadThis({ autoplay: true }); };
  // Dragging a bar for a take that is not loaded must not reload it on every
  // step of the drag — starting it once, on release, is what was meant.
  const seek = (t: number, final = true) => {
    if (isThis) player.seek(t);
    else if (final) loadThis({ autoplay: true });
  };

  const playRegion = (r: Region) => {
    const L = { n: r.label || "loop", s: r.startSec, e: r.endSec };
    setLocalLoop(L);
    if (isThis) { player.setLoop({ s: L.s, e: L.e }); player.seek(L.s); player.play(); }
    else loadThis({ autoplay: true, loop: { s: L.s, e: L.e } });
  };
  const clearLoop = () => { setLocalLoop(null); if (isThis) player.setLoop(null); };

  const setRate = (r: number) => { setLocalRate(r); if (isThis) player.setRate(r); };

  const saveRegion = async () => {
    if (markA === null || markB === null || !take) return;
    const s = Math.min(markA, markB), e = Math.max(markA, markB);
    if (e - s < 0.3) return;
    await addRegion(take.id, standard.id, { label: regLabel, startSec: s, endSec: e });
    setMarkA(null); setMarkB(null);
  };

  const saveNote = async () => {
    if (!noteBody.trim() || noteAt === null || !take) return;
    await addNote(standard.id, { body: noteBody, tag: noteTag, recordingId: take.id, timestampSec: noteAt });
    setNoteBody(""); setNoteAt(null);
  };

  // Only legacy takes — the ones whose bytes still sit in public/audio on the
  // Mac — can be toggled. Anything added on a device is already device-local
  // and has nowhere to be re-fetched from, so dropping it would destroy it.
  const toggleOffline = useCallback(async () => {
    if (!take || take.filePath.startsWith("local:")) return;
    const key = take.filePath;
    const next = new Set(offlineSet);
    try {
      if (offlineSet.has(key)) { await removeOffline(key); next.delete(key); setSrc(mediaUrl(key)); }
      else { await saveOffline(key, mediaUrl(key)); const b = await getOfflineBlob(key); if (b) setSrc(URL.createObjectURL(b)); next.add(key); }
      setOfflineSet(next);
    } catch { alert("オフライン保存に失敗しました"); }
  }, [take, offlineSet]);

  // ---- disc geometry ----
  const spin = (1.8 / rate).toFixed(3) + "s";
  // Tonearm: parked & lifted off the platter at rest; drops onto the outer
  // groove when playing and travels inward toward the center as it progresses.
  const armOn = playing || pos > 0.3;
  const armAngle = armOn && dur ? -12 + (pos / dur) * 18 : -34;
  const arcStyle: React.CSSProperties | undefined = localLoop && dur
    ? { strokeDasharray: `${(((localLoop.e - localLoop.s) / dur) * C).toFixed(2)} ${((1 - (localLoop.e - localLoop.s) / dur) * C).toFixed(2)}`,
        strokeDashoffset: (-(localLoop.s / dur) * C).toFixed(2) }
    : undefined;

  return (
    <div style={{ ["--accent" as string]: accent }}>
      {/* turntable */}
      <div className="stage">
        <div className="turntable">
          <div className={`disc ${playing ? "spinning" : ""}`} style={{ ["--spin" as string]: spin }}>
            <div className="disc-label">
              {artUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={artUrl} alt="" />
                : <span className="lt">{standard.title.split(" ").slice(0, 2).join(" ")}</span>}
            </div>
          </div>
          <div className="hole" />
          <div className="sheen" />
          <svg className="ring" viewBox="0 0 100 100">
            <circle className="track" cx="50" cy="50" r={R} />
            <circle className={`arc ${localLoop ? "on" : ""}`} cx="50" cy="50" r={R} style={arcStyle} />
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
                  {(r.filePath.startsWith("local:") || offlineSet.has(r.filePath)) && <span className="off"><Download size={11} strokeWidth={2} /> TAPE</span>}
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
            <Scrubber
              className="pbar-wrap"
              pos={pos} dur={dur} times
              loop={localLoop ? { s: localLoop.s, e: localLoop.e } : null}
              onSeek={seek}
            />
          </div>

          {/* speed */}
          <div className="blabel"><span className="l">速度 · ピッチ維持</span><span className="v">{rate.toFixed(2)}×</span></div>
          <div className="chips">
            {RATES.map((r) => (
              <button key={r} className={`chip ${rate === r ? "on" : ""}`} onClick={() => setRate(r)}>{r.toFixed(2)}×</button>
            ))}
          </div>

          {/* loop regions */}
          <div className="blabel"><span className="l">Loop 区間</span><span className="v">{localLoop ? `${localLoop.n} ${fmtTime(localLoop.s)}–${fmtTime(localLoop.e)}` : "—"}</span></div>
          <div className="chips">
            {takeRegions.map((r) => (
              <span key={r.id} style={{ display: "inline-flex" }}>
                <button className={`chip ${localLoop && localLoop.s === r.startSec && localLoop.e === r.endSec ? "on" : ""}`}
                  style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }} onClick={() => playRegion(r)}>
                  {r.label || "区間"} {fmtTime(r.startSec)}–{fmtTime(r.endSec)}
                </button>
                <button className="chip" title="削除" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "none", color: "var(--muted)" }}
                  onClick={async () => { await deleteRegion(r.id, standard.id); clearLoop(); }}><X size={13} strokeWidth={2} /></button>
              </span>
            ))}
            {localLoop && <button className="chip" onClick={clearLoop}>解除</button>}
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
            {noteAt === null && <button className="chip" onClick={() => setNoteAt(pos)}><PenLine size={13} strokeWidth={2} /> {fmtTime(pos)} にメモ</button>}
            {take.filePath.startsWith("local:")
              ? <span className="chip on" title="この端末にある音源"><Check size={13} strokeWidth={2} /> On device</span>
              : <button className="chip" onClick={toggleOffline}>{offlineSet.has(take.filePath) ? <><Check size={13} strokeWidth={2} /> Saved</> : <><Download size={13} strokeWidth={2} /> Save</>}</button>}
            {take.isReference !== 1 && <button className="chip" onClick={async () => { await setReference(take.id, standard.id); }}><Star size={13} strokeWidth={2} /> Ref</button>}
            <button className="chip" aria-label="テイク情報" title="テイク情報" onClick={() => setShowTakeEdit((v) => !v)}><Pencil size={13} strokeWidth={2} /></button>
            <button className="chip" aria-label="テイクを削除" title="削除" style={{ color: "#ef8f7e", borderColor: "#5a3128" }} onClick={async () => { if (confirm("このテイクを削除？")) { if (isThis) player.stop(); if (offlineSet.has(take.filePath)) await removeOffline(take.filePath); await deleteRecording(take.id, standard.id); setTakeIdx(0); } }}><Trash2 size={13} strokeWidth={2} /></button>
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
              action={async (fd) => { await updateRecording(take.id, standard.id, fd); setShowTakeEdit(false); }}>
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
