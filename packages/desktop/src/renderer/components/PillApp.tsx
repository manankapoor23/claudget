import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import { formatCompact } from '../lib/format';
import { useTheme } from '../lib/theme';
import { useBump } from '../lib/motion';
import { limitLabel, rankLimits, toneOf, verdictFor } from '../../shared/limits';
import { Countdown } from './Countdown';
import { CompactBar, CompactView } from './CompactView';

/** A press that travels further than this is a drag, not a click. */
const DRAG_THRESHOLD_PX = 3;

type Anchor = { x: 'left' | 'right'; y: 'top' | 'bottom' };

/**
 * Which corner of the (fixed-size, transparent) window the pill sits in, so
 * the card always opens toward the middle of the screen, never off its edge.
 */
function anchorFor(): Anchor {
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  const left = scr.availLeft ?? 0;
  const top = scr.availTop ?? 0;
  const cx = window.screenX + window.innerWidth / 2;
  const cy = window.screenY + window.innerHeight / 2;
  return {
    x: cx > left + scr.availWidth / 2 ? 'right' : 'left',
    y: cy > top + scr.availHeight / 2 ? 'bottom' : 'top',
  };
}

/**
 * The floating pill. One element morphs between the pill and the compact card
 * with a CSS transition — the window itself never resizes, which is what keeps
 * the animation smooth. Drag it from anywhere; a click (no movement) opens it,
 * and clicking again, pressing Esc, or clicking elsewhere folds it back.
 */
export function PillApp(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot);
  const config = useStore((s) => s.config);
  useTheme(config?.theme);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>(() => anchorFor());
  const shell = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; offX: number; offY: number; drag: boolean } | null>(
    null,
  );
  const capturing = useRef(false);
  const bridge = getBridge();

  // Clicks on the transparent part of the window pass through to the desktop;
  // only the pill itself takes the mouse.
  const setCapture = useCallback(
    (on: boolean): void => {
      if (capturing.current === on) return;
      capturing.current = on;
      bridge?.setIgnoreMouse(!on);
    },
    [bridge],
  );
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (press.current) return; // mid-press: keep the mouse until release
      const over = !!shell.current?.contains(document.elementFromPoint(e.clientX, e.clientY));
      setCapture(over);
    };
    const onBlur = (): void => setOpen(false);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKey);
    };
  }, [setCapture]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { x: e.screenX, y: e.screenY, offX: e.clientX, offY: e.clientY, drag: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const p = press.current;
    if (!p || p.drag) return;
    if (Math.hypot(e.screenX - p.x, e.screenY - p.y) < DRAG_THRESHOLD_PX) return;
    p.drag = true;
    setDragging(true);
    void bridge?.windowAction({
      type: 'pill-drag',
      phase: 'start',
      offsetX: p.offX,
      offsetY: p.offY,
    });
  };
  const onPointerUp = (): void => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.drag) {
      setDragging(false);
      void bridge?.windowAction({ type: 'pill-drag', phase: 'end' });
      // The window has moved; re-aim which way the card will open.
      window.setTimeout(() => setAnchor(anchorFor()), 60);
    } else {
      setAnchor(anchorFor());
      setOpen((o) => !o);
    }
  };

  const ranked = snapshot?.official.available ? rankLimits(snapshot.official.windows) : null;
  const verdict = ranked && snapshot ? verdictFor(ranked, snapshot.generatedAt) : null;
  const tone = verdict?.tone ?? 'ok';
  const primary = ranked?.primary ?? null;
  const bump = useBump(primary ? Math.round(primary.utilization * 100) : 0);

  return (
    <div className="pillwin" data-ax={anchor.x} data-ay={anchor.y}>
      <div
        ref={shell}
        className={`pshell${open ? ' pshell--open' : ''}${dragging ? ' pshell--drag' : ''}${bump ? ' is-bump' : ''}`}
        data-tone={tone}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        aria-expanded={open}
        aria-label={open ? 'Collapse' : 'Expand'}
      >
        <div className="pshell__pill" aria-hidden={open}>
          <span className="pill__dot" data-tone={primary ? toneOf(primary.utilization) : 'ok'} />
          {primary ? (
            <span className="pill__text">
              <span className="pill__label">{limitLabel(primary.label)}</span>
              {/* The number wears its own limit's colour; the ring wears the verdict. */}
              <b data-tone={toneOf(primary.utilization)}>
                {Math.round(primary.utilization * 100)}%
              </b>
              {primary.resetsAt !== null ? (
                <span className="pill__reset">
                  <Countdown resetsAt={primary.resetsAt} fallback="—" short />
                </span>
              ) : null}
            </span>
          ) : (
            <span className="pill__text">
              <b>{snapshot ? formatCompact(snapshot.local.today.tokens.total) : '—'}</b>
              <span className="pill__label">today</span>
            </span>
          )}
        </div>
        <div className="pshell__card" aria-hidden={!open}>
          {snapshot && config ? (
            <div className="app app--compact" data-tone={tone} data-view="main">
              <CompactBar />
              <CompactView snapshot={snapshot} currency={config.currency} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
