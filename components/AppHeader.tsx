"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import ViewLink from "@/components/ViewLink";

type Props = {
  /** Usually the back arrow. Sits against the leading edge. */
  left?: React.ReactNode;
  /** Centred on the screen, not between the slots, so it stays put. */
  title?: React.ReactNode;
  right?: React.ReactNode;
  /**
   * Selector for the page's own copy of the title. While that element is still
   * on screen the header stays empty in the middle; the header only takes the
   * title over once the page has scrolled it away.
   */
  revealAfter?: string;
};

// The one bar that stays put on every screen. It is transparent over the top of
// a page and only draws its background once there is content behind it.
export default function AppHeader({ left, title, right, revealAfter }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [revealed, setRevealed] = useState(!revealAfter);

  useEffect(() => {
    const read = () => {
      setScrolled(window.scrollY > 4);
      if (!revealAfter) return;
      const el = document.querySelector(revealAfter);
      const under = ref.current?.getBoundingClientRect().bottom ?? 0;
      // Measured every time rather than cached: artwork and takes arrive after
      // the first paint and move the title down the page.
      setRevealed(!!el && el.getBoundingClientRect().bottom <= under);
    };
    // A tick late, so the page's restored scroll position is already applied.
    const t = setTimeout(read, 0);
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [revealAfter]);

  return (
    <header ref={ref} className={`hdr ${scrolled ? "scrolled" : ""}`}>
      <div className="hdr-in">
        {left && <div className="hdr-l">{left}</div>}
        {title && <div className={`hdr-c ${revealed ? "in" : ""}`}>{title}</div>}
        {right && <div className="hdr-r">{right}</div>}
      </div>
    </header>
  );
}

/** The arrow every screen but the shelf wears in its top-left corner. */
export function BackArrow({ href = "/", label = "戻る" }: { href?: string; label?: string }) {
  return <ViewLink href={href} className="hdr-back" aria-label={label} title={label}><ArrowLeft size={20} strokeWidth={2} /></ViewLink>;
}
