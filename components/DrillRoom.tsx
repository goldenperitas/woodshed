"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, Pause, Dices } from "lucide-react";
import type { DrillItem } from "@/lib/local/queries";
import { accentFor } from "@/lib/sleeve";
import { logReview } from "@/lib/local/mutations";
import { usePlayer } from "@/components/player/PlayerProvider";

type Mode = "name" | "audio" | "session";

const RATINGS = [
  { v: 1, label: "もう一度", cls: "again" },
  { v: 2, label: "むずい", cls: "hard" },
  { v: 3, label: "できた", cls: "good" },
  { v: 4, label: "余裕", cls: "easy" },
];

// 12 pitch classes for the session simulator — flats, no major/minor.
const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const SHARP_TO_FLAT: Record<string, string> = { C: "Db", D: "Eb", E: "F", F: "Gb", G: "Ab", A: "Bb", B: "C" };

// Normalize a stored key like "Bb", "F#", "Ebm7" to a bare flat pitch class.
function rootOf(k: string | null): string | null {
  if (!k) return null;
  const m = k.trim().match(/^([A-Ga-g])([#♯b♭]?)/);
  if (!m) return null;
  let n = m[1].toUpperCase();
  if (m[2] === "#" || m[2] === "♯") n = SHARP_TO_FLAT[n] ?? n;
  else if (m[2] === "b" || m[2] === "♭") n = n + "b";
  return KEYS.includes(n) ? n : null;
}

// Random target key, biased away from the tune's own key so it's always a
// real transposition.
function pickKey(orig: string | null): string {
  const avoid = rootOf(orig);
  let k = KEYS[Math.floor(Math.random() * KEYS.length)];
  if (avoid && k === avoid) k = KEYS[(KEYS.indexOf(k) + 1 + Math.floor(Math.random() * 11)) % 12];
  return k;
}

function orderDue(items: DrillItem[], mode: Mode) {
  const now = Date.now();
  const due: DrillItem[] = [], unseen: DrillItem[] = [], later: DrillItem[] = [];
  for (const d of items) {
    const v = mode === "audio" ? d.dueAudio : mode === "session" ? d.dueSession : d.dueName;
    if (v === null) unseen.push(d);
    else if (v <= now) due.push(d);
    else later.push(d);
  }
  return [...due, ...unseen, ...later];
}

export default function DrillRoom({
  deck,
  initialGroup = null,
}: {
  deck: DrillItem[];
  initialGroup?: string | null;
}) {
  const allGroups = useMemo(
    () => [...new Set(deck.flatMap((d) => d.groupNames))].sort(),
    [deck],
  );
  const [mode, setMode] = useState<Mode>("name");
  const [group, setGroup] = useState<string | null>(
    initialGroup && allGroups.includes(initialGroup) ? initialGroup : null,
  );
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [arate, setArate] = useState(1);
  const [aplaying, setAplaying] = useState(false);
  const [sessionKey, setSessionKey] = useState("C");
  const player = usePlayer();

  const queue = useMemo(() => {
    let eligible = group ? deck.filter((d) => d.groupNames.includes(group)) : deck;
    if (mode === "audio") eligible = eligible.filter((d) => d.head);
    if (mode === "session") eligible = eligible.filter((d) => d.status >= 2);
    return orderDue(eligible, mode);
  }, [deck, mode, group]);

  const item = queue[idx];
  const accent = item ? accentFor(item.title) : "#E1541B";

  // Assign a fresh random key each time a session card comes up.
  useEffect(() => {
    if (mode !== "session" || !item) return;
    setSessionKey(pickKey(item.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, item?.id]);

  function switchMode(m: Mode) {
    setMode(m); setIdx(0); setRevealed(false); setDone(false); stopHead();
  }

  function switchGroup(g: string | null) {
    setGroup(g); setIdx(0); setRevealed(false); setDone(false); stopHead();
  }

  function reveal() { setRevealed(true); stopHead(); }

  async function rate(v: number) {
    if (!item) return;
    const logMode = mode === "audio" ? "audio_to_name" : mode === "session" ? "session_key" : "name_to_info";
    await logReview(item.id, logMode, v);
    stopHead();
    if (idx + 1 >= queue.length) { setDone(true); }
    else { setIdx(idx + 1); setRevealed(false); }
  }

  function playHead() {
    const a = audioRef.current; if (!a || !item?.head) return;
    player.pause(); // silence any background tune from the global player
    a.playbackRate = arate;
    const anyA = a as unknown as Record<string, unknown>;
    anyA.preservesPitch = true; anyA.webkitPreservesPitch = true;
    a.currentTime = item.head.start; a.play(); setAplaying(true);
  }
  function stopHead() { const a = audioRef.current; if (a) { a.pause(); } setAplaying(false); }
  function onHeadTime() {
    const a = audioRef.current; if (!a || !item?.head) return;
    if (a.currentTime >= item.head.end) { a.pause(); a.currentTime = item.head.start; setAplaying(false); }
  }

  return (
    <div className="room-ground" style={{ ["--accent" as string]: accent }}>
      <div className="room" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div className="topbar">
          <div className="chips">
            <button className={`chip ${mode === "name" ? "on" : ""}`} onClick={() => switchMode("name")}>曲名 → 情報</button>
            <button className={`chip ${mode === "audio" ? "on" : ""}`} onClick={() => switchMode("audio")}>音 → 曲名</button>
            <button className={`chip ${mode === "session" ? "on" : ""}`} onClick={() => switchMode("session")}>セッション</button>
          </div>
          <Link href="/" className="back">やめる</Link>
        </div>

        {allGroups.length > 0 && (
          <div className="chips" style={{ marginTop: 10 }}>
            <button className={`chip ${group === null ? "on" : ""}`} onClick={() => switchGroup(null)}>すべて</button>
            {allGroups.map((g) => (
              <button key={g} className={`chip ${group === g ? "on" : ""}`} onClick={() => switchGroup(group === g ? null : g)}>{g}</button>
            ))}
          </div>
        )}

        {done || !item ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center" }}>
            <div>
              <div className="display" style={{ fontSize: 28, color: "var(--accent)" }}>ひと巡り</div>
              <p style={{ color: "var(--muted)", marginTop: 8 }}>
                {queue.length === 0
                  ? mode === "session" ? "S2・S3 の曲がありません。" : "対象がありません。"
                  : `${queue.length} 枚を回しました。`}
              </p>
              <button className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => { setIdx(0); setRevealed(false); setDone(false); }}>もう一周</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mono" style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", letterSpacing: ".1em" }}>
              {String(idx + 1).padStart(2, "0")} / {String(queue.length).padStart(2, "0")}
            </div>

            <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "16px 0" }}>
              {mode === "name" ? (
                <div className={`flip ${revealed ? "on" : ""}`}>
                  <div className="fin">
                    <div className="face front">
                      <span className="fbar" />
                      <span className="eyebrow">Recall</span>
                      <span className="t">{item.title}</span>
                      <span className="prompt">頭の中で鳴らす<br />キー・構成・進行・メロディ</span>
                    </div>
                    <div className="face face-back">
                      <span className="eyebrow">Answer</span>
                      <span className="bt">{item.title}</span>
                      <div className="kv">
                        {item.key && <span>KEY {item.key}</span>}
                        {item.form && <span>{item.form}</span>}
                        {item.composer && <span>{item.composer}</span>}
                      </div>
                      {item.chordInterpretation && <pre className="chline" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{item.chordInterpretation}</pre>}
                    </div>
                  </div>
                </div>
              ) : mode === "session" ? (
                <div className={`flip ${revealed ? "on" : ""}`}>
                  <div className="fin">
                    <div className="face front sess">
                      <span className="fbar" />
                      <span className="eyebrow">Session</span>
                      <span className="t">{item.title}</span>
                      <div className="skey">
                        <span className="lab">Play in</span>
                        <span className="val">{sessionKey}</span>
                        <button
                          type="button"
                          className="reroll"
                          aria-label="別のキー"
                          title="別のキー"
                          onClick={(e) => { e.stopPropagation(); setSessionKey(pickKey(item.key)); }}
                        >
                          <Dices size={17} strokeWidth={2} />
                        </button>
                      </div>
                      <span className="prompt">このキーでヘッド／フルを弾く</span>
                    </div>
                    <div className="face face-back">
                      <span className="eyebrow">Changes</span>
                      <span className="bt">{item.title}</span>
                      <div className="kv">
                        <span className="hot">in {sessionKey}</span>
                        {item.key && <span>orig {item.key}</span>}
                        {item.form && <span>{item.form}</span>}
                        {item.composer && <span>{item.composer}</span>}
                      </div>
                      {item.chordInterpretation
                        ? <pre className="chline" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{item.chordInterpretation}</pre>
                        : <span className="prompt" style={{ color: "var(--muted)" }}>コード進行は未登録。頭の中の進行を {sessionKey} で。</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="blind">
                  <audio ref={audioRef} src={item.head?.src} preload="auto" onTimeUpdate={onHeadTime} onPause={() => setAplaying(false)} />
                  <div className="turntable" style={{ width: "min(62vw,230px)", height: "min(62vw,230px)" }}>
                    <div className={`disc ${aplaying ? "spinning" : ""}`} style={{ ["--spin" as string]: (1.8 / arate).toFixed(3) + "s" }} />
                    <div className={`blabel-q ${revealed ? "reveal" : ""}`}>
                      {revealed ? <span className="rt">{item.title.split(" ").slice(0, 3).join(" ")}</span> : <span className="q">?</span>}
                    </div>
                    <div className="hole" />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="play" style={{ width: 52, height: 52 }} aria-label={aplaying ? "停止" : "再生"} onClick={() => (aplaying ? stopHead() : playHead())}>{aplaying ? <Pause size={20} fill="currentColor" strokeWidth={0} /> : <Play size={20} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}</button>
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>ヘッドを聴いて当てる</span>
                  </div>
                  <div className="chips">
                    {[0.5, 0.75, 1.0].map((r) => (
                      <button key={r} className={`chip ${arate === r ? "on" : ""}`} onClick={() => setArate(r)}>{r.toFixed(2)}×</button>
                    ))}
                  </div>
                  {revealed && (
                    <div className="card" style={{ padding: 14, width: "100%" }}>
                      <div className="kv">
                        {item.key && <span>KEY {item.key}</span>}
                        {item.form && <span>{item.form}</span>}
                        {item.composer && <span>{item.composer}</span>}
                      </div>
                      {item.chordInterpretation && <pre className="chline" style={{ whiteSpace: "pre-wrap", margin: "10px 0 0" }}>{item.chordInterpretation}</pre>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ paddingBottom: 20 }}>
              {!revealed ? (
                <button className="reveal-btn" onClick={reveal}>答えを見る</button>
              ) : (
                <div className="rate">
                  {RATINGS.map((r) => (
                    <button key={r.v} className={`rbtn ${r.cls}`} onClick={() => rate(r.v)}>{r.label}</button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
