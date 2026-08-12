export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function fmtDue(nextDue: number | null, now: number): string {
  if (nextDue === null) return "未";
  const diff = nextDue - now;
  const day = 24 * 60 * 60 * 1000;
  if (diff <= 0) return "今";
  const days = Math.ceil(diff / day);
  if (days === 1) return "明日";
  return `${days}日後`;
}
