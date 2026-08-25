"use client";

import ViewLink from "@/components/ViewLink";
import { useState, useTransition } from "react";
import { Check, Plus, Settings } from "lucide-react";
import type { Group } from "@/lib/sync/schema";
import { setStandardGroup } from "@/lib/local/mutations";

export default function GroupsSection({
  standardId,
  allGroups,
  memberIds,
}: {
  standardId: string;
  allGroups: Group[];
  memberIds: string[];
}) {
  const [members, setMembers] = useState<Set<string>>(new Set(memberIds));
  const [, start] = useTransition();

  function toggle(gid: string) {
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
        グループがありません。<ViewLink href="/groups" style={{ color: "var(--accent2)" }}>グループを作成</ViewLink>すると、似た曲をまとめてドリルできます。
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
            {active ? <Check size={13} strokeWidth={2.5} /> : <Plus size={13} strokeWidth={2} />}{g.name}
          </button>
        );
      })}
      <ViewLink href="/groups" className="chip" style={{ color: "var(--muted)" }}>
        <Settings size={13} strokeWidth={2} /> 管理
      </ViewLink>
    </div>
  );
}
