# Changelog

All notable changes to claudget. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/). Downloads for each release are on the
[Releases page](https://github.com/manankapoor23/claudget/releases).

## [0.2.3] — 2026-08-20

### Fixed

- **Live updates no longer stall while you work (macOS).** The transcript watcher
  combined chokidar's `awaitWriteFinish` with a debounce that restarted on every
  event. An active Claude Code session appends a line every ~250ms, so the file
  never went quiet and the timer never expired — the widget delivered **zero**
  updates for the whole session and only caught up on the 2-minute full rescan.
  It now coalesces into a fixed window and always makes progress.
- **Settings no longer freeze the app (macOS 26).** Every config change re-ran the
  full apply path, including `setLoginItemSettings` (a ~9ms privileged call on
  macOS 26), a tray-menu rebuild, a re-assert of every native window flag, and a
  complete usage-snapshot rebuild pushed over IPC. The opacity slider fires
  ~30–60 changes/second while dragging, which saturated the main process and
  beachballed the window. Each step now runs only when its own field changed
  (~11.5ms → ~0.3ms per event).
- Dropped a pointless privileged `setLoginItemSettings` call on every launch — it
  logged `Operation not permitted` on macOS 26 just to set the default off→off.

## [0.2.2] — 2026-06-20

### Changed

- New claudget app icon and branding across the app (window, tray, installers).

## [0.2.1] — 2026-06-20

### Changed

- Renamed the product to **claudget** — installers are now `claudget-<version>-…`.

## [0.2.0] — 2026-06-20

### Added

- **Glassmorphism redesign** — frosted UI with a single coral accent, light/dark/system.
- **Budgets & alerts** — daily and monthly spend limits with native notifications at 80% and 100%.
- **Spend forecast** ("at this rate"), a **plan-pace badge** (on-track / burning-fast), and an **insights** panel (top project, model split, busiest hour).
- **Auto-update** on Windows & Linux (via GitHub Releases).
- Free cross-platform release pipeline (macOS `.dmg`, Windows `Setup.exe`/Portable, Linux `.AppImage`).

### Fixed

- Stays on top across **every macOS Space** and over fullscreen apps (runs as a menu-bar accessory).
- Guard against an IPC send to a disposed renderer frame on reload/close.

[0.2.3]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.3
[0.2.2]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.2
[0.2.1]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.1
[0.2.0]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.0
