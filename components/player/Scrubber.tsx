"use client";

import { useCallback, useRef, useState } from "react";
import { fmtTime } from "@/lib/format";

// How far the finger has to stray from the bar before scrubbing slows down,
// and by how much. Same idea as the iOS media slider: drag away from the bar
// and the same swipe covers less time, which is the only way to land on a bar
// line in a nine-minute take with a fingertip.
const PRECISION = [
  { within: 26, factor: 1, label: null },
  { within: 70, factor: 1 / 4, label: "1/4" },
  { within: 130, factor: 1 / 12, label: "1/12" },
  { within: Infinity, factor: 1 / 40, label: "1/40" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type Props = {
  pos: number;
  dur: number;
  /** `final` is true on release and on a plain tap — never during a drag. */
  onSeek: (t: number, final: boolean) => void;
  disabled?: boolean;
  /** "hair" is the thin line across the top of the mini bar. */
  variant?: "bar" | "hair";
  /** Off for the mini bar, where a tap means "open the player" instead. */
  tapToSeek?: boolean;
  /** Called instead of seeking when a `tapToSeek: false` bar is tapped, not dragged. */
  onTap?: () => void;
  loop?: { s: number; e: number } | null;
  times?: boolean;
  className?: string;
  ariaLabel?: string;
};

export default function Scrubber({
  pos, dur, onSeek, disabled = false, variant = "bar",
  tapToSeek = true, onTap, loop = null, times = false, className = "", ariaLabel = "再生位置",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // The drag lives in a ref and is only mirrored into state for rendering: a
  // flick can deliver its first move before React has re-rendered, and reading
  // the state there would drop it.
  const drag = useRef({ active: false, value: 0, x: 0, y: 0, factor: 1, moved: false });
  const [view, setView] = useState<{ value: number; label: string | null } | null>(null);
  const lastSent = useRef(0);
  const shownRef = useRef(0);

  const shown = view ? view.value : pos;
  const pct = dur > 0 ? clamp(shown / dur, 0, 1) * 100 : 0;

  const valueAt = useCallback((clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width || !dur) return 0;
    return clamp(((clientX - r.left) / r.width) * dur, 0, dur);
  }, [dur]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dur) return;
    const start = tapToSeek ? valueAt(e.clientX) : pos;
    drag.current = { active: true, value: start, x: e.clientX, y: e.clientY, factor: 1, moved: false };
    shownRef.current = start;
    lastSent.current = 0;
    setView({ value: start, label: null });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no live pointer (tests, odd input) */ }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || disabled) return;
    const dy = Math.abs(e.clientY - d.y);
    const step = PRECISION.find((p) => dy <= p.within) ?? PRECISION[PRECISION.length - 1];
    // Changing gear re-anchors on the spot, so the thumb never jumps when the
    // finger crosses a band.
    if (step.factor !== d.factor) {
      d.x = e.clientX;
      d.factor = step.factor;
      d.value = shownRef.current;
    }
    const width = ref.current?.getBoundingClientRect().width || 1;
    const value = clamp(d.value + ((e.clientX - d.x) / width) * dur * step.factor, 0, dur);
    if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
    shownRef.current = value;
    setView({ value, label: step.label });
    // Audible feedback while dragging, without hammering the audio element.
    const now = performance.now();
    if (now - lastSent.current > 80) { lastSent.current = now; onSeek(value, false); }
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    // A tap that never moved only counts where taps are meant to seek.
    if (tapToSeek || d.moved) onSeek(shownRef.current, true);
    else onTap?.();
    setView(null);
    try { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || !dur) return;
    const step = e.shiftKey ? 1 : 5;
    if (e.key === "ArrowLeft") { e.preventDefault(); onSeek(clamp(pos - step, 0, dur), true); }
    if (e.key === "ArrowRight") { e.preventDefault(); onSeek(clamp(pos + step, 0, dur), true); }
  };

  return (
    <div className={className}>
      <div
        ref={ref}
        className={`scrub ${variant} ${view ? "dragging" : ""} ${disabled ? "disabled" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={Math.round(dur) || 0}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={fmtTime(shown)}
      >
        <div className="scrub-track">
          {loop && dur ? (
            <div className="scrub-loop" style={{ left: `${(loop.s / dur) * 100}%`, width: `${((loop.e - loop.s) / dur) * 100}%` }} />
          ) : null}
          <div className="scrub-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="scrub-thumb" style={{ left: `${pct}%` }} />
        {view?.label && <span className="scrub-rate mono">{view.label} 速</span>}
      </div>
      {times && (
        <div className="scrub-times">
          <span className={view ? "on" : ""}>{fmtTime(shown)}</span>
          <span>{fmtTime(dur)}</span>
        </div>
      )}
    </div>
  );
}
