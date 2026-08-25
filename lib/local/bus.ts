"use client";

// Tiny change bus. Local writes announce themselves here and every mounted
// query re-runs — the client-side replacement for revalidatePath().
//
// Lives in its own module so mutations.ts can publish without importing the
// React store (which imports mutations' siblings in turn).

type Listener = () => void;

const listeners = new Set<Listener>();
let revision = 0;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getRevision(): number {
  return revision;
}

/** Call after any write to the local database. */
export function notifyChanged(): void {
  revision++;
  for (const fn of listeners) fn();
}
