"use client";

import Wall from "@/components/Wall";
import Booting from "@/components/Booting";
import LocalError from "@/components/LocalError";
import { useLocalQuery } from "@/lib/local/store";
import { listStandards } from "@/lib/local/queries";

export default function HomePage() {
  const { data, loading, error } = useLocalQuery(() => listStandards());
  if (error) return <LocalError error={error} />;
  if (loading || !data) return <Booting />;
  return <Wall items={data} />;
}
