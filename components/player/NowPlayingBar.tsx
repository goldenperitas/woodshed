"use client";

import ViewLink from "@/components/ViewLink";
import { useEffect } from "react";
import { Play, Pause, X, Disc3 } from "lucide-react";
import { usePlayer } from "./PlayerProvider";

// Global "now playing" bar. Visible on every page whenever a track is loaded,
// so playback can be seen and stopped from anywhere.
export default function NowPlayingBar() {
  const { track, playing, pos, dur, toggle, stop } = usePlayer();

  // Reserve space at the bottom so the fixed bar never hides page content.
  useEffect(() => {
    document.body.classList.toggle("has-player", !!track);
    return () => document.body.classList.remove("has-player");
  }, [track]);

  if (!track) return null;

  const pct = dur ? (pos / dur) * 100 : 0;

  return (
    <div className="nowbar" style={{ ["--accent" as string]: track.accent ?? "var(--orange)" }}>
      <div className="nowbar-fill" style={{ width: `${pct}%` }} />
      <Disc3 className={`nowbar-disc ${playing ? "spin" : ""}`} size={26} strokeWidth={1.75} />
      <ViewLink href={track.href ?? "/"} className="nowbar-meta">
        <span className="t">{track.title}</span>
        {track.subtitle && <span className="s">{track.subtitle}</span>}
      </ViewLink>
      <button className="nowbar-btn" onClick={toggle} aria-label={playing ? "一時停止" : "再生"}>
        {playing ? <Pause size={20} fill="currentColor" strokeWidth={0} /> : <Play size={20} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}
      </button>
      <button className="nowbar-btn ghost" onClick={stop} aria-label="停止">
        <X size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
