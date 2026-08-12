"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
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
    <div className="statusset">
      {([0, 1, 2, 3] as const).map((v) => {
        const active = s === v;
        return (
          <button
            key={v}
            className={`chip${active ? " on" : ""}`}
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
        className={`chip${star ? " on" : ""}`}
        onClick={() => {
          const nv = !star;
          setStar(nv);
          start(() => toggleCalledOften(id, nv));
        }}
      >
        <Star size={13} strokeWidth={2} fill={star ? "currentColor" : "none"} /> 頻出
      </button>
    </div>
  );
}
