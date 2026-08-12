"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import NowPlayingBar from "./NowPlayingBar";

export type PlayerTrack = {
  id: string; // unique per take — the recording's filePath
  src: string; // object URL (offline blob) or "/path"
  title: string;
  subtitle?: string;
  accent?: string;
  artworkPath?: string | null;
  href?: string; // where the mini-bar links back to
};

type Loop = { s: number; e: number } | null;

type Ctx = {
  track: PlayerTrack | null;
  playing: boolean;
  pos: number;
  dur: number;
  rate: number;
  loop: Loop;
  isCurrent: (id: string) => boolean;
  load: (t: PlayerTrack, opts?: { autoplay?: boolean; loop?: Loop; rate?: number }) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  setRate: (r: number) => void;
  setLoop: (l: Loop) => void;
};

const PlayerCtx = createContext<Ctx | null>(null);

export function usePlayer(): Ctx {
  const c = useContext(PlayerCtx);
  if (!c) throw new Error("usePlayer must be used within <PlayerProvider>");
  return c;
}

// A single <audio> element that lives in the root layout, so playback survives
// client-side navigation. It stops only on explicit stop/pause or when another
// track is loaded.
export default function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRateState] = useState(1);
  const [loop, setLoopState] = useState<Loop>(null);

  // Keep playbackRate + pitch preservation in sync.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = rate;
    const anyA = a as unknown as Record<string, unknown>;
    anyA.preservesPitch = true;
    anyA.webkitPreservesPitch = true;
  }, [rate, track]);

  const load = useCallback<Ctx["load"]>((t, opts = {}) => {
    const a = audioRef.current;
    if (!a) return;
    setTrack(t);
    setLoopState(opts.loop ?? null);
    if (opts.rate != null) setRateState(opts.rate);
    setPos(0);
    setDur(0);
    a.src = t.src;
    a.load();
    if (opts.autoplay !== false) {
      const p = a.play();
      if (p) p.catch(() => {});
    }
  }, []);

  const play = useCallback(() => { audioRef.current?.play().catch(() => {}); }, []);
  const pause = useCallback(() => { audioRef.current?.pause(); }, []);
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);
  const stop = useCallback(() => {
    audioRef.current?.pause();
    setTrack(null);
    setPlaying(false);
    setPos(0);
    setDur(0);
    setLoopState(null);
  }, []);
  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setPos(t);
  }, []);
  const setRate = useCallback((r: number) => setRateState(r), []);
  const setLoop = useCallback((l: Loop) => setLoopState(l), []);
  const isCurrent = useCallback((id: string) => track?.id === id, [track]);

  const onTime = () => {
    const a = audioRef.current;
    if (!a) return;
    if (loop && a.currentTime >= loop.e) a.currentTime = loop.s;
    setPos(a.currentTime);
  };

  const value: Ctx = {
    track, playing, pos, dur, rate, loop,
    isCurrent, load, toggle, play, pause, stop, seek, setRate, setLoop,
  };

  return (
    <PlayerCtx.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d); }}
        onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <NowPlayingBar />
    </PlayerCtx.Provider>
  );
}
