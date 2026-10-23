"use client";

import { useSyncExternalStore } from "react";
import type { NotchCardData } from "../notch/NotchCard";
import type { DemoLimit } from "../ui/demo";

/**
 * The page's one live number: how much of the 5-hour limit the demo has
 * used. The hero's notch, its card, the slider and the floating pill all
 * read it, so the whole page moves together.
 */

let pct = 62;
const subs = new Set<() => void>();

export function setPct(next: number) {
  const v = Math.min(100, Math.max(0, next));
  if (v === pct) return;
  pct = v;
  subs.forEach((f) => f());
}

export function getPct() {
  return pct;
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}

export function usePct() {
  return useSyncExternalStore(subscribe, getPct, () => 62);
}

/**
 * The demo window opened at noon and is used at a steady rate, so 62% (62.18%)
 * means 2:30 PM, two and a half hours to go, and full by 4:01:15 PM — the
 * same snapshot as every other mock on the page (ui/demo.ts).
 */
const RATE = 62.18 / 150; // percent per minute

function duration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Time to the reset; none at 0%, where a fresh window hasn't started yet
 *  (the API reports no reset time for it, and the card says so). */
export function resetsIn(p: number): string | null {
  return p <= 0 ? null : duration(300 - p / RATE);
}

/** The popover's 5-hour row at this moment: the share of the window gone is
 *  the pace tick, and "Full by" holds while the pace does. */
export function limitFor(p: number): DemoLimit {
  const r = resetsIn(p);
  return {
    label: "5-hour",
    pct: Math.round(p),
    tick: p <= 0 ? 0 : (p / RATE / 300) * 100,
    left: r ? `${r} left` : "No reset",
    fullBy: p >= 100 || p <= 0 ? null : "4:01 PM",
    estimated: true,
  };
}

export function cardFor(p: number): NotchCardData {
  return {
    pct: p,
    estimated: true,
    resetsIn: resetsIn(p),
    fullBy: p >= 100 ? null : p > 0 ? "4:01 PM" : null,
    weekly: 31,
  };
}
