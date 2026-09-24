import { useEffect, useRef, useState } from 'react';

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Eases a number from its previous value to the new one (ease-out cubic), so a
 * figure rolls instead of snapping. Snaps immediately under Reduce Motion.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const [shown, setShown] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(shown);

  useEffect(() => {
    if (reducedMotion()) {
      setShown(target);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const step = (t: number): void => {
      const k = Math.min(1, (t - start) / durationMs);
      const v = origin + (target - origin) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return shown;
}

/**
 * True for a moment after `value` goes up — never on first render, never on a
 * decrease, never under Reduce Motion. Pair with a CSS class to "throb" a
 * figure each time a limit ticks higher; a second rise mid-throb restarts it.
 */
export function useBump(value: number, durationMs = 900): boolean {
  const prev = useRef<number | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === null || !(value > before) || reducedMotion()) return undefined;
    setOn(false);
    const raf = requestAnimationFrame(() => setOn(true));
    const done = window.setTimeout(() => setOn(false), durationMs);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [value, durationMs]);

  return on;
}
