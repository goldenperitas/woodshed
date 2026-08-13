"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Target, Library, Plus, Search, Radio } from "lucide-react";
import type { StandardListItem } from "@/lib/db/queries";
import Sleeve from "./Sleeve";
import RandomQuote from "./RandomQuote";

const VIEW_KEY = "wall.view";
// Fires before paint on the client so restored filters/scroll never flash.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function Wall({ items }: { items: StandardListItem[] }) {
  const [q, setQ] = useState("");
  // Compound filtering: 頻出 is an AND constraint, statuses are OR'd together.
  const [often, setOften] = useState(false);
  const [statuses, setStatuses] = useState<number[]>([]);
  const [ready, setReady] = useState(false); // true once a saved view is restored

  // Restore the last filters when returning to the wall (same tab session).
  useIsoLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(VIEW_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v.q === "string") setQ(v.q);
        if (typeof v.often === "boolean") setOften(v.often);
        if (Array.isArray(v.statuses)) setStatuses(v.statuses.filter((n: unknown) => typeof n === "number"));
      }
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  // Restore scroll after the filtered grid is committed (still before paint).
  useIsoLayoutEffect(() => {
    if (!ready) return;
    try {
      const raw = sessionStorage.getItem(VIEW_KEY);
      const y = raw ? JSON.parse(raw).scrollY : 0;
      if (typeof y === "number" && y > 0) window.scrollTo(0, y);
    } catch { /* ignore */ }
  }, [ready]);

  const writeView = useCallback(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify({ q, often, statuses, scrollY: window.scrollY }));
    } catch { /* ignore */ }
  }, [q, often, statuses]);

  // Persist filters on change and keep scroll position fresh (throttled with a
  // trailing timer — fires even when the tab/pane is backgrounded, unlike rAF).
  useEffect(() => {
    if (!ready) return;
    writeView();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => { writeView(); timer = null; }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", writeView);
    document.addEventListener("visibilitychange", writeView);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", writeView);
      document.removeEventListener("visibilitychange", writeView);
    };
  }, [ready, writeView]);

  const toggleStatus = (n: number) =>
    setStatuses((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
  const clearFilters = () => { setOften(false); setStatuses([]); };
  const allOn = !often && statuses.length === 0;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (often && it.calledOften !== 1) return false;
      if (statuses.length > 0 && !statuses.includes(it.status)) return false;
      if (needle) {
        const hay = `${it.title} ${it.composer ?? ""} ${it.key ?? ""} ${it.form ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, often, statuses]);

  return (
    <div className="wrap">
      <header className="wall-head">
        <div className="wall-top">
          <div className="eyebrow">Woodshed</div>
          <div className="wall-actions">
            <Link href="/listening" className="btn" title="Listening Room" aria-label="Listening Room"><Radio size={18} strokeWidth={2} /></Link>
            <Link href="/drill" className="btn" title="ドリル" aria-label="ドリル"><Target size={18} strokeWidth={2} /></Link>
            <Link href="/groups" className="btn" title="グループ" aria-label="グループ"><Library size={18} strokeWidth={2} /></Link>
            <Link href="/standards/new" className="btn btn-accent" title="曲を追加" aria-label="曲を追加"><Plus size={18} strokeWidth={2.5} /></Link>
          </div>
        </div>

        <RandomQuote />
        <div className="count"><b>{shown.length}</b> 曲{allOn && !q.trim() ? "" : ` / ${items.length}`}</div>

        <label className="search"><Search size={16} strokeWidth={2} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
          <input placeholder="検索" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>

        <div className="tabs">
          <button className={`tab ${allOn ? "on" : ""}`} onClick={clearFilters}>すべて</button>
          <button className={`tab ${often ? "on" : ""}`} onClick={() => setOften((v) => !v)}>頻出</button>
          {[0, 1, 2, 3].map((s) => (
            <button key={s} className={`tab mono ${statuses.includes(s) ? "on" : ""}`} onClick={() => toggleStatus(s)}>S{s}</button>
          ))}
        </div>
      </header>

      {shown.length === 0 ? (
        <div className="empty">
          {items.length === 0 ? "棚は空。右上の＋から最初の一枚を。" : "条件に合う曲がありません。"}
        </div>
      ) : (
        <div className="grid">
          {shown.map((it, i) => (
            <Link key={it.id} href={`/standards/${it.id}`}>
              <Sleeve s={it} index={i} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
