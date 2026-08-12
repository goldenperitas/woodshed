import { listAllTakes } from "@/lib/db/queries";
import ListeningRoom from "@/components/ListeningRoom";

export const dynamic = "force-dynamic";

export default function ListeningPage() {
  const takes = listAllTakes();
  return <ListeningRoom takes={takes} />;
}
