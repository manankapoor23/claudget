# Contributing to claudget

Thanks for your interest in contributing! This guide covers installing dependencies, running the desktop app, and checking changes locally.

## Prerequisites

- Git
- Node.js 20 or newer
- One package manager: npm, pnpm, Bun, or Yarn

Claude Code is **not** required to build or launch the app. The app reads locally saved Claude Code data when available; Anthropic plan limits require a Claude Code login stored on this machine. You do not need an active Claude Code session just to run the app.

## Clone and install

```bash
git clone https://github.com/manankapoor23/claudget.git
cd claudget
```

Choose one package manager and use it consistently in this checkout. `package-lock.json` is the only committed lockfile; pnpm, Bun, and Yarn may generate local lockfiles, which are ignored.

| Package manager | Install dependencies | Start development app |
| --------------- | -------------------- | --------------------- |
| npm             | `npm install`        | `npm run dev`         |
| pnpm 10+        | `pnpm install`       | `pnpm run dev`        |
| Bun             | `bun install`        | `bun run dev`         |
| Yarn            | `yarn install`       | `yarn run dev`        |

The first install or launch may download the Electron runtime, so allow network access. `dev` builds the shared core package and launches Electron with hot reload. Keep the terminal open while developing; press **Ctrl+C** to stop it.

## Build and run

Run these commands from the repository root, using the package manager you chose above:

| Script                  | npm                   | pnpm                   | Bun                   | Yarn                   |
| ----------------------- | --------------------- | ---------------------- | --------------------- | ---------------------- |
| Development app         | `npm run dev`         | `pnpm run dev`         | `bun run dev`         | `yarn run dev`         |
| Build core + desktop    | `npm run build`       | `pnpm run build`       | `bun run build`       | `yarn run build`       |
| Run the built app       | `npm start`           | `pnpm start`           | `bun run start`       | `yarn start`           |
| Package an installer    | `npm run package`     | `pnpm run package`     | `bun run package`     | `yarn run package`     |
| Package an unpacked app | `npm run package:dir` | `pnpm run package:dir` | `bun run package:dir` | `yarn run package:dir` |

The root scripts dispatch into `packages/core` and `packages/desktop` through `scripts/run-workspace.mjs`. This avoids package-manager-specific workspace flags and keeps the same root commands usable with all four package managers.

## Checks before opening a PR

Run the relevant checks before submitting. For a full check, run all four commands using your package manager:

| npm                    | pnpm                    | Bun                    | Yarn                    |
| ---------------------- | ----------------------- | ---------------------- | ----------------------- |
| `npm run typecheck`    | `pnpm run typecheck`    | `bun run typecheck`    | `yarn run typecheck`    |
| `npm run test`         | `pnpm run test`         | `bun run test`         | `yarn run test`         |
| `npm run lint`         | `pnpm run lint`         | `bun run lint`         | `yarn run lint`         |
| `npm run format:check` | `pnpm run format:check` | `bun run format:check` | `yarn run format:check` |

`typecheck` and `test` cover both workspaces. Tests run locally and do not require provider credentials or network access.

## Electron troubleshooting

If Electron reports **“Electron failed to install correctly”**, delete its package directory and download the binary manually from the repository root:

```bash
rm -rf node_modules/electron
npx install-electron --no
```

Then retry the development command. If the install is still broken, remove `node_modules` and reinstall with the same package manager you chose above. Do not switch package managers mid-install.

If the app launches but shows no usage, there may be no Claude Code transcript history on this machine yet. Plan-limit data is separate and requires Claude Code credentials; neither is a prerequisite for building the project.

## Where to start

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains the data flow and package boundaries.
- `packages/core` contains parsing, aggregation, pricing, and tests.
- `packages/desktop` contains the Electron main process and React UI.

Keep pull requests focused, add tests for non-trivial core behavior, and include screenshots for UI changes. Describe what changed and why in the PR, and link a related issue if there is one.
