/**
 * Which alert threshold (in percent) a limit has newly crossed, if any: the
 * highest configured threshold at or below current use that hasn't been
 * announced for this window cycle yet. Only the highest fires, so opening the
 * app at 99% sends one alert, not two.
 */
export function thresholdToAnnounce(
  utilization: number,
  thresholds: readonly number[],
  alreadyAnnounced: number,
): number | null {
  const pct = utilization * 100;
  const crossed = [...new Set(thresholds)]
    .filter((t) => t >= 1 && t <= 100)
    .sort((a, b) => b - a)
    .find((t) => pct >= t);
  if (crossed === undefined || crossed <= alreadyAnnounced) return null;
  return crossed;
}
