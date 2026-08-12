"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StandardListItem } from "@/lib/db/queries";
import Sleeve from "./Sleeve";

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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div className="eyebrow">Collection · Woodshed</div>
            <div className="sub">叩き込むための棚</div>
            <div className="count"><b>{items.length}</b> 曲</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/drill" className="btn" title="ドリル">◎</Link>
            <Link href="/groups" className="btn" title="グループ">▦</Link>
            <Link href="/standards/new" className="btn btn-accent" title="曲を追加">＋</Link>
          </div>
        </div>

        <label className="search"><span>⌕</span>
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
          {items.length === 0 ? "棚は空。「＋」から最初の一枚を。" : "条件に合う曲がありません。"}
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
