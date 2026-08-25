"use client";

// Navigation, done by the app rather than by the framework's router.
//
// Every screen in this app renders from the device's own database. There is
// nothing on the other end of a route request worth waiting for — and offline
// there is nothing there at all, which is what used to turn each tap into a
// full document load: a new page, a new worker, a new SQLite connection
// fighting the outgoing one for the same exclusive OPFS handles.
//
// pushState changes the address without any of that. Next.js keeps
// usePathname() in step with it (see its "shallow routing" guidance), so
// <Screen> can pick the view and the document simply stays alive.

/** Moves to an in-app URL without reloading the document. */
export function navigate(href: string): void {
  const here = window.location.pathname + window.location.search;
  if (href === here) return;
  window.history.pushState(null, "", href);
  // A new screen starts at the top. Going *back* is handled by the screens
  // themselves — the shelf restores its own scroll position.
  window.scrollTo(0, 0);
}

/** True for clicks the browser should keep: new tab, download, middle button. */
export function isPlainClick(e: React.MouseEvent): boolean {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}
