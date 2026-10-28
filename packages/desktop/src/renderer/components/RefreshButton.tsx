import { useEffect, useRef, useState, type JSX } from 'react';
import { useStore } from '../store';
import { RefreshIcon } from './icons';

/**
 * After a manual refresh, wait this long before allowing another. A manual
 * refresh skips the 3-minute floor on plan-limit checks, and the endpoint is
 * aggressively rate-limited, so repeated clicks must not each become a request.
 */
const COOLDOWN_MS = 10_000;

/** Rescans local transcripts and checks plan limits now (engine.refresh). */
export function RefreshButton({ className }: { className?: string }): JSX.Element {
  const refresh = useStore((s) => s.refresh);
  const [busy, setBusy] = useState(false);
  const [cooling, setCooling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = async (): Promise<void> => {
    if (busy || cooling) return;
    setBusy(true);
    try {
      await refresh();
    } catch {
      // The snapshot carries any error; the button only has to recover.
    } finally {
      setBusy(false);
      setCooling(true);
      timer.current = setTimeout(() => setCooling(false), COOLDOWN_MS);
    }
  };

  return (
    <button
      type="button"
      className={['iconbtn', 'refreshbtn', busy ? 'refreshbtn--busy' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      aria-label={busy ? 'Refreshing' : 'Refresh now'}
      title={busy ? 'Refreshing…' : cooling ? 'Just refreshed' : 'Refresh now'}
      disabled={busy || cooling}
      onClick={() => void run()}
    >
      <RefreshIcon size={14} />
    </button>
  );
}
