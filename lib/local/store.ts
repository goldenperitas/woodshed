"use client";

// Read-side glue: run a local query, then re-run it whenever anything writes
// to the database (a local mutation, or a sync pull landing new rows).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  // Held in a ref so an inline arrow doesn't retrigger the effect every render.
  // Declared before the query effect, so its refresh lands first on re-renders.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let cancelled = false;
    ready()
      .then(() => fnRef.current())
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, ...deps]);

  return state;
}

/** The id in /standards/<id>, read from the URL rather than from route props.
 *
 * The service worker serves one cached shell for every standard when offline,
 * so the params baked into that shell belong to whichever page was cached.
 * The address bar is the only trustworthy source.
 */
export function useStandardId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const read = () =>
      setId(decodeURIComponent(window.location.pathname.split("/")[2] ?? "") || null);
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  return id;
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
