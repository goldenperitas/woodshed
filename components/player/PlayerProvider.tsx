"use client";

import { mediaUrl } from "@/lib/offline";

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
  /** Pre-resolved blob URL when the jacket lives on this device. */
  artworkUrl?: string | null;
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
  endedSignal: number; // bumps each time a track plays to its end (for queues)
  isCurrent: (id: string) => boolean;
  load: (t: PlayerTrack, opts?: { autoplay?: boolean; loop?: Loop; rate?: number; repeat?: boolean }) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  setRate: (r: number) => void;
  setLoop: (l: Loop) => void;
  setRepeat: (repeat: boolean) => void; // native whole-track loop
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
  const [endedSignal, setEndedSignal] = useState(0);

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
    a.loop = !!opts.repeat; // repeat this track (tune page); off for queues
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
  const setRepeat = useCallback((r: boolean) => { const a = audioRef.current; if (a) a.loop = r; }, []);
  const isCurrent = useCallback((id: string) => track?.id === id, [track]);

  const onTime = () => {
    const a = audioRef.current;
    if (!a) return;
    if (loop && a.currentTime >= loop.e) a.currentTime = loop.s;
    setPos(a.currentTime);
    if ("mediaSession" in navigator && Number.isFinite(a.duration) && a.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: a.duration,
          position: Math.min(a.currentTime, a.duration),
          playbackRate: a.playbackRate || 1,
        });
      } catch { /* Safari throws on odd states — ignore */ }
    }
  };

  // ---- iOS/Android lock-screen "Now Playing" (Media Session API) ----
  // Populate title / artist / artwork so the OS shows the tune instead of
  // just the PWA name, and wire the lock-screen transport controls.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!track) { navigator.mediaSession.metadata = null; return; }
    // Device-local jackets are blob URLs; mediaSession accepts them, but only
    // the non-local path can be guessed synchronously, so fall back to the icon.
    const img =
      track.artworkPath && !track.artworkPath.startsWith("local:")
        ? mediaUrl(track.artworkPath)
        : track.artworkUrl ?? "/icon-512.png";
    const type = /\.png$/i.test(img) ? "image/png" : /\.jpe?g$/i.test(img) ? "image/jpeg" : "";
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.subtitle || "Woodshed",
        album: "Woodshed",
        artwork: [
          { src: img, sizes: "512x512", type },
          { src: img, sizes: "256x256", type },
        ],
      });
    } catch { /* ignore */ }
  }, [track]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const el = () => audioRef.current;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try { ms.setActionHandler(a, h); } catch { /* unsupported action */ }
    };
    set("play", () => { el()?.play().catch(() => {}); });
    set("pause", () => { el()?.pause(); });
    set("seekto", (d) => { const a = el(); if (a && d.seekTime != null) { a.currentTime = d.seekTime; setPos(a.currentTime); } });
    set("seekbackward", (d) => { const a = el(); if (a) { a.currentTime = Math.max(0, a.currentTime - (d.seekOffset || 10)); setPos(a.currentTime); } });
    set("seekforward", (d) => { const a = el(); if (a) { a.currentTime = Math.min(a.duration || Infinity, a.currentTime + (d.seekOffset || 10)); setPos(a.currentTime); } });
    return () => {
      (["play", "pause", "seekto", "seekbackward", "seekforward"] as MediaSessionAction[])
        .forEach((a) => { try { ms.setActionHandler(a, null); } catch { /* ignore */ } });
    };
  }, []);

  const value: Ctx = {
    track, playing, pos, dur, rate, loop, endedSignal,
    isCurrent, load, toggle, play, pause, stop, seek, setRate, setLoop, setRepeat,
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
        onEnded={() => { setPlaying(false); setEndedSignal((n) => n + 1); }}
      />
      <NowPlayingBar />
    </PlayerCtx.Provider>
  );
}
