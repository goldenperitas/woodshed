import { getDrillDeck } from "@/lib/db/queries";
import DrillRoom from "@/components/DrillRoom";

export const dynamic = "force-dynamic";

export default async function DrillPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { group } = await searchParams;
  const deck = getDrillDeck();
  return <DrillRoom deck={deck} initialGroup={group ?? null} />;
}
