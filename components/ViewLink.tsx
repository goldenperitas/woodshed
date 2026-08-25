"use client";

import { navigate, isPlainClick } from "@/lib/nav";

// A link that changes the screen without fetching a new document. It stays a
// real <a href> — long-press, "open in new tab" and the status bar all keep
// working, and if the JavaScript ever fails to load, the link still navigates
// the old way.
//
// Used instead of next/link everywhere inside the app: <Link> asks the router
// for a route payload, which offline is a request that cannot be answered.

type Props = React.ComponentPropsWithoutRef<"a"> & { href: string };

export default function ViewLink({ href, onClick, children, ...rest }: Props) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !isPlainClick(e)) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
