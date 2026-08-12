"use client";

import { useEffect, useRef, useState } from "react";

// A textarea that debounce-saves to a targeted server action.
export default function AutoSaveText({
  initial,
  placeholder,
  onSave,
  minHeight = 120,
}: {
  initial: string;
  placeholder?: string;
  onSave: (text: string) => Promise<void>;
  minHeight?: number;
}) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial);

  useEffect(() => {
    setValue(initial);
    lastSaved.current = initial;
  }, [initial]);

  function schedule(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(next), 700);
  }

  async function flush(next: string) {
    if (next === lastSaved.current) return;
    setState("saving");
    await onSave(next);
    lastSaved.current = next;
    setState("saved");
    setTimeout(() => setState("idle"), 1200);
  }

  return (
    <div>
      <textarea
        className="textarea"
        style={{ minHeight }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => schedule(e.target.value)}
        onBlur={() => flush(value)}
      />
      <div className="mt-1 h-4 text-right text-xs" style={{ color: "var(--muted)" }}>
        {state === "saving" ? "保存中…" : state === "saved" ? "✓ 保存済み" : ""}
      </div>
    </div>
  );
}
