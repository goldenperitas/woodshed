"use client";

import { useEffect } from "react";

// Registers the service worker (app-shell caching + PWA install).
// Offline audio is handled separately via IndexedDB (see lib/offline.ts).
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Ask for durable storage so iOS is less likely to evict cached audio.
    if (navigator.storage?.persist) {
      navigator.storage.persisted().then((p) => {
        if (!p) navigator.storage.persist().catch(() => {});
      });
    }
  }, []);
  return null;
}
