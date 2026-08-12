import { listGroupsWithCounts } from "@/lib/db/queries";
import GroupManager from "@/components/GroupManager";

export const dynamic = "force-dynamic";

export default function GroupsPage() {
  const groups = listGroupsWithCounts();
  return (
    <div className="pb-8">
      <header className="mb-4">
        <h1 className="text-xl font-bold">グループ</h1>
        <p className="text-xs" style={{ color: "var(--muted)" }}>似た曲をまとめて、ドリルの対象にできます</p>
      </header>
      <GroupManager groups={groups} />
    </div>
  );
}
