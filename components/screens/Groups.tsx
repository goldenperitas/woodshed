"use client";

import ViewLink from "@/components/ViewLink";
import { ArrowLeft } from "lucide-react";
import GroupManager from "@/components/GroupManager";
import Booting from "@/components/Booting";
import { useLocalQuery } from "@/lib/local/store";
import { listGroupsWithCounts } from "@/lib/local/queries";

export default function Groups() {
  const { data, loading } = useLocalQuery(() => listGroupsWithCounts());
  return (
    <div className="wrap pb-8">
      <div className="mb-4 flex items-center gap-3">
        <ViewLink href="/" className="back"><ArrowLeft size={15} strokeWidth={2} /> 戻る</ViewLink>
      </div>
      <header className="mb-4">
        <h1 className="text-xl font-bold">グループ</h1>
        <p className="text-xs" style={{ color: "var(--muted)" }}>似た曲をまとめて、ドリルの対象にできます</p>
      </header>
      {loading || !data ? <Booting label="読み込み中" /> : <GroupManager groups={data} />}
    </div>
  );
}
