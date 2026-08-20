'use strict';

/**
 * Drops the locale bundles the app can't use.
 *
 * Electron ships ~220 Chromium locales. On this app that is ~47 MB — 17% of the
 * installed size — for a UI that only exists in English.
 *
 * electron-builder's own `electronLanguages` option is not enough on macOS: it
 * prunes the 55 app-level `Contents/Resources/*.lproj` stubs (a few KB each) and
 * leaves all 220 `locale.pak` files inside Electron Framework.framework, which is
 * where the weight actually is. So we prune those directly.
 *
 * Chromium falls back to English when a requested locale is absent, which is why
 * every large Electron app (VS Code, Slack, Discord) ships pruned like this.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Locales to keep. `en` is the fallback Chromium uses when one is missing. */
const KEEP = new Set(['en', 'en_US', 'en-US', 'en_GB', 'en-GB']);

/** Strips the extension and normalises separators so both naming styles match. */
function localeOf(name) {
  return name.replace(/\.(lproj|pak)$/, '');
}

function sizeOf(target) {
  const st = fs.statSync(target);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const entry of fs.readdirSync(target)) {
    total += sizeOf(path.join(target, entry));
  }
  return total;
}

/**
 * Removes every entry in `dir` matching `suffix` whose locale isn't in KEEP.
 * Missing directories are ignored — layouts differ per platform and per version,
 * and a missing one means there is nothing to prune, not a failure.
 */
function prune(dir, suffix) {
  if (!fs.existsSync(dir)) return { removed: 0, bytes: 0 };
  let removed = 0;
  let bytes = 0;

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(suffix)) continue;
    if (KEEP.has(localeOf(entry))) continue;

    const target = path.join(dir, entry);
    bytes += sizeOf(target);
    fs.rmSync(target, { recursive: true, force: true });
    removed += 1;
  }
  return { removed, bytes };
}

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const results = [];

  if (electronPlatformName === 'darwin') {
    const appName = `${packager.appInfo.productFilename}.app`;
    const framework = path.join(
      appOutDir,
      appName,
      'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources',
    );
    results.push(prune(framework, '.lproj'));
    // Also the app-level stubs, in case electronLanguages didn't run.
    results.push(prune(path.join(appOutDir, appName, 'Contents/Resources'), '.lproj'));
  } else {
    // Windows and Linux keep them as flat .pak files beside the executable.
    results.push(prune(path.join(appOutDir, 'locales'), '.pak'));
  }

  const removed = results.reduce((n, r) => n + r.removed, 0);
  const bytes = results.reduce((n, r) => n + r.bytes, 0);
  console.log(
    `  • pruned locales  removed=${removed} saved=${(bytes / 1048576).toFixed(1)}MB platform=${electronPlatformName}`,
  );
};
