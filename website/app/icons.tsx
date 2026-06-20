/* Minimal, stroke-based SVG icons — no fills, no glow, engineering-drawing feel. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base: P = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
};

/* Brand mark — the widget's bar-chart, drawn as solid bars */
export function LogoMark(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="3" y="14" width="4" height="7" />
      <rect x="9" y="9" width="4" height="12" />
      <rect x="15" y="5" width="4" height="16" />
    </svg>
  );
}

export function IconOverview(props: P) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

export function IconFeatures(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function IconFlow(props: P) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="7" height="6" />
      <rect x="14" y="14" width="7" height="6" />
      <path d="M6.5 10v4h11" />
    </svg>
  );
}

export function IconDownload(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v12M7 11l5 5 5-5M4 21h16" />
    </svg>
  );
}

export function IconLock(props: P) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="10" width="16" height="10" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconOffline(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3l18 18M9 18h6M12 14v4" />
      <path d="M5 9a13 13 0 0 1 4-2.5M19 9a13 13 0 0 0-7-3" />
    </svg>
  );
}

export function IconGauge(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-5" />
    </svg>
  );
}

export function IconLayers(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}

export function IconTheme(props: P) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  );
}

export function IconMoon(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

export function IconBell(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconSearch(props: P) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

export function IconGitHub(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 4.6 3 8.5 7.2 9.9.5.1.7-.2.7-.5v-1.7c-2.9.6-3.5-1.4-3.5-1.4-.5-1.2-1.2-1.5-1.2-1.5-.9-.7.1-.7.1-.7 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.2 0-1.1.4-2.1 1.1-2.8-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 2.9 1.1.8-.2 1.7-.3 2.6-.3.9 0 1.8.1 2.6.3 2-1.4 2.9-1.1 2.9-1.1.6 1.5.2 2.6.1 2.9.7.7 1.1 1.7 1.1 2.8 0 4-2.5 4.9-4.8 5.2.4.3.7 1 .7 2v3c0 .3.2.6.7.5 4.2-1.4 7.2-5.3 7.2-9.9C22.5 6.2 17.8 1.5 12 1.5z" />
    </svg>
  );
}

export function IconApple(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8zM14.2 5.3c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.6-1 1.7-.9 2.7 1 .1 2-.5 2.6-1.2z" />
    </svg>
  );
}

export function IconWindows(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M3 5.5L10.5 4.5V11.3H3V5.5zM11.5 4.4L21 3v8.3h-9.5V4.4zM3 12.3h7.5v6.8L3 18.1V12.3zM11.5 12.3H21V21l-9.5-1.3V12.3z" />
    </svg>
  );
}

export function IconLinux(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2c-2 0-3.2 1.7-3.2 3.8 0 1.3.1 2.1-.5 3.1C7.4 10.4 6 11.9 6 13.8c0 .6.1 1 .3 1.5-.5.6-1.3 1.5-1.3 2.4 0 .7.5 1 1.3 1.2.8.2 1.3.3 1.6.8.4.6 1 1.3 2.3 1.3.8 0 1.4-.3 1.8-.7.4.4 1 .7 1.8.7 1.3 0 1.9-.7 2.3-1.3.3-.5.8-.6 1.6-.8.8-.2 1.3-.5 1.3-1.2 0-.9-.8-1.8-1.3-2.4.2-.5.3-.9.3-1.5 0-1.9-1.4-3.4-2.3-4.9-.6-1-.5-1.8-.5-3.1C15.2 3.7 14 2 12 2zm-1.4 4c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9zm2.8 0c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9z" />
    </svg>
  );
}

export function IconMail(props: P) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="14" />
      <path d="M3 6l9 7 9-7" />
    </svg>
  );
}

export function IconArrow(props: P) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}