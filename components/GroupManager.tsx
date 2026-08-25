"use client";

import Link from "next/link";
import { useState } from "react";
import { Target } from "lucide-react";
import { createGroup, deleteGroup } from "@/lib/local/mutations";

type G = { id: string; name: string; description: string | null; count: number };

export default function GroupManager({ groups }: { groups: G[] }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function add() {
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", description);
    await createGroup(fd);
    setName("");
    setDescription("");
   
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-3">
        <label className="label">新しいグループ</label>
        <input className="input mb-2" placeholder="名前（例: リズムチェンジ族 / 学習中バラード）" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input mb-2" placeholder="説明（任意）" value={description} onChange={(e) => setDescription(e.target.value)} />
        <button className="btn btn-accent w-full" onClick={add}>グループを作成</button>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          まだグループがありません。似た進行の曲や、集中的に練習したい曲をまとめると、ドリルで曲群を指定できます。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id} className="card flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="font-semibold">{g.name} <span className="text-xs" style={{ color: "var(--muted)" }}>({g.count})</span></div>
                {g.description && <div className="truncate text-xs" style={{ color: "var(--muted)" }}>{g.description}</div>}
              </div>
              <div className="flex items-center gap-2">
                {g.count > 0 && (
                  <Link
                    href={`/drill?group=${encodeURIComponent(g.name)}`}
                    className="btn btn-ghost text-xs"
                    title="この群をドリル"
                  >
                    <Target size={14} strokeWidth={2} /> ドリル
                  </Link>
                )}
                <button
                  className="btn btn-ghost btn-danger text-xs"
                  onClick={async () => {
                    if (confirm(`グループ「${g.name}」を削除しますか？（曲は消えません）`)) {
                      await deleteGroup(g.id);
                     
                    }
                  }}
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
