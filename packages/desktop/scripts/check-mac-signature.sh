#!/usr/bin/env bash
# Asserts a packaged claudget.app is signed as a whole bundle under its own
# bundle ID. macOS's notification daemon identifies apps by their code
# signature: the old unsigned builds kept Electron's linker signature
# (identifier "Electron", Info.plist unbound) and never registered for
# notifications at all.
#
#   scripts/check-mac-signature.sh release/mac*/claudget.app
set -euo pipefail

want="com.claudget.app"
[ "$#" -gt 0 ] || { echo "usage: $0 <claudget.app>..." >&2; exit 2; }

for app in "$@"; do
  echo "== $app"
  info=$(codesign -dv "$app" 2>&1)
  echo "$info" | grep -E '^(Identifier|Format|CodeDirectory|Signature|Info.plist|Sealed Resources)'
  id=$(echo "$info" | sed -n 's/^Identifier=//p')
  [ "$id" = "$want" ] || { echo "FAIL: identifier is '$id', want '$want'" >&2; exit 1; }
  plist_id=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Contents/Info.plist")
  [ "$plist_id" = "$want" ] || { echo "FAIL: CFBundleIdentifier is '$plist_id'" >&2; exit 1; }
  codesign --verify --deep --strict --verbose=1 "$app"
  echo "ok: $app"
done
