/** Colour maths for the notch colour wheel: hue and saturation at full brightness. */

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Hue (0–360) and saturation (0–1) of `#rrggbb`. */
export function hexToHs(hex: string): { h: number; s: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const s = max === 0 ? 0 : d / max;
  if (d === 0) return { h: 0, s };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
}

/** `#rrggbb` for a hue (0–360) and saturation (0–1) at full brightness. */
export function hsToHex(h: number, s: number): string {
  const f = (k: number): number => {
    const x = (k + h / 60) % 6;
    return 1 - s * Math.max(0, Math.min(x, 4 - x, 1));
  };
  return `#${[f(5), f(3), f(1)]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
