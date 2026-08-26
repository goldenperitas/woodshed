"use client";

import ViewLink from "@/components/ViewLink";
import { useEffect } from "react";
import {
  ChevronDown, Disc3, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, X,
} from "lucide-react";
import { fmtTime } from "@/lib/format";
import { useMediaUrl } from "@/lib/local/media";
import { usePlayer } from "./PlayerProvider";

const RATES = [0.5, 1] as const;

// Full-screen transport. Built for a glance-and-tap situation (driving, hands
// busy at the horn): few controls, all of them large, nothing to read.
export default function FullPlayer({ onClose }: { onClose: () => void }) {
  const {
    track, playing, pos, dur, rate, hasQueue,
    toggle, seek, nudge, next, prev, setRate, stop,
  } = usePlayer();

  const art = useMediaUrl(track?.artworkPath) ?? track?.artworkUrl ?? null;

  // Escape closes; the page underneath must not scroll while this is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Nothing left to show once playback is stopped from in here.
  useEffect(() => { if (!track) onClose(); }, [track, onClose]);

  if (!track) return null;

  const pct = dur ? (pos / dur) * 100 : 0;

  return (
    <div className="fp" style={{ ["--accent" as string]: track.accent ?? "var(--orange)" }}>
      <div className="fp-glow" />

      <header className="fp-top">
        <button className="fp-icon" onClick={onClose} aria-label="プレイヤーを閉じる">
          <ChevronDown size={26} strokeWidth={2} />
        </button>
        <span className="eyebrow">Now Playing</span>
        <button className="fp-icon" onClick={stop} aria-label="停止">
          <X size={22} strokeWidth={2} />
        </button>
      </header>

      <div className="fp-art">
        {art
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={art} alt="" />
          : <Disc3 className={playing ? "spin" : ""} size={92} strokeWidth={1} />}
      </div>

      <div className="fp-meta">
        {track.href
          ? <ViewLink href={track.href} onClick={onClose}><h1 className="display">{track.title}</h1></ViewLink>
          : <h1 className="display">{track.title}</h1>}
        {track.subtitle && <p className="mono">{track.subtitle}</p>}
      </div>

      <div
        className="fp-seek"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (dur) seek(((e.clientX - r.left) / r.width) * dur);
        }}
      >
        <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
        <div className="times mono"><span>{fmtTime(pos)}</span><span>{fmtTime(dur)}</span></div>
      </div>

      <div className="fp-transport">
        <button className="fp-t" onClick={prev} disabled={!hasQueue} aria-label="前の曲">
          <SkipBack size={26} fill="currentColor" strokeWidth={2} />
        </button>
        <button className="fp-t" onClick={() => nudge(-10)} aria-label="10秒戻す">
          {/* The "10" rides inside the SVG so it stays centred in the arrow at any size. */}
          <RotateCcw size={34} strokeWidth={1.7}>
            <text key="s" x="12" y="12.4" textAnchor="middle" dominantBaseline="central" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none">10</text>
          </RotateCcw>
        </button>
        <button className="fp-play" onClick={toggle} aria-label={playing ? "一時停止" : "再生"}>
          {playing
            ? <Pause size={38} fill="currentColor" strokeWidth={0} />
            : <Play size={38} fill="currentColor" strokeWidth={0} style={{ marginLeft: 4 }} />}
        </button>
        <button className="fp-t" onClick={() => nudge(10)} aria-label="10秒進める">
          <RotateCw size={34} strokeWidth={1.7}>
            <text key="s" x="12" y="12.4" textAnchor="middle" dominantBaseline="central" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none">10</text>
          </RotateCw>
        </button>
        <button className="fp-t" onClick={next} disabled={!hasQueue} aria-label="次の曲">
          <SkipForward size={26} fill="currentColor" strokeWidth={2} />
        </button>
      </div>

      <div className="fp-rates">
        {RATES.map((r) => (
          <button
            key={r}
            className={`fp-rate ${rate === r ? "on" : ""}`}
            onClick={() => setRate(r)}
            aria-pressed={rate === r}
          >
            ×{r.toFixed(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
