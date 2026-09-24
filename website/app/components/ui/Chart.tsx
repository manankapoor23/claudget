import { HOURLY, HOURLY_START } from "./demo";

function hourLabel(hour: number): string {
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
}

/**
 * Tokens per hour for the last 24 hours, ported from the app's BarChart
 * (renderer/components/BarChart.tsx): a dashed gridline at the peak with its
 * value, a floor of 3% so idle hours read as dashes, every sixth hour labelled,
 * and the current hour in the tint.
 */
export function Chart({ bare = false }: { bare?: boolean }) {
  const max = Math.max(...HOURLY);
  const n = HOURLY.length;
  return (
    <div className={bare ? "chart chart--bare" : "chart"}>
      <div className="chart__plot">
        {bare ? null : (
          <span className="chart__grid">
            <span>{`${max}M`}</span>
          </span>
        )}
        {HOURLY.map((v, i) => (
          <span key={i} className={i === n - 1 ? "chart__col chart__col--now" : "chart__col"}>
            <span className="chart__bar" style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      {bare ? null : (
        <div className="chart__axis">
          {HOURLY.map((_, i) =>
            // The app stops at n - 2; one more keeps "12p" off "now" at this width.
            (HOURLY_START + i) % 6 === 0 && i < n - 3 ? (
              <span key={i} style={{ left: `${((i + 0.5) / n) * 100}%` }}>
                {hourLabel(HOURLY_START + i)}
              </span>
            ) : null,
          )}
          <span className="chart__now">now</span>
        </div>
      )}
    </div>
  );
}
