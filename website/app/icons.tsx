/* Stroke icons with round caps and joins, drawn to sit next to SF Symbols and
   the app's own icon set (packages/desktop/src/renderer/components/icons.tsx). */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base: P = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function IconDownload(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
    </svg>
  );
}

export function IconTheme(props: P) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5M5.46 5.46l1.06 1.06M17.48 17.48l1.06 1.06M18.54 5.46l-1.06 1.06M6.52 17.48l-1.06 1.06" />
    </svg>
  );
}

export function IconMoon(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M19.5 14.2A7.75 7.75 0 1 1 9.8 4.5a6.25 6.25 0 0 0 9.7 9.7Z" />
    </svg>
  );
}

export function IconGitHub(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 4.6 3 8.5 7.2 9.9.5.1.7-.2.7-.5v-1.7c-2.9.6-3.5-1.4-3.5-1.4-.5-1.2-1.2-1.5-1.2-1.5-.9-.7.1-.7.1-.7 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.2 0-1.1.4-2.1 1.1-2.8-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 2.9 1.1.8-.2 1.7-.3 2.6-.3.9 0 1.8.1 2.6.3 2-1.4 2.9-1.1 2.9-1.1.6 1.5.2 2.6.1 2.9.7.7 1.1 1.7 1.1 2.8 0 4-2.5 4.9-4.8 5.2.4.3.7 1 .7 2v3c0 .3.2.6.7.5 4.2-1.4 7.2-5.3 7.2-9.9C22.5 6.2 17.8 1.5 12 1.5z" />
    </svg>
  );
}

export function IconApple(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8zM14.2 5.3c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.6-1 1.7-.9 2.7 1 .1 2-.5 2.6-1.2z" />
    </svg>
  );
}

export function IconWindows(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M3 5.5L10.5 4.5V11.3H3V5.5zM11.5 4.4L21 3v8.3h-9.5V4.4zM3 12.3h7.5v6.8L3 18.1V12.3zM11.5 12.3H21V21l-9.5-1.3V12.3z" />
    </svg>
  );
}

export function IconLinux(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2c-2 0-3.2 1.7-3.2 3.8 0 1.3.1 2.1-.5 3.1C7.4 10.4 6 11.9 6 13.8c0 .6.1 1 .3 1.5-.5.6-1.3 1.5-1.3 2.4 0 .7.5 1 1.3 1.2.8.2 1.3.3 1.6.8.4.6 1 1.3 2.3 1.3.8 0 1.4-.3 1.8-.7.4.4 1 .7 1.8.7 1.3 0 1.9-.7 2.3-1.3.3-.5.8-.6 1.6-.8.8-.2 1.3-.5 1.3-1.2 0-.9-.8-1.8-1.3-2.4.2-.5.3-.9.3-1.5 0-1.9-1.4-3.4-2.3-4.9-.6-1-.5-1.8-.5-3.1C15.2 3.7 14 2 12 2zm-1.4 4c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9zm2.8 0c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9z" />
    </svg>
  );
}

export function IconArrowRight(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />
    </svg>
  );
}

