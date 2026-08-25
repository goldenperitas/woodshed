"use client";

import ListeningRoom from "@/components/ListeningRoom";
import Booting from "@/components/Booting";
import LocalError from "@/components/LocalError";
import { useLocalQuery } from "@/lib/local/store";
import { listAllTakes } from "@/lib/local/queries";

export default function Listening() {
  const { data, loading, error } = useLocalQuery(() => listAllTakes());
  if (error) return <LocalError error={error} />;
  if (loading || !data) return <Booting label="レコードを並べています" />;
  return <ListeningRoom takes={data} />;
}
