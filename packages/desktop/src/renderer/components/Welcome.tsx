import { useState, type JSX } from 'react';
import { PLATFORM } from '../lib/platform';
import { useStore } from '../store';
import { welcomeCopy } from '../../shared/copy';

const KEY = 'claudget-welcome-dismissed';

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** First launch only: where claudget lives and what it reads — then out of the way. */
export function Welcome(): JSX.Element | null {
  const [hidden, setHidden] = useState(dismissed);
  const trayAvailable = useStore((s) => s.appInfo?.trayAvailable ?? true);
  if (hidden) return null;
  const copy = welcomeCopy(PLATFORM, trayAvailable);
  const close = (): void => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Private storage unavailable: it just won't stay dismissed.
    }
    setHidden(true);
  };
  return (
    <section className="welcome" aria-label="Welcome to claudget">
      <h2>{copy.title}</h2>
      <ul>
        {copy.findIt ? <li>{copy.findIt}</li> : null}
        <li>Tokens and sessions come from your local Claude Code transcripts.</li>
        <li>Plan limits come from your Claude login, straight from Anthropic.</li>
        <li>You'll get a heads-up at 80% and 95% of any limit.</li>
      </ul>
      <button type="button" className="btn2 btn2--primary" onClick={close}>
        Got it
      </button>
    </section>
  );
}
