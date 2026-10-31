import { useRef, type JSX, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp01, hexToHs, hsToHex } from '../../shared/color';

/**
 * A hue × saturation wheel at full brightness: hue round the edge (red at the
 * top, clockwise), white in the middle. Full brightness keeps every pick
 * readable against the notch's black.
 */

const HUE_STEP = 5;
const SAT_STEP = 0.05;

export function ColorWheel({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const { h, s } = hexToHs(value);

  const pick = (e: PointerEvent<HTMLDivElement>): void => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    onChange(hsToHex(hue, clamp01(Math.hypot(dx, dy) / (r.width / 2))));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-HUE_STEP, 0],
      ArrowRight: [HUE_STEP, 0],
      ArrowUp: [0, SAT_STEP],
      ArrowDown: [0, -SAT_STEP],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(hsToHex((h + d[0] + 360) % 360, clamp01(s + d[1])));
  };

  const a = (h * Math.PI) / 180;
  return (
    <div
      ref={ref}
      className="cwheel"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-roledescription="colour wheel"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(h)}
      aria-valuetext={value}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
      }}
      onKeyDown={onKey}
    >
      <span
        className="cwheel__knob"
        style={{
          left: `${50 + Math.sin(a) * s * 50}%`,
          top: `${50 - Math.cos(a) * s * 50}%`,
          background: value,
        }}
      />
    </div>
  );
}

/** The notch with the line traced part-way round it, in `color`. */
export function NotchPreview({ color }: { color: string }): JSX.Element {
  const edge = 'M14 0 V12 a9 9 0 0 0 9 9 H97 a9 9 0 0 0 9 -9 V0';
  return (
    <svg className="npreview" viewBox="0 0 120 30" width="120" height="30" aria-hidden="true">
      <rect width="120" height="30" rx="6" className="npreview__bar" />
      <path d={`${edge} Z`} fill="#000" />
      <path
        d={edge}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="62 100"
      />
    </svg>
  );
}
