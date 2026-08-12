import { accentFor } from "@/lib/sleeve";

type SleeveData = {
  title: string;
  composer: string | null;
  key: string | null;
  form: string | null;
  status: number;
  artworkPath: string | null;
};

// A tune rendered as a record jacket — an uploaded cover if present,
// otherwise a deterministic Blue Note typographic sleeve.
export default function Sleeve({ s, index = 0 }: { s: SleeveData; index?: number }) {
  const accent = accentFor(s.title);
  // Staggered top-to-bottom reveal; capped so big collections stay snappy.
  const delay = `${Math.min(index, 16) * 45}ms`;
  const stag = (
    <div className="marks">
      <span className="stag">S{s.status}</span>
    </div>
  );

  if (s.artworkPath) {
    return (
      <div className="jacket art" style={{ animationDelay: delay }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={"/" + s.artworkPath} alt={s.title} />
        {stag}
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
      {s.composer && <span className="jcomp">{s.composer.toUpperCase()}</span>}
      {stag}
      <span className="jtitle">{s.title}</span>
      <span className="jkey">{[s.key, s.form].filter(Boolean).join(" · ")}</span>
    </div>
  );
}