export function IconCheck(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconFolder(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

export function IconGauge(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0" />
      <path d="m12 13.5 4-4.5" />
      <circle cx="12" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ---- glyphs used inside the product mocks ------------------------------ */

/** The menu-bar glyph: three ascending capsules (mirrors main/tray.ts). */
export function GlyphTray(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden {...props}>
      <rect x="3.05" y="8" width="2.6" height="5.5" rx="1.3" />
      <rect x="6.7" y="5" width="2.6" height="8.5" rx="1.3" />
      <rect x="10.35" y="2" width="2.6" height="11.5" rx="1.3" />
    </svg>
  );
}

export function GlyphWifi(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden {...props}>
      <path d="M8 3.2c2.5 0 4.8 1 6.5 2.6l-1.1 1.2A7.6 7.6 0 0 0 8 4.8 7.6 7.6 0 0 0 2.6 7L1.5 5.8A9.2 9.2 0 0 1 8 3.2Zm0 3.1c1.7 0 3.2.6 4.3 1.7l-1.1 1.2A4.5 4.5 0 0 0 8 7.9c-1.2 0-2.3.5-3.2 1.3L3.7 8A6.1 6.1 0 0 1 8 6.3Zm0 3.1c.9 0 1.6.3 2.2.9L8 12.8l-2.2-2.5c.6-.6 1.3-.9 2.2-.9Z" />
    </svg>
  );
}

export function GlyphBattery(props: P) {
  return (
    <svg viewBox="0 0 26 14" fill="none" aria-hidden {...props}>
      <rect x="0.75" y="1.25" width="21.5" height="11.5" rx="3.25" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" />
      <rect x="2.6" y="3.1" width="14.4" height="7.8" rx="1.7" fill="currentColor" />
      <path d="M23.8 5.2v3.6c.8-.3 1.3-1 1.3-1.8s-.5-1.5-1.3-1.8Z" fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}

export function GlyphSwitches(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden {...props}>
      <rect x="1.7" y="2.7" width="12.6" height="4.3" rx="2.15" />
      <circle cx="12.2" cy="4.85" r="1.1" fill="currentColor" stroke="none" />
      <rect x="1.7" y="9" width="12.6" height="4.3" rx="2.15" />
      <circle cx="3.8" cy="11.15" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GlyphSearch(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden {...props}>
      <circle cx="7" cy="7" r="4.4" />
      <path d="m10.3 10.3 3.4 3.4" />
    </svg>
  );
}

export function GlyphVolume(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M2.5 6h2.2L8 3.3v9.4L4.7 10H2.5Z" fill="currentColor" />
      <path d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.2 3.9a5.8 5.8 0 0 1 0 8.2" />
    </svg>
  );
}

export function GlyphChevronUp(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="m4 10 4-4 4 4" />
    </svg>
  );
}

/* The dashboard sidebar and window controls, from the app's icon set. */
export function IconOverview(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconActivity(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M5 20v-7M10 20V7M15 20V10M20 20V4" />
    </svg>
  );
}

export function IconSessions(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </svg>
  );
}

export function IconInsights(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

export function IconExpand(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function IconClose(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconMinus(props: P) {
  return (
    <svg {...base} strokeWidth={1.5} {...props}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconSquare(props: P) {
  return (
    <svg {...base} strokeWidth={1.5} {...props}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />
    </svg>
  );
}

/* Dashboard title bar off the Mac: keep-on-top, more, close (TitleBar.tsx). */
export function IconPin(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 14v7" />
    </svg>
  );
}

export function IconMore(props: P) {
  return (
    <svg {...base} {...props}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* Settings tabs (renderer/components/icons.tsx). */
export function IconSliders(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  );
}

export function IconBell(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconData(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" />
      <path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" />
      <path d="M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
    </svg>
  );
}

export function IconInfo(props: P) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

/* Windows taskbar glyphs, drawn monochrome in the taskbar's own ink. */
export function GlyphStart(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden {...props}>
      <rect x="1.5" y="1.5" width="6" height="6" rx="0.8" />
      <rect x="8.5" y="1.5" width="6" height="6" rx="0.8" />
      <rect x="1.5" y="8.5" width="6" height="6" rx="0.8" />
      <rect x="8.5" y="8.5" width="6" height="6" rx="0.8" />
    </svg>
  );
}

export function GlyphFolder(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M1.8 4.2c0-.6.4-1 1-1h3.4l1.4 1.5h5.6c.6 0 1 .4 1 1v6.6c0 .6-.4 1-1 1H2.8c-.6 0-1-.4-1-1Z" />
      <path d="M1.8 6.6h12.4" />
    </svg>
  );
}

export function GlyphGlobe(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c1.8 1.7 2.7 3.8 2.7 6.2S9.8 12.5 8 14.2C6.2 12.5 5.3 10.4 5.3 8S6.2 3.5 8 1.8Z" />
    </svg>
  );
}

export function GlyphTerminal(props: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="m4.5 6 2 2-2 2M8.5 10.5h3" />
    </svg>
  );
}
