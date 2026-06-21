# Changelog

All notable changes to claudget. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/). Downloads for each release are on the
[Releases page](https://github.com/manankapoor23/claudget/releases).

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

[0.2.2]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.2
[0.2.1]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.1
[0.2.0]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.0
