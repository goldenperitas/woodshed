"use client";

import { useState } from "react";
import DrillRoom from "@/components/DrillRoom";
import Booting from "@/components/Booting";
import LocalError from "@/components/LocalError";
import { useLocalQuery } from "@/lib/local/store";
import { getDrillDeck } from "@/lib/local/queries";

export default function Drill() {
  // Read from the address bar rather than useSearchParams: offline, the
  // service worker replays one cached shell for this route, and any query
  // baked into that shell belongs to whenever it was cached.
  const [group] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("group"),
  );

  const { data, loading, error } = useLocalQuery(() => getDrillDeck());
  if (error) return <LocalError error={error} />;
  if (loading || !data) return <Booting label="カードを切っています" />;
  return <DrillRoom deck={data} initialGroup={group} />;
}
