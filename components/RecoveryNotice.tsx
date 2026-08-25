"use client";

import { useEffect, useState } from "react";
import { recoveredAt, clearRecovered } from "@/lib/local/db";
import ViewLink from "./ViewLink";

// Says out loud when this device rebuilt itself from the Mac.
//
// The rebuild is silent on purpose — the shelf is simply there again, which is
// what anyone would want. But the audio copies did not come back with it, and
// nobody is going to notice that until they are somewhere with no signal and a
// take will not play. So it gets said while there is still a network to fix it
// over.
export default function RecoveryNotice() {
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setAt(recoveredAt()), 1500);
    return () => window.clearTimeout(id);
  }, []);

  if (!at) return null;

  return (
    <div
      className="wrap"
      style={{ paddingTop: 10, paddingBottom: 0 }}
      role="status"
    >
      <div
        className="card p-3 text-xs"
        style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
      >
        <span>
          この端末のデータが消えていたので、Macから取り直しました。
          <strong>音源は入れ直しが必要です。</strong>
        </span>
        <ViewLink href="/debug" className="btn" style={{ marginLeft: "auto" }}>
          音源を入れ直す
        </ViewLink>
        <button
          className="btn btn-ghost"
          onClick={() => {
            clearRecovered();
            setAt(null);
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
