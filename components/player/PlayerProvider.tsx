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

/**
 * One entry of the playing queue. The src is resolved lazily (offline blob or
 * server path) so a long queue costs nothing until a track is actually needed.
 * `resolve` returns null when the bytes live on some other device.
 */
export type QueueItem = { id: string; resolve: () => Promise<PlayerTrack | null> };

type Loop = { s: number; e: number } | null;

type Ctx = {
  track: PlayerTrack | null;
  playing: boolean;
  pos: number;
  dur: number;
  rate: number;
  loop: Loop;
  /** True when the current track sits in a queue with somewhere to skip to. */
  hasQueue: boolean;
  isCurrent: (id: string) => boolean;
  load: (t: PlayerTrack, opts?: { autoplay?: boolean; loop?: Loop; rate?: number; repeat?: boolean }) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  /** Seek relative to where playback is right now (podcast-style ±10s). */
  nudge: (delta: number) => void;
  next: () => void;
  prev: () => void;
  setQueue: (items: QueueItem[]) => void;
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
  const [queue, setQueueState] = useState<QueueItem[]>([]);

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
    setQueueState([]);
  }, []);
  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setPos(a.currentTime);
  }, []);
  const nudge = useCallback((delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    const end = Number.isFinite(a.duration) ? a.duration : Infinity;
    a.currentTime = Math.min(Math.max(0, a.currentTime + delta), end);
    setPos(a.currentTime);
  }, []);
  const setRate = useCallback((r: number) => setRateState(r), []);
  const setLoop = useCallback((l: Loop) => setLoopState(l), []);
  const setRepeat = useCallback((r: boolean) => { const a = audioRef.current; if (a) a.loop = r; }, []);
  const isCurrent = useCallback((id: string) => track?.id === id, [track]);
  const setQueue = useCallback((items: QueueItem[]) => setQueueState(items), []);

  // ---- queue skipping ----
  // Read through refs so the handlers stay stable enough for the Media Session
  // (lock screen / car) bindings, which are registered once.
  const queueRef = useRef(queue);
  const trackRef = useRef(track);
  const posRef = useRef(pos);
  useEffect(() => { queueRef.current = queue; trackRef.current = track; posRef.current = pos; });

  const skip = useCallback(async (delta: 1 | -1) => {
    const q = queueRef.current;
    const cur = trackRef.current?.id;
    const i = cur ? q.findIndex((x) => x.id === cur) : -1;
    if (i < 0 || q.length < 2) return;
    // Takes whose bytes live on another device are stepped over, not stalled on.
    for (let n = 1; n <= q.length; n++) {
      const item = q[(((i + delta * n) % q.length) + q.length) % q.length];
      const t = await item.resolve();
      if (t) { load(t, { autoplay: true }); return; }
    }
  }, [load]);

  const next = useCallback(() => { void skip(1); }, [skip]);
  // Podcast convention: a few seconds in, "previous" means "start this over".
  const prev = useCallback(() => {
    if (posRef.current > 3) { seek(0); play(); return; }
    void skip(-1);
  }, [skip, seek, play]);

  const hasQueue = queue.length > 1 && !!track && queue.some((x) => x.id === track.id);

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
    set("nexttrack", () => next());
    set("previoustrack", () => prev());
    return () => {
      (["play", "pause", "seekto", "seekbackward", "seekforward", "nexttrack", "previoustrack"] as MediaSessionAction[])
        .forEach((a) => { try { ms.setActionHandler(a, null); } catch { /* ignore */ } });
    };
  }, [next, prev]);

  const value: Ctx = {
    track, playing, pos, dur, rate, loop, hasQueue,
    isCurrent, load, toggle, play, pause, stop, seek, nudge, next, prev,
    setQueue, setRate, setLoop, setRepeat,
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
        onEnded={() => { setPlaying(false); void skip(1); }}
      />
      <NowPlayingBar />
    </PlayerCtx.Provider>
  );
}
