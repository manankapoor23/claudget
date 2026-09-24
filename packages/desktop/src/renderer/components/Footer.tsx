import { useEffect, useState, type JSX } from 'react';
import type { SnapshotHealth } from '@claude-widget/core';
import { formatRelative } from '../lib/format';

interface FooterProps {
  localUpdatedAt: number | null;
  health: SnapshotHealth;
  officialEnabled: boolean;
}

export function Footer({ localUpdatedAt, health, officialEnabled }: FooterProps): JSX.Element {
  const [, setTick] = useState(0);

  // Re-render once a second so the "updated Ns ago" label stays current.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const officialBad = officialEnabled && !health.officialOk;
  const dotClass = !health.localOk
    ? 'footer__dot footer__dot--bad'
    : officialBad
      ? 'footer__dot footer__dot--warn'
      : 'footer__dot';

  const title = !health.localOk
    ? (health.lastLocalError ?? 'Local read error')
    : officialBad
      ? (health.lastOfficialError ?? 'Plan-limit check failed')
      : 'Up to date';

  return (
    <div className="footer">
      <span className={dotClass} title={title} />
      <span>
        {localUpdatedAt === null
          ? 'Waiting for usage data'
          : 'Updated ' + formatRelative(localUpdatedAt)}
      </span>
    </div>
  );
}
