import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listGroupsWithCounts } from "@/lib/db/queries";
import GroupManager from "@/components/GroupManager";

export const dynamic = "force-dynamic";

export default function GroupsPage() {
  const groups = listGroupsWithCounts();
  return (
    <div className="wrap pb-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="btn btn-ghost"><ArrowLeft size={15} strokeWidth={2} /> 戻る</Link>
      </div>
      <header className="mb-4">
        <h1 className="text-xl font-bold">グループ</h1>
        <p className="text-xs" style={{ color: "var(--muted)" }}>似た曲をまとめて、ドリルの対象にできます</p>
      </header>
      <GroupManager groups={groups} />
    </div>
  );
}
