"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Target, Library, Plus, Search } from "lucide-react";
import type { StandardListItem } from "@/lib/db/queries";
import Sleeve from "./Sleeve";
import RandomQuote from "./RandomQuote";

export default function Wall({ items }: { items: StandardListItem[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string | null>(null); // "often" | "1" | "2" | "3" | null

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "often" && it.calledOften !== 1) return false;
      if (filter === "1" || filter === "2" || filter === "3") {
        if (it.status !== Number(filter)) return false;
      }
      if (needle) {
        const hay = `${it.title} ${it.composer ?? ""} ${it.key ?? ""} ${it.form ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, filter]);

  return (
    <div className="wrap">
      <header className="wall-head">
        <div className="wall-top">
          <div className="eyebrow">Collection · Woodshed</div>
          <div className="wall-actions">
            <Link href="/drill" className="btn" title="ドリル" aria-label="ドリル"><Target size={18} strokeWidth={2} /></Link>
            <Link href="/groups" className="btn" title="グループ" aria-label="グループ"><Library size={18} strokeWidth={2} /></Link>
            <Link href="/standards/new" className="btn btn-accent" title="曲を追加" aria-label="曲を追加"><Plus size={18} strokeWidth={2.5} /></Link>
          </div>
        </div>

        <RandomQuote />
        <div className="count"><b>{items.length}</b> 曲</div>

        <label className="search"><Search size={16} strokeWidth={2} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
          <input placeholder="検索" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>

        <div className="tabs">
          <button className={`tab ${filter === null ? "on" : ""}`} onClick={() => setFilter(null)}>すべて</button>
          <button className={`tab ${filter === "often" ? "on" : ""}`} onClick={() => setFilter(filter === "often" ? null : "often")}>頻出</button>
          {["1", "2", "3"].map((s) => (
            <button key={s} className={`tab mono ${filter === s ? "on" : ""}`} onClick={() => setFilter(filter === s ? null : s)}>S{s}</button>
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
