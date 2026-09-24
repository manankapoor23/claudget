import type { JSX } from 'react';

interface IconProps {
  size?: number;
}

function svgProps(size: number): JSX.IntrinsicElements['svg'] {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
}

export function SettingsIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

export function PinIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
      <line x1="12" y1="14" x2="12" y2="21" />
    </svg>
  );
}

export function MinusIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function CloseIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function RefreshIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function BackIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function ClickThroughIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      <line x1="13" y1="13" x2="19.5" y2="19.5" />
    </svg>
  );
}

export function ExternalIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function ExpandIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export function MoreIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function CheckIcon({ size = 13 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <polyline points="5 12.5 10 17 19 7" />
    </svg>
  );
}

export function OverviewIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function ActivityIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <line x1="5" y1="20" x2="5" y2="13" />
      <line x1="10" y1="20" x2="10" y2="7" />
      <line x1="15" y1="20" x2="15" y2="10" />
      <line x1="20" y1="20" x2="20" y2="4" />
    </svg>
  );
}

export function SessionsIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </svg>
  );
}

export function InsightsIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </svg>
  );
}

export function FolderIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}

export function CopyIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
    </svg>
  );
}

export function SortIcon({
  size = 10,
  dir,
}: IconProps & { dir: 'asc' | 'desc' | null }): JSX.Element {
  return (
    <svg {...svgProps(size)} strokeWidth={2.4}>
      {dir === 'asc' ? <polyline points="6 15 12 9 18 15" /> : null}
      {dir === 'desc' ? <polyline points="6 9 12 15 18 9" /> : null}
      {dir === null ? <polyline points="8 10 12 6 16 10" opacity="0.5" /> : null}
      {dir === null ? <polyline points="8 14 12 18 16 14" opacity="0.5" /> : null}
    </svg>
  );
}

export function BellIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function DataIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" />
      <path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" />
      <path d="M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
    </svg>
  );
}

export function InfoIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
    </svg>
  );
}
