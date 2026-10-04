import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { LazyWindow, type WindowLike } from './lazy-window';

class FakeWindow extends EventEmitter implements WindowLike {
  destroyed = false;
  visible = false;
  isDestroyed(): boolean {
    return this.destroyed;
  }
  isVisible(): boolean {
    return this.visible;
  }
  destroy(): void {
    this.destroyed = true;
    this.emit('closed');
  }
  show(): void {
    this.visible = true;
    this.emit('show');
  }
  hide(): void {
    this.visible = false;
    this.emit('hide');
  }
}

function setup(idleDestroyMs?: number) {
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  let created = 0;
  const lazy = new LazyWindow({
    create: () => {
      created += 1;
      return { browser: new FakeWindow() };
    },
    idleDestroyMs,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      (t as { cleared: boolean }).cleared = true;
    },
  });
  const fire = (): void => {
    for (const t of timers.splice(0)) if (!t.cleared) t.fn();
  };
  return { lazy, created: () => created, fire, timers };
}

describe('LazyWindow', () => {
  it('creates nothing until asked, then reuses the one window', () => {
    const { lazy, created } = setup();
    expect(lazy.peek()).toBeNull();
    expect(lazy.isVisible()).toBe(false);
    const a = lazy.get();
    expect(lazy.get()).toBe(a);
    expect(lazy.peek()).toBe(a);
    expect(created()).toBe(1);
  });

  it('runs onCreate once per instance', () => {
    const seen: unknown[] = [];
    const lazy = new LazyWindow({
      create: () => ({ browser: new FakeWindow() }),
      onCreate: (w) => seen.push(w),
    });
    const a = lazy.get();
    lazy.get();
    lazy.destroy();
    const b = lazy.get();
    expect(seen).toEqual([a, b]);
  });

  it('forgets a window that was closed elsewhere and builds a new one', () => {
    const { lazy, created } = setup();
    const a = lazy.get();
    (a.browser as FakeWindow).destroy();
    expect(lazy.peek()).toBeNull();
    expect(lazy.get()).not.toBe(a);
    expect(created()).toBe(2);
  });

  it('destroys a window that stays hidden past the idle limit', () => {
    const { lazy, fire, timers } = setup(60_000);
    const w = lazy.get().browser as FakeWindow;
    w.show();
    w.hide();
    expect(timers[0]?.ms).toBe(60_000);
    fire();
    expect(w.destroyed).toBe(true);
    expect(lazy.peek()).toBeNull();
  });

  it('keeps a window that was shown again before the limit', () => {
    const { lazy, fire } = setup(60_000);
    const w = lazy.get().browser as FakeWindow;
    w.show();
    w.hide();
    w.show();
    fire();
    expect(w.destroyed).toBe(false);
    expect(lazy.isVisible()).toBe(true);
  });

  it('never idles out a window without a limit', () => {
    const { lazy, timers } = setup();
    const w = lazy.get().browser as FakeWindow;
    w.show();
    w.hide();
    expect(timers).toHaveLength(0);
    expect(lazy.peek()).not.toBeNull();
  });

  it('a stale timer from an old instance leaves the new one alone', () => {
    const { lazy, fire } = setup(60_000);
    const old = lazy.get().browser as FakeWindow;
    old.show();
    old.hide();
    lazy.destroy();
    const fresh = lazy.get().browser as FakeWindow;
    fire();
    expect(fresh.destroyed).toBe(false);
  });
});
