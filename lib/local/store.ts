"use client";

// Read-side glue: run a local query, then re-run it whenever anything writes
// to the database (a local mutation, or a sync pull landing new rows).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { subscribe, getRevision } from "./bus";
import { ready } from "./db";

export type QueryState<T> = { data: T | null; loading: boolean; error: Error | null };

/**
 * `deps` behaves like a useEffect dependency list — pass anything the query
 * closes over (an id from the route, a filter). The query function itself is
 * intentionally not a dependency, so inline arrows don't cause a refetch loop.
 */
export function useLocalQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const revision = useSyncExternalStore(subscribe, getRevision, () => 0);
  // The key travels with the result, so a result can never be shown for a
  // different set of inputs than the one it was fetched for.
  const [state, setState] = useState<QueryState<T> & { key: string }>({
    data: null,
    loading: true,
    error: null,
    key: "",
  });

  // Held in a ref so an inline arrow doesn't retrigger the effect every render.
  // Declared before the query effect, so its refresh lands first on re-renders.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  // Keyed by deps so a change reads as "loading", never as the previous
  // result. Without this, the render right after an id arrives still holds the
  // old query's `null` and the page flashes — or sticks on — "not found".
  const key = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    ready()
      .then(() => fnRef.current())
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null, key });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error, key });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, ...deps]);

  if (state.key !== key) return { data: null, loading: true, error: null };
  return { data: state.data, loading: state.loading, error: state.error };
}

/**
 * The id in /standards/<id>.
 *
 * Taken from the address bar rather than from route params: offline a document
 * can be served from a shell that was fetched for some other URL, so anything
 * baked into it belongs to whenever it was cached. The address bar is the one
 * thing that cannot be wrong.
 *
 * usePathname supplies the *reactivity* — moving between two tunes keeps this
 * component mounted, and it is what makes the id recompute.
 */
export function useStandardId(): string | null {
  const pathname = usePathname();
  const path = typeof window === "undefined" ? pathname : window.location.pathname;
  return decodeURIComponent(path.split("/")[2] ?? "") || null;
}

/** Wrap an async mutation so the UI can show in-flight state and errors. */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (...args: A) => {
      setBusy(true);
      try {
        return await fn(...args);
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return [run, busy] as const;
}
