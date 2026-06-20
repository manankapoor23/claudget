# Post-Mortem: The Day Every Build Tool Went Silent

**Date:** 2026-06-20
**Impact:** ~A full working session lost. `npm install`, `tsup`, `electron-vite`, and `node` all froze with no output and no error. The app could not be built or launched.
**Root cause:** macOS had offloaded the project's `node_modules` to iCloud. Reading those files hung forever.
**Status:** Resolved — project moved off iCloud to `~/Developer/claudget`.

---

## TL;DR

The project lived on the **Desktop**, which macOS syncs to **iCloud**. The disk hit **90% full**, so macOS quietly *offloaded* thousands of `node_modules` files to iCloud to reclaim space — replacing them with "dataless" placeholders (name and size visible, contents gone). Any tool that tried to **read** one triggered an iCloud download that **hung indefinitely** (made worse by Proton VPN blocking iCloud's servers).

Because the hang happened deep inside file reads, every tool just *stopped* — 0% CPU, no log line, no crash. It looked like a broken build toolchain. It wasn't. The code and tooling were fine the whole time.

---

## Symptoms — what we actually saw

| Symptom | What it looked like |
|---|---|
| `electron-vite dev` | Printed nothing, opened no window, never exited |
| `electron-vite build` | Process alive but **0% CPU**, "sleeping", no child processes, no output |
| `npm install` | "Downloading for a long time" / appeared to hang |
| `cat`, `file`, `head` on certain files | Hung forever on a 722-byte file |
| `ls`, `stat` | **Worked instantly** (metadata is local; only *contents* were gone) |
| Reading files *outside* `node_modules` | **Worked instantly** (the volume was healthy) |

The tell: **metadata operations worked, content reads hung.** That asymmetry is the fingerprint of offloaded (dataless) files.

---

## The investigation — and the wrong turns

We chased several plausible-but-wrong theories before finding it. Worth recording, because each was a reasonable guess:

1. **"Electron binary is corrupt."** `Electron --version` reported `v24.16.0` even though everything said v42.4.1. → **Red herring.** `ELECTRON_RUN_AS_NODE=1` was set, so `--version` printed the *bundled Node* version, not Electron's. Binary was fine.
2. **"node_modules is corrupted from the killed npm install."** → Tested `esbuild` directly: it ran fine. Corruption ruled out.
3. **"It's a quarantine xattr / Gatekeeper scan."** → The xattr was `com.apple.provenance`; stripping it changed nothing.
4. **"An antivirus/EDR agent is scanning file reads."** → It's a personal Mac, no such agent. Ruled out.
5. **The actual cause:** `stat -f '%Sf'` on a hanging file showed the flags `[compressed,dataless]`. Files that read fine showed `[-]`. That was the smoking gun.

We also found two real-but-secondary problems while digging:
- **`ELECTRON_RUN_AS_NODE=1`** inherited from VS Code's terminal — makes Electron launch as headless Node, so no window ever appears even when a build succeeds.
- **Zombie processes** from before a context compaction: 5+ `tsup` and a runaway `npm install` that had deleted the Electron cache, all still running and fighting over files.

---

## Root cause — three layers

```
┌─ Layer 1 (the freeze) ──────────────────────────────────────┐
│ Desktop → iCloud sync + 90% full disk                       │
│   → macOS offloads node_modules to iCloud (dataless files)  │
│   → reading one = synchronous iCloud download = HANG         │
│   → Proton VPN blocks iCloud delivery = hang is permanent    │
└──────────────────────────────────────────────────────────────┘
┌─ Layer 2 (no window) ───────────────────────────────────────┐
│ ELECTRON_RUN_AS_NODE=1 inherited from VS Code                │
│   → Electron runs headless; even successful builds show no UI │
└──────────────────────────────────────────────────────────────┘
┌─ Layer 3 (noise) ───────────────────────────────────────────┐
│ Zombie tsup / npm processes from a prior session             │
│   → extra I/O contention, deleted Electron cache             │
└──────────────────────────────────────────────────────────────┘
```

Layer 1 was the real outage. Layers 2 and 3 made it harder to see.

---

## The fix

Because all committed code was on GitHub and every *uncommitted* edit was still materialized locally (recently written = not offloaded), the clean recovery was:

1. **Verify safety:** `HEAD == origin/main` (everything pushed); all uncommitted files showed `[-]` (local), not dataless.
2. **Free space + remove the broken tree:** deleted `node_modules` (regenerable; deleting dataless files is instant and safe — `unlink` doesn't read contents).
3. **Clone fresh, off iCloud:** `git clone` → `~/Developer/claudget` (outside the synced Desktop). All files local.
4. **Overlay local work:** copied the uncommitted glass-UI edits from the Desktop copy into the clone (they were readable).
5. **Reinstall:** `npm install` finished in **8 seconds** — the same command that had "hung forever" on iCloud. Proof of the diagnosis.
6. **Drop in Electron v42.4.1** binary (pre-downloaded), fix `path.txt` (`Electron.app/Contents/MacOS/Electron`, no leading `dist/` — `index.js` adds it).
7. **Launch:** `unset ELECTRON_RUN_AS_NODE && npm run dev` → frosted-glass widget runs.

---

## How to detect this again (cheat sheet)

```bash
# Is a specific file offloaded to iCloud?
stat -f '%N [%Sf]' path/to/file
#   [-]                   → local, fine
#   [compressed,dataless] → offloaded; reading it will hang

# List every offloaded file in a tree (metadata only, safe, won't hang)
find . -type f -flags +dataless

# Is a stuck process actually working or blocked on a read?
ps -o pid,stat,%cpu,command -p <PID>
#   STAT=S/SN + %CPU=0.0 + no children → blocked on a syscall (often a dataless read)

# Is the poison env var set?
env | grep ELECTRON_RUN_AS_NODE
```

---

## Will this happen again?

**This specific failure — no.** The project now lives in `~/Developer/claudget`, which is **not** synced to iCloud, so macOS will never offload it. The category is closed.

Honest caveats (so this doc doesn't lie to you):

- **Your disk is still ~90% full.** That won't hurt the new location, but it's a general health risk (and it's why iCloud got aggressive in the first place). Clearing space is worth doing.
- **`ELECTRON_RUN_AS_NODE`** will keep being injected by VS Code's terminal. The launch command unsets it, so it's handled — but if you launch Electron some other way and get no window, that's the first thing to check.
- This doesn't make the project immune to *ordinary* bugs (a bad edit, a dependency change). It only closes this one whole class of silent-hang failures.

So: the scary, mysterious, "nothing works and there's no error" class is gone. Normal development errors will still be normal — visible, with messages, fixable.

---

## Prevention checklist

- [x] Project lives outside iCloud-synced folders (`~/Developer/`, not `~/Desktop` or `~/Documents`)
- [x] Launch via `unset ELECTRON_RUN_AS_NODE && npm run dev`
- [ ] Free up disk space (currently ~90% full)
- [ ] Delete the obsolete `~/Desktop/claudget` copy once the new location is confirmed good
- [ ] (Optional) In iCloud settings, turn off "Optimize Mac Storage" if you want to stop offloading entirely

---

## One-line lesson

> **Never keep a `node_modules` (or any project) in an iCloud-synced folder.** On a full disk, macOS will offload it and your tools will hang with no error. Metadata works, reads hang, `stat -f '%Sf'` shows `dataless`.
