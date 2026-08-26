"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Pause, Shuffle, ChevronDown } from "lucide-react";
import AppHeader, { BackArrow } from "@/components/AppHeader";
import type { ListeningTake } from "@/lib/local/queries";
import { STATUS } from "@/lib/constants";
import { accentFor } from "@/lib/sleeve";
import { fmtTime } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/offline";
import { useMediaUrl } from "@/lib/local/media";
import { usePlayer, type PlayerTrack } from "@/components/player/PlayerProvider";
import Scrubber from "@/components/player/Scrubber";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function resolveSrc(filePath: string): Promise<string | null> {
  return resolveMediaUrl(filePath);
}

const takeName = (t: ListeningTake) =>
  [t.performer || t.originalName || "無名の録音", t.year].filter(Boolean).join(" · ");

// Take -> track, with the src resolved on demand. Kept out of the component so
// the queue handed to the player outlives this page (playback keeps going, and
// keeps skipping, after navigating away).
async function trackFor(t: ListeningTake, pre?: string | null): Promise<PlayerTrack | null> {
  const src = pre ?? (await resolveSrc(t.filePath));
  if (!src) return null;
  return {
    id: t.filePath, src,
    title: t.title,
    subtitle: takeName(t),
    accent: accentFor(t.title),
    artworkPath: t.artworkPath,
    href: `/standards/${t.standardId}`,
  };
}

