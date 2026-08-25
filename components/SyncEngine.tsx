"use client";

import { useEffect } from "react";
import { sync } from "@/lib/local/sync";

// Background reconciliation with the Mac. Deliberately invisible: the screen
// is already correct from local data before this runs, so there is nothing to
// wait for and nothing to report unless the user asks (pull to refresh).
//
// Syncs on load, when the network comes back, when the app returns to the
// foreground, and on a slow timer for a session left open on a music stand.
const INTERVAL_MS = 5 * 60 * 1000;

export default function SyncEngine() {
  useEffect(() => {
    const run = () => {
      if (navigator.onLine !== false) void sync();
    };

    run();
    const timer = window.setInterval(run, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };

    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
