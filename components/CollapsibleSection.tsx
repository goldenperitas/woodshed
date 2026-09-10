"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// A section whose heading doubles as its toggle. `collapsible` is what the
// caller knows about the tune — e.g. the uploader only gets in the way once
// the tune already has takes; on an empty tune it stays open and plain.
export default function CollapsibleSection({
  title,
  collapsible,
  children,
}: {
  title: string;
  collapsible: boolean;
  children: ReactNode;
}) {
  // Decided once, on mount: taking a take in collapses the section under the
  // upload that is still running otherwise.
  const [open, setOpen] = useState(!collapsible);

  if (!collapsible) {
    return (
      <>
        <div className="sec-head"><h4>{title}</h4></div>
        {children}
      </>
    );
  }

  return (
    <>
      <button
        className="sec-head sec-head-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h4>{title}</h4>
        {open
          ? <ChevronUp size={16} strokeWidth={2} className="sec-caret" />
          : <ChevronDown size={16} strokeWidth={2} className="sec-caret" />}
      </button>
      {open && children}
    </>
  );
}
