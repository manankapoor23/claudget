/**
 * The notch line, in numbers — ported from the app's native helper
 * (packages/desktop/native/notch/NotchHelper.swift: Metrics, Outline,
 * CometPlan, Tone). Units are points; the SVG draws in them, and the page
 * scales the whole drawing, so the line keeps its proportions at any size.
 *
 * The notch is a MacBook Air M2's: 179 × 32 pt.
 */

export const NOTCH_W = 179;
export const NOTCH_H = 32;

/** The stroke. */
export const LINE_W = 2.5;
/** Hardware corner radius of the cutout's bottom corners. */
const HW_RADIUS = 8;
/** The small outward curve where the line meets the top edge. */
const FLARE = 4;
/** Gap between the hardware edge and the stroke's inner edge. */
const GAP = 0.75;

const D = LINE_W / 2 + GAP; // 2
const X0 = -D;
const X1 = NOTCH_W + D;
const Y_BOT = NOTCH_H + D;
const RAD = Math.min(HW_RADIUS + D, (X1 - X0) / 2, Y_BOT / 2); // 10

/**
 * The outline, offset outward from the cutout: in from the top edge with a
 * small flare, down the left side, round the bottom corners, across, and up
 * the right side. SVG coordinates (y down), the screen's top edge at y = 0.
 */
export const OUTLINE_D = [
  `M ${X0 - FLARE} 0`,
  `A ${FLARE} ${FLARE} 0 0 1 ${X0} ${FLARE}`,
  `L ${X0} ${Y_BOT - RAD}`,
  `A ${RAD} ${RAD} 0 0 0 ${X0 + RAD} ${Y_BOT}`,
  `L ${X1 - RAD} ${Y_BOT}`,
  `A ${RAD} ${RAD} 0 0 0 ${X1} ${Y_BOT - RAD}`,
  `L ${X1} ${FLARE}`,
  `A ${FLARE} ${FLARE} 0 0 1 ${X1 + FLARE} 0`,
].join(" ");

/** Length of the outline, in points (≈ 247). */
export const OUTLINE_LEN =
  2 * (FLARE * (Math.PI / 2)) +
  2 * (Y_BOT - RAD - FLARE) +
  2 * (RAD * (Math.PI / 2)) +
  (X1 - X0 - 2 * RAD);

/** The cutout itself, with the soft shoulders where it meets the top edge. */
const SH = 3;
export const HARDWARE_D = [
  `M ${-SH} 0`,
  `A ${SH} ${SH} 0 0 1 0 ${SH}`,
  `L 0 ${NOTCH_H - HW_RADIUS}`,
  `A ${HW_RADIUS} ${HW_RADIUS} 0 0 0 ${HW_RADIUS} ${NOTCH_H}`,
  `L ${NOTCH_W - HW_RADIUS} ${NOTCH_H}`,
  `A ${HW_RADIUS} ${HW_RADIUS} 0 0 0 ${NOTCH_W} ${NOTCH_H - HW_RADIUS}`,
  `L ${NOTCH_W} ${SH}`,
  `A ${SH} ${SH} 0 0 1 ${NOTCH_W + SH} 0`,
  "Z",
].join(" ");

/** Room the drawing keeps around the cutout for the line and its glow. */
export const PAD_X = 14;
export const PAD_B = 12;
export const VIEW_W = NOTCH_W + PAD_X * 2;
export const VIEW_H = NOTCH_H + PAD_B;
export const VIEWBOX = `${-PAD_X} 0 ${VIEW_W} ${VIEW_H}`;

export type Tone = "ok" | "warn" | "bad";

/** The app's thresholds (shared/limits.ts toneOf). */
export function toneOf(pct: number): Tone {
  if (pct >= 90) return "bad";
  if (pct >= 70) return "warn";
  return "ok";
}

/** Brand orange, amber, red — the helper's Tone colours. */
export const TONE: Record<Tone, string> = {
  ok: "#ff6b1f",
  warn: "#ffb224",
  bad: "#ff453a",
};

function mixWhite(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The comet's colour: the tone, most of the way to white. */
export function brightOf(tone: Tone, glint = false): string {
  return mixWhite(TONE[tone], glint ? 0.3 : 0.62);
}

/** The head's colour: whiter still, so it reads white-hot. */
export function coreOf(tone: Tone, glint = false): string {
  return mixWhite(TONE[tone], glint ? 0.45 : 0.88);
}

/** One run of the comet (CometPlan.make). Times in seconds, lengths in points. */
export interface CometPlan {
  span: number;
  travel: number;
  fadeOut: number;
  tail: number;
  rest: number;
  glint: boolean;
}

export function cometPlan(pct: number): CometPlan {
  const p = Math.min(Math.max(pct / 100, 0), 1);
  const glint = p <= 0;
  const span = glint ? 1 : p;
  const speed = glint ? 55 : 85;
  const travel = Math.min(Math.max((span * OUTLINE_LEN) / speed, 0.9), glint ? 4.8 : 3.0);
  return {
    span,
    travel,
    fadeOut: 0.35,
    tail: glint ? 18 : Math.min(48, Math.max(16, span * OUTLINE_LEN * 0.5)),
    rest: glint ? 2.6 : 2.2,
    glint,
  };
}

/**
 * The comet, as the helper draws it (cometSprite): a sprite whose alpha
 * runs clear at the tail, 25% at 45% along, solid just short of the front
 * (the last 4 pt, or 18% of a short comet), then fades to clear at the very
 * tip — laid over a bright copy of the line.
 */
export interface CometBand {
  /** Distance behind the front where the band starts and ends, in points. */
  from: number;
  to: number;
  /** Its own opacity: stacked, the bands add up to the sprite's alpha. */
  alpha: number;
}

/**
 * The sprite in strokes. Band j covers every point where the sprite's alpha
 * is at least j/N — one interval, since the profile rises to a single peak
 * — and has opacity 1/(N − j + 1), so wherever m bands overlap the
 * composite is exactly m/N. With N steps of 1/N there are no visible bands,
 * and the tip fades out instead of ending square.
 */
/** The head: the stretch around the sprite's solid peak, in points behind the front. */
export function cometHead(tail: number): { from: number; to: number } {
  const tip = Math.min(0.18, 4 / tail) * tail;
  return { from: tip * 0.3, to: tip * 1.9 };
}

export function cometBands(tail: number, steps = 28): CometBand[] {
  const tip = Math.min(0.18, 4 / tail);
  const bands: CometBand[] = [];
  for (let j = 1; j <= steps; j++) {
    const level = j / steps - 1 / (2 * steps);
    // Front edge: where the tip's fade reaches this level.
    const front = level * tip;
    // Rear edge: where the long fall-off drops below it.
    const rear =
      level >= 0.25 ? tip + ((1 - level) / 0.75) * (0.55 - tip) : 1 - (level / 0.25) * 0.45;
    bands.push({
      from: Math.round(front * tail * 1000) / 1000,
      to: Math.round(rear * tail * 1000) / 1000,
      alpha: Math.round((1 / (steps - j + 1)) * 1000) / 1000,
    });
  }
  return bands;
}

/** Units used by every dash: the path is normalised to this length. */
export const PATH_LEN = 1000;
export const toUnits = (pt: number) => (pt / OUTLINE_LEN) * PATH_LEN;
