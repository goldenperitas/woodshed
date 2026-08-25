"use client";

// Shown for the moment between mount and the local database answering.
// Deliberately quiet: this is a few milliseconds on a warm PWA, and a
// spinner that flashes reads as jank.
export default function Booting({ label = "棚を開けています" }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: "50vh",
        display: "grid",
        placeItems: "center",
        color: "var(--muted)",
        fontSize: 12,
        letterSpacing: ".08em",
      }}
    >
      {label}
    </div>
  );
}
