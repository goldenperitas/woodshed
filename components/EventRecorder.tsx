"use client";

import { useEffect } from "react";
import { logEvent } from "@/lib/local/log";

// Writes down what happens to this document: that it started at all, how it
// started, what the service worker did for it, and anything that threw.
//
// The point is the first of those. While an offline screen change is a full
// page load, every tap costs a new document and a fresh database open — and
// the only way to see that from a phone is to count the boots afterwards.

type SwLog = { woodshed?: string; ev?: string; d?: Record<string, unknown> };

function navigationType(): string {
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return nav?.type ?? "?";
}

export default function EventRecorder() {
  useEffect(() => {
    logEvent("boot", {
      path: window.location.pathname,
      nav: navigationType(),
      online: navigator.onLine,
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      sw: !!navigator.serviceWorker?.controller,
    });

    const onError = (e: ErrorEvent) =>
      logEvent("error", { msg: e.message, at: `${e.filename}:${e.lineno}` });
    const onRejection = (e: PromiseRejectionEvent) =>
      logEvent("error", { msg: String(e.reason?.message ?? e.reason) });
    const onOnline = () => logEvent("net", { online: true });
    const onOffline = () => logEvent("net", { online: false });
    const onSwMessage = (e: MessageEvent<SwLog>) => {
      if (e.data?.woodshed === "log" && e.data.ev) logEvent(e.data.ev, e.data.d);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  return null;
}
