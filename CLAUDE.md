# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

**Always prefer official docs over training-data knowledge.** When behavior is platform- or API-specific (especially Electron/macOS window behavior), read the current docs or the relevant GitHub issue *before* writing code — don't guess at flags or call ordering from memory. Use Context7 (`use context7`) for Electron, React, Vite, Zod, Vitest, tsup, and chokidar; fall back to WebFetch/WebSearch on the official docs and issue tracker for everything else. APIs shift and training data is stale.

## Commands

```bash
npm install               # install all workspaces
npm run dev               # build core, then start desktop with hot reload
npm run build             # build core (tsup) + desktop (electron-vite)
npm start                 # launch the already-built desktop bundle
npm test                  # vitest unit tests (core only)
npm run typecheck         # tsc --noEmit across both workspaces
npm run lint              # ESLint
npm run format            # Prettier write
npm run package           # build + produce an OS installer (electron-builder)
npm run package:dir       # build + unpacked dir (faster, for local smoke tests)
```

Run a single vitest test file: `npx vitest run packages/core/src/__tests__/foo.test.ts`

## Architecture

npm workspaces monorepo with two packages:

- **`packages/core`** (`@claude-widget/core`) — framework-agnostic data layer. Built with **tsup** to dual ESM/CJS + `.d.ts`. No Electron, no React. Unit-tested with vitest.
- **`packages/desktop`** (`@claude-widget/desktop`) — Electron shell (main process + preload) and React renderer. Bundled with **electron-vite**; packaged with **electron-builder**.

`core` is a `devDependency` of `desktop` (bundled at build time). Runtime deps of `core` that need to be bundled by electron-builder (`chokidar`, `zod`) are listed as `dependencies` of `core`.

### The snapshot contract

Everything the UI renders is `UsageSnapshot` (defined in `packages/core/src/types.ts`). It's the sole IPC payload — serializable, typed, crosses Electron's IPC boundary unchanged.

```
UsageSnapshot
├─ local     LocalUsage   — from ~/.claude/projects/**/*.jsonl (offline)
│   ├─ allTime / today / last24h / perModel[]
│   ├─ sessions[] / blocks[] / activeBlock   (~5h windows + burn rate)
│   └─ hourly[]                              (sparkline series)
├─ official  OfficialUsage — from api.anthropic.com (plan limits)
│   └─ windows[]            (used/remaining %, resetsAt)
├─ meta      AccountMeta
└─ health    SnapshotHealth
```

### Data flow

```
~/.claude/projects/**/*.jsonl ─ chokidar watch ─┐
~/.claude/.credentials.json  (OAuth token)       ▼
                                          UsageEngine (core, EventEmitter)
                                                 │ emits 'snapshot'
                                          main process (Electron)
                                                 │ webContents.send (IPC push)
                                          preload bridge (window.claudeWidget)
                                                 │ contextBridge, contextIsolation=true
                                          React renderer → zustand store → components
```

### Core local pipeline (packages/core/src/)

`discover.ts` → `parse.ts` → `aggregate.ts` → `pricing.ts`, orchestrated by `watch.ts` and `engine.ts`.

- **parse.ts** deduplicates on `messageId:requestId` so retries/streaming don't double-count tokens.
- **engine.ts** (`UsageEngine`) keeps a per-file entry map — a file change re-parses only that file.
- **pricing.ts** estimates cost from the bundled table in `pricing.data.ts`; overridable via `pricingOverridePath` config.
- **credentials.ts** reads the OAuth token; `redactCredentials` strips secrets before anything reaches a snapshot or log.

### Configuration

`packages/core/src/config.ts` — a single **zod schema** (`WIDGET_CONFIG_SCHEMA`) is the source of truth for all config fields (data + UI). Invalid fields fall back to defaults individually; a bad config never bricks the app. Config is stored at `userData/config.json` by the desktop's `config-store.ts`.

### IPC / preload

Channel types and the typed bridge interface live in `packages/desktop/src/shared/ipc.ts`. The preload exposes `window.claudeWidget` via `contextBridge` — `contextIsolation: true`, `nodeIntegration: false`. The renderer imports only **types** from `core`/`shared`; nothing from the data layer is bundled into the renderer at runtime.

### Renderer

Zustand store in `packages/desktop/src/renderer/store.ts` subscribes to `onSnapshot`/`onConfig` IPC pushes. Styling is a single CSS file (`styles/index.css`) with CSS-variable theming — dark default, `[data-theme='light']` overrides. The title bar div is the drag region (`-webkit-app-region: drag`); interactive children use `no-drag`.

### TypeScript

Strict mode with `noUncheckedIndexedAccess`, Bundler module resolution, extensionless imports. Main/renderer are typechecked under separate `tsconfig.node.json` / `tsconfig.web.json` projects inside `packages/desktop`.
