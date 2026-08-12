"use client";

import { useEffect, useState } from "react";
import { QUOTES } from "@/lib/quotes";

// Shows a random jazz/woodshedding quote. Server renders index 0 (stable for
// hydration); on mount we swap to a random one. Tapping rerolls to a different
// quote.
export default function RandomQuote() {
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setI(Math.floor(Math.random() * QUOTES.length));
  }, []);

  const reroll = () =>
    setI((p) => (p + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length);

  const q = QUOTES[i];

  return (
    <button
      type="button"
      className="wall-quote"
      onClick={reroll}
      title="タップで別の名言"
      aria-label="別の名言を表示"
      style={{ opacity: mounted ? 1 : 0 }}
    >
      <span className="q">{q.text}</span>
      <span className="by">— {q.by}</span>
    </button>
  );
}
