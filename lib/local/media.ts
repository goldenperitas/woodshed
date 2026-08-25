"use client";

import { useEffect, useState } from "react";
import { resolveMediaUrl } from "@/lib/offline";

/**
 * A displayable URL for a media path, with the object URL revoked when the
 * component unmounts or the path changes. Returns null while resolving, and
 * stays null when the bytes live on some other device.
 */
export function useMediaUrl(path: string | null | undefined): string | null {
  // The resolved URL is stored together with the path it belongs to, so a
  // path change reads as "not resolved yet" without a synchronous reset.
  const [resolved, setResolved] = useState<{ path: string | null; url: string | null }>({
    path: null,
    url: null,
  });
  const key = path ?? null;

  useEffect(() => {
    let created: string | null = null;
    let cancelled = false;
    resolveMediaUrl(key).then((u) => {
      if (cancelled) {
        if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
        return;
      }
      if (u?.startsWith("blob:")) created = u;
      setResolved({ path: key, url: u });
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [key]);

  return resolved.path === key ? resolved.url : null;
}
