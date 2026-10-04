# Architecture

This document describes how the Claude Usage Widget is structured, how data flows from
your machine to the UI, and what each module is responsible for.

## Goals

- **Zero-setup, read-only.** Use what Claude Code already stores; never write to `~/.claude`;
  never leak the OAuth token.
- **Resilient.** A malformed transcript line, a missing field, a rate-limited endpoint, or a
  hand-edited config must never crash the app or blank the UI.
- **Separation of concerns.** A framework-agnostic data core that knows nothing about
  Electron or React, behind a single serializable snapshot type.

## Monorepo

npm workspaces, two packages:

```
packages/core      @claude-widget/core    — data layer (no Electron, no React)
packages/desktop   @claude-widget/desktop — Electron shell + React renderer
```

`core` is built with **tsup** to dual ESM/CJS plus `.d.ts`. The desktop main process bundles
`core` at build time (electron-vite), so `core` is a _devDependency_ of `desktop`; the
runtime-external native-ish deps (`chokidar`, `zod`) are real _dependencies_ so
electron-builder includes them.

## The snapshot contract

Everything the UI renders is one plain-JSON object, [`UsageSnapshot`](../packages/core/src/types.ts):

```
UsageSnapshot
├─ generatedAt, schemaVersion
├─ local     LocalUsage     — derived from transcripts (offline-capable)
│   ├─ allTime / today / last24h    (tokens + estimated cost + request count)
│   ├─ perModel[]                   (per-model breakdown)
│   ├─ sessions[] / activeSessions[]
│   ├─ blocks[] / activeBlock       (~5h windows + burn rate + projection)
│   ├─ hourly[]                     (sparkline series)
│   └─ stats                        (files, entries, scan duration)
├─ official  OfficialUsage  — from api.anthropic.com (plan limits)
│   ├─ status / available / stale
│   ├─ windows[]                    (five_hour, seven_day, … : used/remaining %, resetsAt)
│   └─ message
├─ meta      AccountMeta    — subscriptionType, rateLimitTier, claudeDir, cliVersion …
└─ health    SnapshotHealth — localOk / officialOk + last errors
```

Keeping it serializable means it crosses the Electron IPC boundary unchanged (and could
cross a VS Code webview boundary later without transformation).

## Data flow

```
~/.claude/projects/**/*.jsonl ──watch──┐
                                       ▼
                              ┌──────────────────┐      ┌──────────────────────────┐
~/.claude/.credentials.json ─▶│   UsageEngine    │◀────▶│ api.anthropic.com         │
       (OAuth token)          │  (core)          │ poll │ /api/oauth/usage          │
                              └────────┬─────────┘      └──────────────────────────┘
                                       │ emits 'snapshot'
                                       ▼
                          main process (Electron)
                                       │ webContents.send (IPC push)
                                       ▼
                          preload bridge  (window.claudeWidget)
                                       │
                                       ▼
                          React renderer (zustand store → components)
```

### Local pipeline (core)

1. **discover** ([`discover.ts`](../packages/core/src/discover.ts)) — find every transcript
   `.jsonl` under `~/.claude/projects` (including subagent/sidechain transcripts; excludes
   `journal.jsonl`).
2. **parse** ([`parse.ts`](../packages/core/src/parse.ts)) — turn each line into a normalized
   `UsageEntry`. Skips non-assistant, synthetic, zero-token, and malformed lines. Dedup key
   is `messageId:requestId` so retries/streaming don't double-count.
3. **aggregate** ([`aggregate.ts`](../packages/core/src/aggregate.ts)) — fold entries into the
   `LocalUsage` shape: totals, per-model, sessions, ~5h blocks (with burn rate + projection
   for the active block), and the hourly series.
4. **price** ([`pricing.ts`](../packages/core/src/pricing.ts)) — estimate cost from a bundled
   per-model price table (`pricing.data.ts`), overridable via `pricingOverridePath`.
