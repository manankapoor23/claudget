/**
 * The slice of BrowserWindow a {@link LazyWindow} needs. Kept structural so
 * the lifecycle logic is testable without Electron.
 */
export interface WindowLike {
  isDestroyed(): boolean;
  isVisible(): boolean;
  destroy(): void;
  on(event: 'show' | 'hide' | 'closed', listener: () => void): unknown;
}

export interface Surface<W extends WindowLike = WindowLike> {
  readonly browser: W;
}

export interface LazyWindowOptions<T> {
  create: () => T;
  /** Runs once per created instance, before `get()` returns it. */
  onCreate?: (instance: T) => void;
  /**
   * Destroy the window once it has stayed hidden this long (ms). Each window
   * is a renderer process (~40-50 MB); a hidden one costs as much as a shown
   * one. Omit to keep the window for the app's lifetime once created.
   */
  idleDestroyMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * A window that exists only while it's wanted: created on first `get()`,
 * optionally destroyed after sitting hidden for a while, and created again on
 * the next `get()`. Callers that only want to talk to it if it's there use
 * `peek()`, so a push or a config change never conjures a window up.
 */
export class LazyWindow<T extends Surface> {
  private instance: T | null = null;
  private idleTimer: unknown = null;
  private readonly opts: LazyWindowOptions<T>;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(opts: LazyWindowOptions<T>) {
    this.opts = opts;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** The window, created now if it doesn't exist. */
  get(): T {
    const live = this.peek();
    if (live) return live;
    const instance = this.opts.create();
    this.instance = instance;
    const win = instance.browser;
    win.on('closed', () => {
      if (this.instance === instance) {
        this.instance = null;
        this.cancelIdle();
      }
    });
    if (this.opts.idleDestroyMs !== undefined) {
      win.on('show', () => this.cancelIdle());
      win.on('hide', () => this.scheduleIdle(instance));
    }
    this.opts.onCreate?.(instance);
    return instance;
  }

  /** The window if it exists, without creating it. */
  peek(): T | null {
    return this.instance && !this.instance.browser.isDestroyed() ? this.instance : null;
  }

  /** True when the window exists and is on screen. */
  isVisible(): boolean {
    return this.peek()?.browser.isVisible() ?? false;
  }

  destroy(): void {
    const live = this.peek();
    this.instance = null;
    this.cancelIdle();
    live?.browser.destroy();
  }

  private scheduleIdle(instance: T): void {
    this.cancelIdle();
    const ms = this.opts.idleDestroyMs;
    if (ms === undefined) return;
    this.idleTimer = this.setTimer(() => {
      this.idleTimer = null;
      if (this.instance !== instance) return;
      if (!instance.browser.isDestroyed() && !instance.browser.isVisible()) this.destroy();
    }, ms);
  }

  private cancelIdle(): void {
    if (this.idleTimer !== null) this.clearTimer(this.idleTimer);
    this.idleTimer = null;
  }
}
