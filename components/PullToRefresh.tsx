"use client";

import { useEffect, useRef } from "react";

// Custom pull-to-refresh for the installed PWA (standalone display), where
// Safari's native pull-to-refresh is unavailable. Pulling down from the very
// top drags the app shell, reveals a spinner, and on release past the
// threshold reloads the page (fresh data + code, offline-safe via the SW).
export default function PullToRefresh() {
  const barRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return; // browser tabs already have native pull-to-refresh

    const THRESHOLD = 72;
    const MAX = 130;
    const DAMP = 0.5;

    const shell = document.querySelector<HTMLElement>(".app-shell");
    const bar = barRef.current;
    const spin = spinRef.current;
    if (!shell || !bar || !spin) return;

    let startY = 0;
    let active = false;
    let dist = 0;
    let refreshing = false;

    const atTop = () =>
      window.scrollY <= 0 && (document.scrollingElement?.scrollTop ?? 0) <= 0;

    const draw = (d: number) => {
      const ready = d >= THRESHOLD;
      shell.style.transform = d > 0 ? `translateY(${d}px)` : "";
      bar.style.opacity = String(Math.min(1, d / 44));
      bar.style.transform = `translateX(-50%) translateY(${d * 0.4}px) scale(${Math.min(1, 0.6 + d / 120)})`;
      spin.style.transform = `rotate(${d * 2.4}deg)`;
      spin.classList.toggle("ready", ready);
    };

    const reset = (animate: boolean) => {
      shell.style.transition = animate ? "transform .3s cubic-bezier(.3,.7,.3,1)" : "none";
      shell.style.transform = "";
      shell.style.willChange = "";
      bar.style.opacity = "0";
      bar.style.transform = "translateX(-50%)";
      spin.style.transform = "";
      spin.classList.remove("ready");
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing || !atTop()) {
        active = false;
        return;
      }
      startY = e.touches[0].clientY;
      active = true;
      dist = 0;
      shell.style.transition = "none";
      shell.style.willChange = "transform";
    };

    const onMove = (e: TouchEvent) => {
      if (!active || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || !atTop()) {
        active = false;
        reset(true);
        return;
      }
      dist = Math.min(MAX, dy * DAMP);
      draw(dist);
      if (dy > 4 && e.cancelable) e.preventDefault(); // own the gesture, stop bounce
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      if (dist >= THRESHOLD && !refreshing) {
        refreshing = true;
        // spring the shell back, keep the spinner running as an overlay,
        // then do a full reload (fresh data + code, offline-safe via the SW).
        shell.style.transition = "transform .3s cubic-bezier(.3,.7,.3,1)";
        shell.style.transform = "";
        bar.style.opacity = "1";
        bar.style.transform = "translateX(-50%)";
        spin.style.transform = "";
        bar.classList.add("spinning");
        window.setTimeout(() => window.location.reload(), 320);
      } else {
        reset(true);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      shell.style.transform = "";
      shell.style.transition = "";
    };
  }, []);

  return (
    <div ref={barRef} className="ptr-bar" aria-hidden="true">
      <div ref={spinRef} className="ptr-spin" />
    </div>
  );
}