export default function ListeningRoom({ takes }: { takes: ListeningTake[] }) {
  const player = usePlayer();

  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allGroups = useMemo(
    () => [...new Set(takes.flatMap((t) => t.groupNames))].sort(),
    [takes],
  );

  const filtered = useMemo(
    () => takes.filter((t) =>
      (statusFilter === null || t.status === statusFilter) &&
      (groupFilter === null || t.groupNames.includes(groupFilter)),
    ),
    [takes, statusFilter, groupFilter],
  );

  // Identity order on the server; shuffle on mount + whenever the filter changes.
  const [queue, setQueue] = useState<ListeningTake[]>(() => takes);
  useEffect(() => { setQueue(shuffle(filtered)); }, [filtered]);

  const activeIdx = queue.findIndex((t) => player.isCurrent(t.filePath));
  const idle = activeIdx < 0;
  const display: ListeningTake | undefined = idle ? queue[0] : queue[activeIdx];
  const accent = display ? accentFor(display.title) : "#E1541B";
  const displayArt = useMediaUrl(display?.artworkPath);

  const playItem = useCallback(async (item: ListeningTake, pre?: string | null) => {
    // A take's row syncs to every device; its bytes do not. Say so rather
    // than handing the player a src it cannot load.
    const t = await trackFor(item, pre);
    if (!t) {
      setNotice(`「${item.title}」の音源はこの端末にありません`);
      return;
    }
    setNotice(null);
    player.load(
      { ...t, artworkUrl: item.artworkPath === display?.artworkPath ? displayArt : null },
      { autoplay: true },
    );
  }, [player, display?.artworkPath, displayArt]);

  // Pre-resolve the top track's src while idle so the big play button is
  // gesture-safe (iOS needs play() inside the tap for the first playback).
  const [topSrc, setTopSrc] = useState<string | null>(null);
  const topId = idle ? queue[0]?.filePath : undefined;
  useEffect(() => {
    let alive = true;
    if (!topId) { setTopSrc(null); return; }
    resolveSrc(topId).then((s) => { if (alive) setTopSrc(s); });
    return () => { alive = false; };
  }, [topId]);

  // Hand the queue to the player, which plays it through and serves the
  // prev/next buttons — in the full-screen player and on the lock screen.
  const registerQueue = player.setQueue;
  useEffect(() => {
    registerQueue(queue.map((t) => ({ id: t.filePath, resolve: () => trackFor(t) })));
  }, [queue, registerQueue]);

  const playing = !idle && player.playing;
  const pos = idle ? 0 : player.pos;
  const dur = idle ? display?.durationSec ?? 0 : player.dur || display?.durationSec || 0;
  const armAngle = playing && dur ? -12 + (pos / dur) * 18 : -34;

  const bigPlay = () => {
    if (!queue.length) return;
    if (!idle) player.toggle();
    else playItem(queue[0], topSrc ?? undefined);
  };

  return (
    <div className="room-ground" style={{ ["--accent" as string]: accent } as React.CSSProperties}>
      <div className="room">
        <AppHeader left={<BackArrow label="棚に戻る" />} title={<span className="eyebrow">Listening Room</span>} />

        {takes.length === 0 ? (
          <div className="empty" style={{ marginTop: 40 }}>
            まだ音源がありません。曲に音源を追加すると、ここで全部通し聴きできます。
          </div>
        ) : (
          <>
            {/* turntable */}
            <div className="stage">
              <div className="turntable">
                <div className={`disc ${playing ? "spinning" : ""}`} style={{ ["--spin" as string]: "1.8s" }}>
                  <div className="disc-label">
                    {displayArt
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={displayArt} alt="" />
                      : <span className="lt">{display?.title.split(" ").slice(0, 2).join(" ")}</span>}
                  </div>
                </div>
                <div className="hole" />
                <div className="sheen" />
                <div className="tonearm" style={{ ["--arm" as string]: `${armAngle}deg` }}>
                  <div className="bar2" /><div className="pivot" /><div className="head" />
                </div>
              </div>
            </div>

            <div className="meta">
              <h1>{display?.title}</h1>
              <div className="liner">{display ? takeName(display) : ""}</div>
            </div>

            {/* transport */}
            <div className="transport">
              <button className="play" onClick={bigPlay} aria-label={playing ? "一時停止" : "再生"}>
                {playing ? <Pause size={22} fill="currentColor" strokeWidth={0} /> : <Play size={22} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}
              </button>
              <Scrubber
                className="pbar-wrap"
                pos={pos} dur={dur} times
                disabled={idle}
                onSeek={(t) => player.seek(t)}
              />
              <button className="btn" onClick={() => setQueue(shuffle(filtered))} title="シャッフル" aria-label="シャッフル"><Shuffle size={16} strokeWidth={2} /></button>
            </div>

            {/* filters */}
            <div className="blabel" style={{ marginTop: 20 }}><span className="l">絞り込み</span></div>
            <div className="chips">
              <button className={`chip ${statusFilter === null ? "on" : ""}`} onClick={() => setStatusFilter(null)}>すべて</button>
              {([0, 1, 2, 3] as const).map((s) => (
                <button key={s} className={`chip ${statusFilter === s ? "on" : ""}`} onClick={() => setStatusFilter(statusFilter === s ? null : s)}>{STATUS[s].short}</button>
              ))}
            </div>
            {allGroups.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                <button className={`chip ${groupFilter === null ? "on" : ""}`} onClick={() => setGroupFilter(null)}>全グループ</button>
                {allGroups.map((g) => (
                  <button key={g} className={`chip ${groupFilter === g ? "on" : ""}`} onClick={() => setGroupFilter(groupFilter === g ? null : g)}>{g}</button>
                ))}
              </div>
            )}

            {/* queue */}
            <div className="blabel" style={{ marginTop: 20 }}>
              <span className="l">再生キュー</span>
              <span className="v">{queue.length} takes</span>
            </div>
            {notice && (
              <p className="text-xs" style={{ color: "var(--muted)", padding: "0 6px 6px" }}>{notice}</p>
            )}
            {queue.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)", padding: "8px 6px" }}>この条件のテイクはありません。</p>
            ) : (
              <div className="lr-list">
                {queue.map((t, pos2) => {
                  const now = player.isCurrent(t.filePath);
                  const open = openId === t.takeId;
                  return (
                    <div key={t.takeId} className={`lr-item ${now ? "now" : ""}`}>
                      <div className="lr-row" onClick={() => setOpenId(open ? null : t.takeId)}>
                        <button className="lr-play" onClick={(e) => { e.stopPropagation(); playItem(t); }} aria-label="このテイクを再生">
                          {now && player.playing ? <span className="eq"><i /><i /><i /></span> : <span className="n">{String(pos2 + 1).padStart(2, "0")}</span>}
                        </button>
                        <div className="lr-main">
                          <span className="lr-title">{t.title}</span>
                          <span className="lr-take">{takeName(t)}</span>
                        </div>
                        <span className="lr-dur">{t.durationSec ? fmtTime(t.durationSec) : "—"}</span>
                        <ChevronDown className={`lr-chev ${open ? "open" : ""}`} size={16} strokeWidth={2} />
                      </div>
                      {open && (
                        <div className="lr-detail">
                          <div className="kv">
                            <span>KEY {t.key || "—"}</span>
                            <span>{STATUS[(t.status as 0 | 1 | 2 | 3)]?.short}</span>
                          </div>
                          {t.chordInterpretation
                            ? <pre className="lr-chords">{t.chordInterpretation}</pre>
                            : <p className="lr-chords" style={{ color: "var(--muted)" }}>コード進行は未記入です。</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