5. **watch** ([`watch.ts`](../packages/core/src/watch.ts)) — `chokidar` watches the transcript
   tree with native events (FSEvents on macOS, no polling). Changes are batched with a 200 ms
   trailing debounce capped by `localDebounceMs` (max wait, default 1 s) so a streaming session
   still updates every second, plus one confirmation re-read after each batch because chokidar
   drops a `change` that lands within 50 ms of the previous one. A periodic full rescan
   (`fullRescanIntervalMs`) catches new projects and missed FS events.
6. **read** ([`transcript-store.ts`](../packages/core/src/transcript-store.ts)) — a
   `TranscriptStore` keeps, per file, a byte offset, the parser state (cwd, branch, title) and
   the parsed entries. An unchanged file (same inode, size and mtime) is not opened; a grown one
   is streamed from its offset in 256 KB chunks, so neither a file nor a delta is ever held
   whole. A torn last line waits for its newline; a truncated or replaced file is re-read from
   the start; lines over 64 KB are only scanned for usage markers and read back only if they
   carry usage. Reads of one file are serialised, so a watcher batch and a rescan never parse
   the same bytes twice.

The engine keeps only the compact parsed entries per file, so a change to one transcript costs
the size of the new lines, and a rescan that finds nothing new costs a stat per file.

### Official pipeline (core)

- **credentials** ([`credentials.ts`](../packages/core/src/credentials.ts)) — reads
  `~/.claude/.credentials.json`. `redactCredentials` strips everything except non-secret
  metadata before any value can reach a snapshot or log.
- **client** ([`official/client.ts`](../packages/core/src/official/client.ts)) — calls the
  usage endpoint with a `claude-code/<cliVersion>` User-Agent. Reads the token fresh on each
  call, skips when it's expired, caches the last good result, and backs off on HTTP 429
  (honouring `Retry-After`). The access token is used only as a bearer to `api.anthropic.com`.
- **schedule** ([`official/schedule.ts`](../packages/core/src/official/schedule.ts)) — decides
  when to poll: every `officialPollIntervalMs` when idle; 30 s after local usage resumes and
  then every 180 s while it continues; on wake and when the popover opens if the last check is
  ≥180 s old. No automatic trigger polls sooner than 180 s after the previous attempt or
  before a backoff ends; only a manual Refresh does.
- **normalize** ([`official/normalize.ts`](../packages/core/src/official/normalize.ts)) —
  defensively maps the endpoint's payload (multiple possible shapes) into `OfficialWindow[]`.
- **estimate** ([`estimate/`](../packages/core/src/estimate)) — the live % between checks.
  Each fresh reading calibrates a rate k = Δutilisation / Δweight per limit, where weight is
  the API-equivalent cost of local requests; a window's first record is anchored at its start
  (0%), so one reading is enough, and records span at most 5 hours. k is the weight-weighted
  median of the last 8 records and persists in `limit-calibration.json` in userData. The
  engine attaches `window.estimate` = reading + 0.9 × k × weight since the reading (at most
  +15 points, at most 100%; after `resetsAt`, 0 plus usage since the reset) only when it
  changes the whole-number %. `windows[].utilization` itself always stays Anthropic's number;
  alerts and the limit history read only that.

### Engine

[`UsageEngine`](../packages/core/src/engine.ts) (`extends EventEmitter`, with typed
`on`/`emit` overloads) orchestrates both pipelines and is the single thing the shell talks to.

- `start()` / `stop()` — begin/stop watching and polling.
- `refresh()` — force an immediate local + official refresh.
- `fullRescan()` — re-read everything (also refreshes account meta).
- `getSnapshot()` — current snapshot synchronously.
- `updateConfig(patch)` — apply a config change live (re-tunes intervals, etc.).
- Emits `'snapshot'` on every recompute and `'error'` for non-fatal failures.

## Desktop shell (main process)

