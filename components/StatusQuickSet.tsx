"use client";

import { useState, useTransition } from "react";
import { STATUS } from "@/lib/constants";
import { setStatus, toggleCalledOften } from "@/app/actions";

export default function StatusQuickSet({
  id,
  status,
  calledOften,
}: {
  id: number;
  status: number;
  calledOften: boolean;
}) {
  const [s, setS] = useState(status);
  const [star, setStar] = useState(calledOften);
  const [, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {([1, 2, 3] as const).map((v) => {
        const active = s === v;
        return (
          <button
            key={v}
            className="chip"
            style={{
              cursor: "pointer",
              color: active ? "#0b0f14" : STATUS[v].color,
              background: active ? STATUS[v].color : "transparent",
              borderColor: STATUS[v].color,
              fontWeight: active ? 700 : 400,
            }}
            onClick={() => {
              setS(v);
              start(() => setStatus(id, v));
            }}
          >
            {STATUS[v].short} {STATUS[v].label}
          </button>
        );
      })}
      <button
        className="chip"
        style={{
          cursor: "pointer",
          color: star ? "#0b0f14" : "var(--accent)",
          background: star ? "var(--accent)" : "transparent",
          borderColor: "var(--accent)",
          fontWeight: star ? 700 : 400,
        }}
        onClick={() => {
          const nv = !star;
          setStar(nv);
          start(() => toggleCalledOften(id, nv));
        }}
      >
        ★ 頻出
      </button>
    </div>
  );
}
