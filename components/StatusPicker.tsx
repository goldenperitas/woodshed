"use client";

import { useState } from "react";
import { STATUS } from "@/lib/constants";

// In-form status picker for the create screen. Renders the S0–S3 chips (same
// look as the tune page) and carries the choice to the server action through a
// hidden input, so no native <select> overlay is involved.
export default function StatusPicker({
  name = "status",
  defaultValue = 0,
}: {
  name?: string;
  defaultValue?: 0 | 1 | 2 | 3;
}) {
  const [v, setV] = useState<0 | 1 | 2 | 3>(defaultValue);

  return (
    <div>
      <input type="hidden" name={name} value={v} />
      <div className="statusset">
        {([0, 1, 2, 3] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`chip${v === s ? " on" : ""}`}
            onClick={() => setV(s)}
          >
            {STATUS[s].short} {STATUS[s].label}
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)", marginTop: 6 }}>
        {STATUS[v].hint}
      </p>
    </div>
  );
}