- [`index.ts`](../packages/desktop/src/main/index.ts) — `bootstrap()`: single-instance lock,
  config store, logger, CLI-version detection, engine, window, tray, IPC, global shortcuts.
  Wires `engine 'snapshot'` → `webContents.send`. Closing the window hides to tray; the app
  stays resident.
- [`window.ts`](../packages/desktop/src/main/window.ts) — `WidgetWindow`: frameless,
  transparent, always-on-top `BrowserWindow`. Owns mode/state — always-on-top, click-through
  (`setIgnoreMouseEvents`), opacity, taskbar visibility, compact sizing — and persists bounds
  to `window-state.json` (off-screen positions are recovered).
- [`tray.ts`](../packages/desktop/src/main/tray.ts) — tray icon + menu mirroring the toggles.
- [`config-store.ts`](../packages/desktop/src/main/config-store.ts) — JSON config at
  `userData/config.json` via the core `resolveConfig`/`mergeConfig` (field-by-field salvage).
- [`logger.ts`](../packages/desktop/src/main/logger.ts) — file + console sinks with rotation.
- [`ipc.ts`](../packages/desktop/src/main/ipc.ts) — registers all `ipcMain.handle` handlers.

### IPC & preload

Renderer↔main is **invoke/handle** for requests, plus **push** events for live updates.
Channels and the typed bridge interface live in
[`shared/ipc.ts`](../packages/desktop/src/shared/ipc.ts). The
[preload](../packages/desktop/src/preload/index.ts) exposes a single object,
`window.claudeWidget`, via `contextBridge` — with `contextIsolation: true`,
`nodeIntegration: false`. The renderer never touches Node or Electron directly.

```
getSnapshot / getConfig / setConfig / refresh / getAppInfo
windowAction / openLogs / openConfigFile        (request → response)
onSnapshot(cb) / onConfig(cb)                    (push subscriptions)
```

## Renderer (React)

- **State** — a small [zustand store](../packages/desktop/src/renderer/store.ts) holds the
  snapshot, config, and app info; it subscribes to `onSnapshot`/`onConfig` pushes and exposes
  `updateConfig`/`refresh`. The renderer imports only **types** from `core`/`shared` so nothing
  from the data layer is bundled into the UI at runtime.
- **Composition** — [`App.tsx`](../packages/desktop/src/renderer/App.tsx) handles
  init, theme resolution (`system` → `prefers-color-scheme`), compact-class toggling, and the
  loading/error/empty states, then renders the title bar, the active view, and the footer.
- **Views** — full dashboard (`OfficialPanel`, `LocalPanel`, `SessionList`), `CompactView`,
  and `Settings`. Presentational pieces: `RadialGauge`, `ProgressBar`, `Sparkline`, `StatCard`,
  `Countdown`, `States` (incl. an `ErrorBoundary`), and `icons`.
- **Styling** — one CSS file with CSS-variable theming (`[data-theme='light']` overrides a
  dark default). The title bar is the drag region (`-webkit-app-region`); interactive controls
  opt out with `no-drag`.

## Error handling & resilience

- **Parsing** tolerates malformed/partial lines and skips them.
- **Config** validates field-by-field; a bad value falls back to its default.
- **Official endpoint** failures degrade to **Cached** data with a human-readable status; local
  data is unaffected.
- **Window position** is validated against current displays and recovered if off-screen.
- **Renderer** is wrapped in an `ErrorBoundary` so a render fault shows a retry, not a blank
  window.
- **Health** (`SnapshotHealth`) surfaces the last local/official error in the footer dot.

## Configuration & strict typing

A single [zod schema](../packages/core/src/config.ts) is the source of truth for both data and
UI fields. TypeScript runs in strict mode with `noUncheckedIndexedAccess`, Bundler module
resolution, and extensionless imports; the desktop renderer/main are typechecked under separate
`tsconfig.web.json` / `tsconfig.node.json` projects.

## Testing

`core` is unit-tested with **vitest** — parsing, aggregation, pricing, config salvage, and the
official normalizer/client (with a mocked `fetch`, so no live endpoint calls). Run `npm test`.
