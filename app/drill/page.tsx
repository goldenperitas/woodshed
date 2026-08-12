import { getDrillDeck } from "@/lib/db/queries";
import DrillRoom from "@/components/DrillRoom";

export const dynamic = "force-dynamic";

export default function DrillPage() {
  const deck = getDrillDeck();
  return <DrillRoom deck={deck} />;
}
