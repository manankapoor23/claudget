import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import { formatCompact } from '../lib/format';
import { useTheme } from '../lib/theme';
import { useBump } from '../lib/motion';
import { limitLabel, rankLimits, toneOf, verdictFor } from '../../shared/limits';
import { anchorFor, anchorShift, type Anchor, type Rect } from '../../shared/pill';
import { Countdown } from './Countdown';
import { CompactBar, CompactView } from './CompactView';

/** A press that travels further than this is a drag, not a click. */
const DRAG_THRESHOLD_PX = 3;
const ANCHOR_KEY = 'claudget.pill.anchor';

function savedAnchor(): Anchor | null {
  try {
    const a = JSON.parse(localStorage.getItem(ANCHOR_KEY) ?? 'null') as Anchor | null;
    if ((a?.x === 'left' || a?.x === 'right') && (a.y === 'top' || a.y === 'bottom')) return a;
  } catch {
    // Unreadable storage: fall back to the window's position below.
  }
  return null;
}

/**
 * The corner to start in. It's remembered rather than re-derived, because
 * near the middle of the screen both corners are self-consistent and picking
 * the other one would put the pill a hundred pixels from where it was left.
 */
function initialAnchor(): Anchor {
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  return (
    savedAnchor() ??
    anchorFor(
      {
        x: window.screenX,
        y: window.screenY,
        width: window.innerWidth,
        height: window.innerHeight,
      },
      {
        x: scr.availLeft ?? 0,
        y: scr.availTop ?? 0,
        width: scr.availWidth,
        height: scr.availHeight,
      },
    )
  );
}

/** The pill's rectangle on screen, and the work area of the screen it's on. */
function geometry(shell: HTMLElement): { pill: Rect; workArea: Rect } {
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    pill: {
      x: window.screenX + shell.offsetLeft,
      y: window.screenY + shell.offsetTop,
      width: shell.offsetWidth,
      height: shell.offsetHeight,
    },
    workArea: {
      x: scr.availLeft ?? 0,
      y: scr.availTop ?? 0,
      width: scr.availWidth,
      height: scr.availHeight,
    },
  };
}

/** Slack between the pill and its window: how far it travels between corners. */
function roomIn(shell: HTMLElement): { x: number; y: number } {
  const win = shell.parentElement!;
  const cs = getComputedStyle(win);
  return {
    x:
      win.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight) -
      shell.offsetWidth,
    y:
      win.clientHeight -
      parseFloat(cs.paddingTop) -
      parseFloat(cs.paddingBottom) -
      shell.offsetHeight,
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
  const [anchor, setAnchor] = useState<Anchor>(initialAnchor);
  const anchorRef = useRef(anchor);
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

  /**
   * After a drop, face the card toward the middle of the screen. Switching
   * corners moves the pill inside its window, so the window moves the other
   * way by the same amount and the pill stays exactly where it was dropped.
   */
  const reanchor = useCallback((): void => {
    const el = shell.current;
    if (!el) return;
    const { pill, workArea } = geometry(el);
    const prev = anchorRef.current;
    const next = anchorFor(pill, workArea);
    if (prev.x === next.x && prev.y === next.y) return;
    const shift = anchorShift(prev, next, roomIn(el));
    void bridge?.windowAction({ type: 'pill-nudge', dx: shift.x, dy: shift.y });
    anchorRef.current = next;
    setAnchor(next);
    try {
      localStorage.setItem(ANCHOR_KEY, JSON.stringify(next));
    } catch {
      // Only costs remembering the corner across restarts.
    }
  }, [bridge]);

  const endDrag = useCallback((): void => {
    const p = press.current;
    press.current = null;
    if (!p?.drag) return;
    setDragging(false);
    void bridge?.windowAction({ type: 'pill-drag', phase: 'end' });
    // Let the last move land before measuring where the pill is.
    window.setTimeout(reanchor, 60);
  }, [bridge, reanchor]);

  // Main moves the window until told to stop, so every way a press can end
  // has to say so — a lost release is a pill glued to the cursor (#15).
  useEffect(() => {
    window.addEventListener('blur', endDrag);
    return () => window.removeEventListener('blur', endDrag);
  }, [endDrag]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { x: e.screenX, y: e.screenY, offX: e.clientX, offY: e.clientY, drag: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const p = press.current;
    if (!p) return;
    // The button came up without a pointerup reaching us.
    if ((e.buttons & 1) === 0) {
      endDrag();
      return;
    }
    if (p.drag) return;
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
    if (!p) return;
    if (p.drag) {
      endDrag();
    } else {
      press.current = null;
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
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
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
