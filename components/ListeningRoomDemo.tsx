"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Play, Pause, Shuffle, ChevronDown } from "lucide-react";
import { accentFor } from "@/lib/sleeve";
import { fmtTime } from "@/lib/format";

// DEMO SCREEN — not wired to real data yet. Mock takes stand in for
// "every take of every uploaded tune". Once the spec feels right we wire it to
// the DB (recordings + standards).
type Mock = { id: number; title: string; take: string; key: string; dur: number; chords: string };
const MOCK: Mock[] = [
  { id: 1, title: "Autumn Leaves", take: "Bill Evans Trio · 1959", key: "G minor", dur: 356, chords: "A: | Cm7 | F7 | BbM7 | EbM7 | Am7b5 | D7 | Gm6 | Gm6 |" },
  { id: 2, title: "So What", take: "Miles Davis · Kind of Blue", key: "D dorian", dur: 562, chords: "| Dm7 …16小節 | Ebm7 …8 | Dm7 …8 |  (モーダル)" },
  { id: 3, title: "Blue Bossa", take: "Joe Henderson · 1963", key: "C minor", dur: 310, chords: "| Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7alt | Cm7 | (Db turnaround) |" },
  { id: 4, title: "All The Things You Are", take: "Charlie Parker · 1947", key: "Ab", dur: 280, chords: "| Fm7 | Bbm7 | Eb7 | AbM7 | DbM7 | Dm7 G7 | CM7 | CM7 |" },
  { id: 5, title: "Footprints", take: "Wayne Shorter · Miles Smiles", key: "C minor", dur: 452, chords: "| Cm7 (×4) | Fm7 (×2) | Cm7 (×2) | Dm7b5 | G7#9 | Cm7 |  (6/4)" },
  { id: 6, title: "Stella By Starlight", take: "Miles Davis · 1958", key: "Bb", dur: 295, chords: "| Em7b5 | A7 | Cm7 | F7 | Fm7 | Bb7 | EbM7 | Ab7 |" },
  { id: 7, title: "Naima", take: "John Coltrane · Giant Steps", key: "—", dur: 261, chords: "Bb pedal | EbM7/Bb  Gb7/Bb | … 静かなバラード" },
  { id: 8, title: "Take the \"A\" Train", take: "Duke Ellington · 1941", key: "C", dur: 190, chords: "| CM7 | CM7 | D7 | D7 | Dm7 | G7 | C6 | (A7) |" },
  { id: 9, title: "Recorda Me", take: "Joe Henderson · Page One", key: "A minor", dur: 242, chords: "| Am7 | Am7 | Cm7 | F7 | BbM7 | … |" },
  { id: 10, title: "Body and Soul", take: "Coleman Hawkins · 1939", key: "Db", dur: 390, chords: "| Ebm7 | Ab7 | DbM7 | Bbm7 | Ebm7 | Ab7 | DbM7 | … |" },
];

const DEMO_TRACK_SECONDS = 7; // each mock take "plays" this long before advancing

function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ListeningRoomDemo() {
  // Identity order on the server; shuffle on mount to avoid a hydration mismatch.
  const [order, setOrder] = useState<number[]>(() => MOCK.map((_, i) => i));
  const [cur, setCur] = useState(0); // position within `order`
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0..1 of the current take (demo speed)
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => { setOrder(shuffled(MOCK.length)); }, []);

  // Demo auto-advance: fills the progress bar, then moves to the next row.
  const curRef = useRef(cur);
  curRef.current = cur;
  useEffect(() => {
    if (!playing) return;
    const step = 0.2 / DEMO_TRACK_SECONDS;
    const t = setInterval(() => {
      setProgress((p) => {
        if (p + step >= 1) {
          setCur((c) => (c + 1) % MOCK.length);
          return 0;
        }
        return p + step;
      });
    }, 200);
    return () => clearInterval(t);
  }, [playing]);

  const track = MOCK[order[cur]];
  const accent = accentFor(track.title);
  const elapsed = Math.round(track.dur * progress);
  const spin = "1.8s";
  const armAngle = playing ? -12 + progress * 18 : -34;

  function reshuffle() {
    setOrder(shuffled(MOCK.length));
    setCur(0);
    setProgress(0);
    setPlaying(true);
  }
  function playRow(pos: number) {
    setCur(pos);
    setProgress(0);
    setPlaying(true);
  }

  return (
    <div className="room-ground" style={{ ["--accent" as string]: accent } as React.CSSProperties}>
      <div className="room">
        <div className="topbar">
          <Link href="/" className="back"><ArrowLeft size={15} strokeWidth={2} /> 棚に戻る</Link>
          <span className="eyebrow">Listening Room · DEMO</span>
        </div>

        {/* turntable */}
        <div className="stage">
          <div className="turntable">
            <div className={`disc ${playing ? "spinning" : ""}`} style={{ ["--spin" as string]: spin }}>
              <div className="disc-label"><span className="lt">{track.title.split(" ").slice(0, 2).join(" ")}</span></div>
            </div>
            <div className="hole" />
            <div className="sheen" />
            <div className="tonearm" style={{ ["--arm" as string]: `${armAngle}deg` }}>
              <div className="bar2" /><div className="pivot" /><div className="head" />
            </div>
          </div>
        </div>

        <div className="meta">
          <h1>{track.title}</h1>
          <div className="liner">{track.take}</div>
        </div>

        {/* transport */}
        <div className="transport">
          <button className="play" onClick={() => setPlaying((v) => !v)} aria-label={playing ? "一時停止" : "再生"}>
            {playing ? <Pause size={22} fill="currentColor" strokeWidth={0} /> : <Play size={22} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}
          </button>
          <div className="pbar-wrap">
            <div className="pbar"><div className="pfill" style={{ width: `${progress * 100}%` }} /></div>
            <div className="ptime"><span>{fmtTime(elapsed)}</span><span>{fmtTime(track.dur)}</span></div>
          </div>
          <button className="btn" onClick={reshuffle} title="シャッフル" aria-label="シャッフル"><Shuffle size={16} strokeWidth={2} /></button>
        </div>

        {/* playlist */}
        <div className="blabel" style={{ marginTop: 22 }}>
          <span className="l">再生キュー · {MOCK.length} takes</span>
          <span className="v">DEMO</span>
        </div>
        <div className="lr-list">
          {order.map((mi, pos) => {
            const m = MOCK[mi];
            const now = pos === cur;
            const open = openId === m.id;
            return (
              <div key={m.id} className={`lr-item ${now ? "now" : ""}`}>
                <div className="lr-row" onClick={() => setOpenId(open ? null : m.id)}>
                  <button className="lr-play" onClick={(e) => { e.stopPropagation(); playRow(pos); }} aria-label="この曲を再生">
                    {now && playing ? <span className="eq"><i /><i /><i /></span> : <span className="n">{String(pos + 1).padStart(2, "0")}</span>}
                  </button>
                  <div className="lr-main">
                    <span className="lr-title">{m.title}</span>
                    <span className="lr-take">{m.take}</span>
                  </div>
                  <span className="lr-dur">{fmtTime(m.dur)}</span>
                  <ChevronDown className={`lr-chev ${open ? "open" : ""}`} size={16} strokeWidth={2} />
                </div>
                {open && (
                  <div className="lr-detail">
                    <div className="kv"><span>KEY {m.key}</span></div>
                    <pre className="lr-chords">{m.chords}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 16 }}>
          ※ これはデモ表示です（データ未接続・音は鳴りません）。仕様が固まったら実データに接続します。
        </p>
      </div>
    </div>
  );
}
