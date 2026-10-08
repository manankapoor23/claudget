#!/usr/bin/env node
// Builds the macOS notch-line helper (native/notch/NotchHelper.swift) as a
// universal (arm64 + x86_64) binary, ad-hoc signed, at
// native/notch/out/claudget-notch. electron-builder packs it into
// claudget.app/Contents/Resources on macOS only (see electron-builder.yml).
//
// It is built, not committed: a checked-in binary can't be reviewed, and the
// build takes a few seconds on any Mac with the Xcode command-line tools.
// On Windows and Linux this is a no-op.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.log('build-notch: not macOS, skipping the notch helper');
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../native/notch');
const src = path.join(dir, 'NotchHelper.swift');
const out = path.join(dir, 'out');
const bin = path.join(out, 'claudget-notch');
const MIN_MACOS = '12.0';

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

let swiftc;
try {
  swiftc = execFileSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' }).trim();
} catch {
  console.error(
    'build-notch: swiftc not found. Install the Xcode command-line tools ' +
      '(`xcode-select --install`) to build the notch-line helper.',
  );
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });
const slices = [];
for (const arch of ['arm64', 'x86_64']) {
  const slice = path.join(out, `claudget-notch-${arch}`);
  run(swiftc, [
    '-O',
    '-swift-version',
    '5',
    '-target',
    `${arch}-apple-macos${MIN_MACOS}`,
    '-sdk',
    execFileSync('xcrun', ['--show-sdk-path', '--sdk', 'macosx'], { encoding: 'utf8' }).trim(),
    '-framework',
    'AppKit',
    '-framework',
    'QuartzCore',
    '-o',
    slice,
    src,
  ]);
  slices.push(slice);
}
run('lipo', ['-create', '-output', bin, ...slices]);
for (const s of slices) fs.rmSync(s, { force: true });
// Apple Silicon refuses to run unsigned code; an ad-hoc signature is enough.
run('codesign', ['--force', '--sign', '-', '--identifier', 'com.claudget.notch', bin]);
run('lipo', ['-info', bin]);
console.log(`build-notch: ${path.relative(process.cwd(), bin)}`);
