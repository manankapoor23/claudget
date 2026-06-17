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
