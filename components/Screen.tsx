"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Booting from "./Booting";
import Shelf from "./screens/Shelf";
import Tune from "./screens/Tune";
import NewTune from "./screens/NewTune";
import Drill from "./screens/Drill";
import Listening from "./screens/Listening";
import Groups from "./screens/Groups";
import Diagnostics from "./screens/Diagnostics";

// Which screen the address bar is asking for. Every route renders this, so the
// app decides for itself rather than asking the framework's router to fetch
// anything — see lib/nav.ts for why that matters offline.
//
// The choice is deliberately NOT made during the server render. That makes the
// document byte-identical for every URL, which buys two things:
//
//   1. one cached document can answer a navigation to any screen, so a tune
//      this device has never fetched still opens with no network
//   2. a document cached for one screen can never hydrate into a different
//      one, which is the mismatch that used to put a tune page's markup under
//      a different tune's address
//
// Nothing is lost by waiting: every screen reads from the device database and
// starts on a loading state anyway.
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

function pick(pathname: string) {
  if (pathname === "/") return <Shelf />;
  if (pathname === "/standards/new") return <NewTune />;
  if (pathname.startsWith("/standards/")) return <Tune />;
  if (pathname === "/drill") return <Drill />;
  if (pathname === "/listening") return <Listening />;
  if (pathname === "/groups") return <Groups />;
  if (pathname === "/debug") return <Diagnostics />;
  return <Shelf />;
}

export default function Screen() {
  const pathname = usePathname();
  if (!useHydrated()) return <Booting />;
  return pick(pathname);
}
