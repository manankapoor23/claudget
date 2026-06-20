# context.md — start here

Quick orientation for a new session. For deep architecture see [CLAUDE.md](CLAUDE.md); for the iCloud incident see [POSTMORTEM.md](POSTMORTEM.md).

## Where things are

- **Canonical project location: `~/Developer/claudget`** (this folder). Work here.
- It used to live at `~/Desktop/claudget` — **that copy was deleted on 2026-06-20.** Do not recreate it. Never put this project in `~/Desktop` or `~/Documents` (they sync to iCloud → `node_modules` gets offloaded → all build tools hang silently). See POSTMORTEM.md.
- Remote: `github.com/manankapoor23/claudget`, branch `main`.

## What this is

Claude Usage Widget — an always-on-top Electron desktop widget showing Claude Code usage. npm-workspaces monorepo: `packages/core` (data layer, tsup) + `packages/desktop` (Electron + React, electron-vite). Everything the UI renders is one `UsageSnapshot` pushed over IPC.

## Run it

```bash
cd ~/Developer/claudget
unset ELECTRON_RUN_AS_NODE && npm run dev
```

- **`unset ELECTRON_RUN_AS_NODE` is required.** VS Code's terminal injects `ELECTRON_RUN_AS_NODE=1`, which makes Electron boot headless (builds succeed but no window appears). Always unset it before launching.
- Other commands: `npm run build`, `npm test` (core only), `npm run typecheck`, `npm run package`.

## Current state (2026-06-20)

- **Running** with the new **glass / frosted UI** — single coral accent `#FF7F57`, `backdrop-filter` blur on a transparent always-on-top window. Main file: `packages/desktop/src/renderer/styles/index.css`.
- **Electron upgraded `^33` → `^42`** (v42.4.1) — required for macOS 26 (Darwin 25.x); v33 wouldn't initialize.
- Backward-compat CSS aliases (`--orange`, `--paper-3`) keep RadialGauge/ProgressBar working unchanged. Sparkline uses `var(--accent)`.
- All glass-UI work is **uncommitted** (working tree). HEAD = `84e7082`.

## Environment gotchas

- **iCloud offloading** — if any tool hangs at 0% CPU with no output, check `stat -f '%Sf' <file>`; `[compressed,dataless]` = file offloaded to iCloud. Shouldn't happen here (off iCloud now), but the disk runs ~90% full.
- **`ELECTRON_RUN_AS_NODE`** — see Run section.
- **Electron `path.txt`** — must be `Electron.app/Contents/MacOS/Electron` (no leading `dist/`; npm's `index.js` adds it).

## Pending work

- Iterate on the glass UI to taste (it's live; confirm it looks right).
- **Commit & push** the glass-UI changes. **No Claude attribution in commit messages** (user constraint).
- Free disk space (~90% full).
- Website "Download" button routes to an empty GitHub releases page.
- `website/` throws ~11k errors under root `eslint .` — exclude it from root ESLint.

## House rules

- Use **Context7** (`use context7`) for current docs on Electron/React/Vite/Zod/Vitest/tsup/chokidar before writing code against them (per CLAUDE.md).
- Ponytail mode is the working style: shortest correct diff, no over-engineering.
