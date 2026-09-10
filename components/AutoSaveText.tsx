"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

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
  // What the effects and the async save need to read at their own timing,
  // rather than through a closure captured at render.
  const valueRef = useRef(initial);
  const dirty = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    // A save notifies the store, which re-queries and hands us `initial`
    // again — by then the typist is already a few keystrokes further along.
    // Adopting that value would delete those keystrokes and throw the caret
    // to the end, so outside text is only taken while nothing of ours is in
    // flight and it actually differs from what we last wrote.
    if (dirty.current || initial === lastSaved.current) return;
    lastSaved.current = initial;
    valueRef.current = initial;
    setValue(initial);
  }, [initial]);

  // Leaving the page mid-debounce would otherwise drop the last edit.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current && valueRef.current !== lastSaved.current) {
        void onSaveRef.current(valueRef.current);
      }
    };
  }, []);

  function schedule(next: string) {
    setValue(next);
    valueRef.current = next;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(next), 700);
  }

  async function flush(next: string) {
    if (timer.current) clearTimeout(timer.current);
    if (next === lastSaved.current) {
      if (valueRef.current === next) dirty.current = false;
      return;
    }
    setState("saving");
    await onSave(next);
    lastSaved.current = next;
    // Still dirty if more was typed while the save ran — the next debounce
    // picks that up, and until then no incoming `initial` may win.
    if (valueRef.current === next) dirty.current = false;
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
        onBlur={() => flush(valueRef.current)}
      />
      <div className="mt-1 h-4 text-right text-xs" style={{ color: "var(--muted)", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
        {state === "saving" ? "保存中…" : state === "saved" ? <><Check size={12} strokeWidth={2.5} /> 保存済み</> : ""}
      </div>
    </div>
  );
}
