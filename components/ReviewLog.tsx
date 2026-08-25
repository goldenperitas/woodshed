import type { ReviewLogRow } from "@/lib/sync/schema";

// Read-only view of the self-assessment history for one standard. Server
// component — the drill writes these rows; here we just read them back.

const DAY = 24 * 60 * 60 * 1000;

const RATING: Record<number, { word: string; color: string }> = {
  1: { word: "もう一度", color: "#ef8f7e" },
  2: { word: "むずい", color: "#e6b24e" },
  3: { word: "できた", color: "#7fd08a" },
  4: { word: "余裕", color: "#7fc6e6" },
};

const MODE_LABEL: Record<string, string> = {
  name_to_info: "曲名 → 情報",
  audio_to_name: "音 → 曲名",
  session_key: "セッション",
};
const MODE_SHORT: Record<string, string> = {
  name_to_info: "曲名",
  audio_to_name: "音",
  session_key: "セッション",
};
const MODE_ORDER = ["name_to_info", "audio_to_name", "session_key"];

function fmtMD(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function pastLabel(ms: number, now: number) {
  const d = Math.floor((now - ms) / DAY);
  if (d <= 0) return "今日";
  if (d === 1) return "昨日";
  if (d < 30) return `${d}日前`;
  return fmtMD(ms);
}
function dueLabel(nextDue: number, now: number): { text: string; now: boolean } {
  const d = Math.ceil((nextDue - now) / DAY);
  if (d <= 0) return { text: "復習どき", now: true };
  if (d === 1) return { text: "明日", now: false };
  return { text: `${d}日後`, now: false };
}

export default function ReviewLog({ reviews, now }: { reviews: ReviewLogRow[]; now: number }) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        まだ復習記録はありません。ドリルで評価すると溜まっていく。
      </p>
    );
  }

  // reviews arrive newest-first; group per mode keeping that order.
  const byMode = new Map<string, ReviewLogRow[]>();
  for (const r of reviews) {
    const arr = byMode.get(r.mode) ?? [];
    arr.push(r);
    byMode.set(r.mode, arr);
  }
  const modeKeys = [
    ...MODE_ORDER.filter((m) => byMode.has(m)),
    ...[...byMode.keys()].filter((m) => !MODE_ORDER.includes(m)),
  ];

  const LOG_MAX = 8;
  const recent = reviews.slice(0, LOG_MAX);
  const more = reviews.length - recent.length;

  return (
    <div className="rl">
      <div className="rl-modes">
        {modeKeys.map((m) => {
          const rows = byMode.get(m)!;
          const latest = rows[0]; // newest — its nextDue drives scheduling
          const due = dueLabel(latest.nextDue, now);
          const counts: Record<number, number> = {};
          for (const r of rows) counts[r.rating] = (counts[r.rating] || 0) + 1;
          return (
            <div className="rl-mode" key={m}>
              <div className="rl-mode-top">
                <span className="nm">{MODE_LABEL[m] ?? m}</span>
                <span className={`rl-due ${due.now ? "now" : ""}`}>次 {due.text}</span>
              </div>
              <div className="rl-tally">
                {[1, 2, 3, 4].filter((n) => counts[n]).map((n) => (
                  <span className="rt" key={n}>
                    <i style={{ background: RATING[n].color }} />
                    {RATING[n].word} <b>{counts[n]}</b>
                  </span>
                ))}
              </div>
              <span className="rl-last">最終 {pastLabel(latest.reviewedAt, now)}・計 {rows.length}</span>
            </div>
          );
        })}
      </div>

      {reviews.length > modeKeys.length && (
        <div className="rl-log">
          <div className="rl-log-h">Recent</div>
          {recent.map((r) => {
            const rt = RATING[r.rating] ?? { word: String(r.rating), color: "var(--muted-2)" };
            return (
              <div className="row" key={r.id}>
                <span className="d">{fmtMD(r.reviewedAt)}</span>
                <span className="m">{MODE_SHORT[r.mode] ?? r.mode}</span>
                <span className="r" style={{ color: rt.color }}>
                  <i />
                  {rt.word}
                </span>
              </div>
            );
          })}
          {more > 0 && <div className="rl-more">ほか {more} 件</div>}
        </div>
      )}
    </div>
  );
}
