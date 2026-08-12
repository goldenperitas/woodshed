// Deliberately tiny spaced-repetition scheduler. Not SM-2 — for a solo
// study app, a rating -> interval table is plenty and easy to reason about.
// rating: 1 again, 2 hard, 3 good, 4 easy.

const DAY = 24 * 60 * 60 * 1000;

// How many days until this tune is "due" again, given the last two ratings.
// We keep it stateless-ish: interval grows with good/easy, resets on again.
export function nextInterval(rating: number, prevIntervalDays: number): number {
  switch (rating) {
    case 1:
      return 0; // again — see it later today
    case 2:
      return Math.max(1, Math.round(prevIntervalDays * 0.5)) || 1;
    case 3:
      return prevIntervalDays > 0 ? Math.round(prevIntervalDays * 2.2) : 2;
    case 4:
      return prevIntervalDays > 0 ? Math.round(prevIntervalDays * 3.5) : 4;
    default:
      return 1;
  }
}

export function computeNextDue(
  rating: number,
  prevIntervalDays: number,
  now: number,
): { nextDue: number; intervalDays: number } {
  const intervalDays = nextInterval(rating, prevIntervalDays);
  return { nextDue: now + intervalDays * DAY, intervalDays };
}

export { DAY };
