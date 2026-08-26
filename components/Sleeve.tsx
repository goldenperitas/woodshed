"use client";

import { Disc, Star } from "lucide-react";
import { accentFor } from "@/lib/sleeve";
import { useMediaUrl } from "@/lib/local/media";

type SleeveData = {
  title: string;
  composer: string | null;
  key: string | null;
  form: string | null;
  status: number;
  recordingCount: number;
  artworkPath: string | null;
};

// A tune rendered as a record jacket — an uploaded cover if present,
// otherwise a deterministic Blue Note typographic sleeve.
export default function Sleeve({ s }: { s: SleeveData }) {
  const accent = accentFor(s.title);
  const art = useMediaUrl(s.artworkPath);

  // Status strip: ◎ record glows in the tune's colour once a take exists,
  // then S1/S2/S3 as stars that fill + glow as each step is reached.
  const hasTakes = s.recordingCount > 0;
  const status = (
    <div className="jstatus">
      <span className="jchip">
        <Disc size={16} strokeWidth={2.4} className={hasTakes ? "on" : "off"} />
        {[1, 2, 3].map((n) => (
          <Star
            key={n}
            size={15}
            strokeWidth={2}
            fill={s.status >= n ? "currentColor" : "none"}
            className={s.status >= n ? "on" : "off"}
          />
        ))}
      </span>
    </div>
  );

  if (art) {
    return (
      <div className="jacket art" style={{ ["--ja" as string]: accent }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} alt={s.title} />
        {status}
        <div className="pstrip">
          <span className="ptitle">{s.title}</span>
          {(s.key || s.form) && (
            <span className="pkey">{[s.key, s.form].filter(Boolean).join(" · ")}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="jacket typo"
      style={{ ["--ja" as string]: accent }}
    >
      <span className="bar" />
      {status}
      <span className="jtitle">{s.title}</span>
      <span className="jkey">{[s.key, s.form].filter(Boolean).join(" · ")}</span>
    </div>
  );
}
