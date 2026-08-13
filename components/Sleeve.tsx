import { Disc, Star } from "lucide-react";
import { accentFor } from "@/lib/sleeve";

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
export default function Sleeve({ s, index = 0 }: { s: SleeveData; index?: number }) {
  const accent = accentFor(s.title);
  // Staggered top-to-bottom reveal; capped so big collections stay snappy.
  const delay = `${Math.min(index, 16) * 45}ms`;

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

  if (s.artworkPath) {
    return (
      <div className="jacket art" style={{ ["--ja" as string]: accent, animationDelay: delay }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={"/" + s.artworkPath} alt={s.title} />
        {status}
        <div className="pstrip">
          <span className="ptitle">{s.title}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="jacket typo"
      style={{ ["--ja" as string]: accent, animationDelay: delay }}
    >
      <span className="bar" />
      {status}
      <span className="jtitle">{s.title}</span>
      <span className="jkey">{[s.key, s.form].filter(Boolean).join(" · ")}</span>
    </div>
  );
}
