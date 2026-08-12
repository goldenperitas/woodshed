"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Group } from "@/lib/db/schema";
import { setStandardGroup } from "@/app/actions";

export default function GroupsSection({
  standardId,
  allGroups,
  memberIds,
}: {
  standardId: number;
  allGroups: Group[];
  memberIds: number[];
}) {
  const [members, setMembers] = useState<Set<number>>(new Set(memberIds));
  const [, start] = useTransition();

  function toggle(gid: number) {
    const next = new Set(members);
    const isMember = next.has(gid);
    if (isMember) next.delete(gid);
    else next.add(gid);
    setMembers(next);
    start(() => setStandardGroup(standardId, gid, !isMember));
  }

  if (allGroups.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        グループがありません。<Link href="/groups" style={{ color: "var(--accent2)" }}>グループを作成</Link>すると、似た曲をまとめてドリルできます。
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {allGroups.map((g) => {
        const active = members.has(g.id);
        return (
          <button
            key={g.id}
            className="chip"
            style={{
              cursor: "pointer",
              color: active ? "#0b0f14" : "var(--accent2)",
              background: active ? "var(--accent2)" : "transparent",
              borderColor: "var(--accent2)",
              fontWeight: active ? 700 : 400,
            }}
            onClick={() => toggle(g.id)}
          >
            {active ? "✓ " : "＋ "}{g.name}
          </button>
        );
      })}
      <Link href="/groups" className="chip" style={{ color: "var(--muted)" }}>
        ⚙ 管理
      </Link>
    </div>
  );
}
