import { listStandards } from "@/lib/db/queries";
import Wall from "@/components/Wall";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const items = listStandards();
  return <Wall items={items} />;
}
