import type { CSSProperties } from "react";
import {
  HARDWARE_D,
  OUTLINE_D,
  PAD_X,
  PATH_LEN,
  TONE,
  VIEWBOX,
  VIEW_H,
  VIEW_W,
  brightOf,
  cometBands,
  cometHead,
  cometPlan,
  coreOf,
  toUnits,
  toneOf,
} from "./geometry";
import "./notch.css";

const EASE = "cubic-bezier(0.42, 0, 0.58, 1)";
const r = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The comet's loop as two keyframe sets for this instance: the front's place
 * along the line (--nl-h, in path units) and the comet's opacity. Timings
 * are the helper's CometPlan: ease in-out over the fill, a 0.15 s fade in,
 * a 0.35 s fade out at the end, then the rest.
 */
function cometCss(id: string, pct: number): { css: string; cycle: number } {
  const plan = cometPlan(pct);
  const cycle = plan.travel + plan.fadeOut + plan.rest;
  const pc = (s: number) => `${r((s / cycle) * 100)}%`;
  const span = r(plan.span * PATH_LEN);
  const css = [
    `@keyframes nl-h-${id}{0%{--nl-h:0;animation-timing-function:${EASE}}${pc(plan.travel)}{--nl-h:${span}}100%{--nl-h:${span}}}`,
    `@keyframes nl-o-${id}{0%{opacity:0}${pc(0.15)}{opacity:1}${pc(plan.travel)}{opacity:1;animation-timing-function:${EASE}}${pc(plan.travel + plan.fadeOut)}{opacity:0}100%{opacity:0}}`,
  ].join("");
  return { css, cycle };
}

export interface NotchProps {
  /** Unique within the page: names this instance's keyframes. */
  id: string;
  /** Percent of the 5-hour limit used. */
  pct: number;
  /** The fill the comet runs over, when it differs from pct mid-change: a
   *  run in flight finishes as it began (NotchHelper). */
  cometPct?: number;
  estimated?: boolean;
  /** Draw the line in from nothing when it first appears. */
  draw?: boolean;
  /** Seconds before the line draws in (and the comet starts after it). */
  delay?: number;
  /** Seconds the draw-in takes. */
  drawFor?: number;
  /** No comet: a still line. */
  still?: boolean;
  /** Called as each run of the comet ends (client pages only). */
  onCometLoop?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The notch and its line, as SVG drawn in points. Size it with CSS (the
 * drawing scales as one); the cutout is centred, with room on each side
 * for the line's flares and glow. Everything moves in CSS alone, so it runs
 * with JS off, and rests at a finished frame under reduced motion.
 */
export function Notch({
  id,
  pct,
  cometPct,
  estimated = false,
  draw = false,
  delay = 0,
  drawFor = 1.2,
  still = false,
  onCometLoop,
  className = "",
  style,
}: NotchProps) {
  const tone = toneOf(pct);
  const plan = cometPlan(cometPct ?? pct);
  const { css, cycle } = cometCss(id, cometPct ?? pct);
  const fill = r((Math.min(Math.max(pct, 0), 100) / 100) * PATH_LEN);
  const start = (draw ? delay + drawFor : delay) + 0.1;
  const head = cometHead(plan.tail);
  const comet: CSSProperties = still
    ? {}
    : {
        animation: `nl-h-${id} ${r(cycle)}s linear ${r(start)}s infinite, nl-o-${id} ${r(cycle)}s linear ${r(start)}s infinite`,
      };

  return (
    <svg
      className={`notch ${className}`.trim()}
      viewBox={VIEWBOX}
      width={VIEW_W}
      height={VIEW_H}
      data-tone={tone}
      data-draw={draw ? "" : undefined}
      aria-hidden="true"
      focusable="false"
      overflow="visible"
      style={
        {
          "--nl-tone": TONE[tone],
          "--nl-bright": brightOf(tone, plan.glint),
          "--nl-core": coreOf(tone, plan.glint),
          "--nl-draw-delay": `${delay}s`,
          "--nl-draw-dur": `${drawFor}s`,
          ...style,
        } as CSSProperties
      }
    >
      {still ? null : <style>{css}</style>}
      <defs>
        <clipPath id={`nl-clip-${id}`}>
          <rect x={-PAD_X} y={0} width={VIEW_W} height={VIEW_H + 8} />
        </clipPath>
        {still ? null : (
          <>
            <filter id={`nl-glow-${id}`} x="-10%" y="-40%" width="120%" height="180%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <filter id={`nl-soft-${id}`} x="-10%" y="-40%" width="120%" height="180%">
              <feGaussianBlur stdDeviation="0.7" />
            </filter>
          </>
        )}
      </defs>
      <path className="notch__hw" d={HARDWARE_D} />
      <g clipPath={`url(#nl-clip-${id})`}>
        <path className="notch__track" d={OUTLINE_D} pathLength={PATH_LEN} />
        <path
          className="notch__fill"
          d={OUTLINE_D}
          pathLength={PATH_LEN}
          style={{
            strokeDasharray: `${fill} ${PATH_LEN * 2}`,
            opacity: estimated ? 0.72 : 1,
          }}
        />
        {still ? null : (
          <g
            className="notch__comet"
            style={comet}
            onAnimationIteration={
              onCometLoop
                ? (e) => {
                    if (e.animationName.startsWith("nl-h")) onCometLoop();
                  }
                : undefined
            }
          >
            {/* A soft glow round the head, under the comet. */}
            <path
              className="notch__halo"
              d={OUTLINE_D}
              pathLength={PATH_LEN}
              filter={`url(#nl-glow-${id})`}
              strokeOpacity={plan.glint ? 0.2 : 0.55}
              style={
                {
                  strokeDasharray: `${r(toUnits(plan.tail * 0.35))} 4000`,
                  "--b": r(toUnits(plan.tail * 0.35)),
                } as CSSProperties
              }
            />
            {/* The comet itself: nested bands of the bright line, each a
                step of the sprite's alpha, faint at the tail, solid just
                behind the tip, fading out at the tip; then a soft white-hot
                head over the solid part. */}
            <g opacity={plan.glint ? 0.6 : undefined}>
              {cometBands(plan.tail).map((b, i) => (
                <path
                  key={i}
                  className="notch__c"
                  d={OUTLINE_D}
                  pathLength={PATH_LEN}
                  strokeOpacity={b.alpha}
                  style={
                    {
                      strokeDasharray: `${r(toUnits(b.to - b.from))} 4000`,
                      "--b": r(toUnits(b.to)),
                    } as CSSProperties
                  }
                />
              ))}
              <path
                className="notch__head"
                d={OUTLINE_D}
                pathLength={PATH_LEN}
                filter={`url(#nl-soft-${id})`}
                style={
                  {
                    strokeDasharray: `${r(toUnits(head.to - head.from))} 4000`,
                    "--b": r(toUnits(head.to)),
                  } as CSSProperties
                }
              />
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}
