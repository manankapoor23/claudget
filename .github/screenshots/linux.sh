#!/usr/bin/env bash
# Runs the packaged Linux build on a virtual X display and screenshots it the
# way a user would meet it. Two sessions:
#
#   linux-tray    Xfce (xfwm4 + xfce4-panel with the systray plugin, which
#                 hosts both StatusNotifierItem and XEmbed icons). Compositor
#                 on, then off, to see whether transparent windows go black.
#   linux-notray  Same window manager, no panel at all — what a stock GNOME
#                 user (no AppIndicator extension) gets.
#
# Everything is driven from outside the app: xdotool for the real tray and
# keyboard, the DevTools port (cdp.mjs) for in-window buttons. No step aborts
# the run; whatever fails is visible in the screenshots and summary.txt.
#
#   linux.sh <linux-unpacked dir> <AppImage> <output dir>
set -uo pipefail

UNPACKED=$(realpath "$1")
APPIMAGE=$(realpath "$2")
OUT=$(realpath -m "$3")
HERE=$(dirname "$(realpath "$0")")
APP="$UNPACKED/claudget"
W=1920
H=1080
export DISPLAY=:99
export NO_AT_BRIDGE=1
CDP=(node --experimental-websocket "$HERE/cdp.mjs")

mkdir -p "$OUT/linux-tray" "$OUT/linux-notray" "$OUT/logs"
SUMMARY="$OUT/logs/summary-linux.txt"
note() { echo "$*" | tee -a "$SUMMARY"; }

shot() { import -window root "$OUT/$1.png" && echo "shot $1"; }
# crop <src> <dst> <geometry> [scale%]
crop() { convert "$OUT/$1.png" -crop "$3" +repage -filter point -resize "${4:-100}%" "$OUT/$2.png"; }

user_data_dirs() { echo "$HOME/.config/claudget" "$HOME/.config/@claude-widget/desktop"; }
reset_app_state() { for d in $(user_data_dirs); do rm -rf "$d"; done; }
collect_logs() { # collect_logs <label>
  for d in $(user_data_dirs); do
    [ -d "$d" ] || continue
    note "userData for $1: $d"
    find "$d" -maxdepth 2 \( -name '*.log' -o -name '*.json' -o -name welcomed \) -print \
      | while read -r f; do cp "$f" "$OUT/logs/$1-$(basename "$f")"; done
  done
}

APP_PID=
launch() { # launch <label>
  "$APP" --no-sandbox --remote-debugging-port=9222 >>"$OUT/logs/$1-stdout.log" 2>&1 &
  APP_PID=$!
  note "launched claudget pid $APP_PID ($1)"
}
quit_app() {
  pkill -x claudget 2>/dev/null
  sleep 2
  pkill -9 -x claudget 2>/dev/null
  true
}
alive() { kill -0 "$APP_PID" 2>/dev/null; }

# The tray icon is drawn by the panel, not a window we can query, so find it
# in pixels: the bounding box of the logo's orange inside the panel strip.
#   tray_icon_center <strip top y>   → prints "x y"
tray_icon_center() {
  import -window root -crop "${W}x${PANEL}+0+$1" +repage -depth 8 ppm:- 2>/dev/null | python3 -c '
import sys
y0 = int(sys.argv[1])
data = sys.stdin.buffer.read()
parts = data.split(b"\n", 3)  # P6, "w h", maxval, pixels
w, h = map(int, parts[1].split())
px = parts[3]
hits = []
for y in range(h):
    for x in range(w // 2, w):
        i = (y * w + x) * 3
        r, g, b = px[i], px[i + 1], px[i + 2]
        if r > 180 and r - b > 90 and g < 200:
            hits.append((x, y))
if not hits:
    sys.exit(1)
xs = [p[0] for p in hits]; ys = [p[1] for p in hits]
print((min(xs) + max(xs)) // 2, y0 + (min(ys) + max(ys)) // 2)
' "$1"
}

# ── Display, session bus, Xfce pieces ───────────────────────────────────────
Xvfb :99 -screen 0 ${W}x${H}x24 +extension Composite +extension RANDR -nolisten tcp &
sleep 2
eval "$(dbus-launch --sh-syntax)"
export DBUS_SESSION_BUS_ADDRESS

PANEL=32
mkdir -p "$HOME/.config/xfce4/xfconf/xfce-perchannel-xml"
cat >"$HOME/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-panel" version="1.0">
  <property name="configver" type="int" value="2"/>
  <property name="panels" type="array">
    <value type="int" value="1"/>
    <property name="panel-1" type="empty">
      <property name="position" type="string" value="p=6;x=0;y=0"/>
      <property name="length" type="uint" value="100"/>
      <property name="position-locked" type="bool" value="true"/>
      <property name="size" type="uint" value="$PANEL"/>
      <property name="plugin-ids" type="array">
        <value type="int" value="1"/>
        <value type="int" value="2"/>
        <value type="int" value="3"/>
      </property>
    </property>
  </property>
  <property name="plugins" type="empty">
    <property name="plugin-1" type="string" value="applicationsmenu"/>
    <property name="plugin-2" type="string" value="separator">
      <property name="expand" type="bool" value="true"/>
      <property name="style" type="uint" value="0"/>
    </property>
    <property name="plugin-3" type="string" value="systray"/>
  </property>
</channel>
XML

xfdesktop >/dev/null 2>&1 &
xfwm4 --compositor=on >"$OUT/logs/xfwm4.log" 2>&1 &
sleep 2
xfce4-panel >"$OUT/logs/xfce4-panel.log" 2>&1 &
sleep 6

note "kernel.apparmor_restrict_unprivileged_userns=$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo n/a)"
note "libfuse.so.2 present: $(ldconfig -p | grep -q 'libfuse.so.2' && echo yes || echo no)"
note "StatusNotifierWatcher on the bus: $(dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | grep -c StatusNotifierWatcher)"

# ── Pass 1: Xfce with a system tray ─────────────────────────────────────────
T=linux-tray
reset_app_state
shot "$T/00-desktop-before-launch"
launch tray
sleep 12
shot "$T/01-first-launch"
"${CDP[@]}" list >"$OUT/logs/tray-cdp-targets.txt" 2>&1
"${CDP[@]}" shot popover "$OUT/$T/01b-popover-renderer-only.png"
crop "$T/01-first-launch" "$T/02-panel-right-zoom" "480x${PANEL}+$((W - 480))+0" 400

# Click empty desktop: the first-run popover should hide on blur.
xdotool mousemove 700 700 click 1
sleep 2
shot "$T/03-after-clicking-desktop"

if XY=$(tray_icon_center 0); then
  read -r TX TY <<<"$XY"
  note "tray icon found at $TX,$TY"
  crop "$T/03-after-clicking-desktop" "$T/02b-tray-icon-zoom" "64x${PANEL}+$((TX - 32))+0" 800
  xdotool mousemove "$TX" "$TY" click 1
  sleep 2
  shot "$T/04-popover-after-tray-left-click"
  "${CDP[@]}" eval popover 'document.hasFocus() + " " + window.innerWidth + "x" + window.innerHeight + " @" + window.screenX + "," + window.screenY' \
    >"$OUT/logs/tray-popover-geometry.txt" 2>&1
  # Second left click should toggle it closed.
  xdotool click 1
  sleep 1.5
  shot "$T/05-after-second-tray-click"
  xdotool mousemove "$TX" "$TY" click 3
  sleep 2
  shot "$T/06-tray-right-click"
  xdotool key Escape
  sleep 1
else
  note "tray icon NOT found in the panel"
fi

# Keyboard: the global shortcut the app registers.
xdotool mousemove 700 700 click 1
sleep 1
xdotool key ctrl+alt+u
sleep 2
shot "$T/07-popover-via-ctrl-alt-u"
"${CDP[@]}" shot popover "$OUT/$T/07b-popover-renderer-only.png"

# Dashboard and Settings, through the popover's own buttons.
"${CDP[@]}" click popover '.pop__action--primary'
sleep 4
shot "$T/08-dashboard"
"${CDP[@]}" eval dashboard 'window.claudeWidget.windowAction({ type: "hide" })'
"${CDP[@]}" click popover '.pop__foot button[title^="Settings"]'
sleep 4
shot "$T/09-settings"
"${CDP[@]}" eval settings 'window.claudeWidget.windowAction({ type: "hide" })'

# Pill and floating bar, through the popover's toggles.
"${CDP[@]}" click popover '.pop__foot button[title^="Floating pill"]'
"${CDP[@]}" click popover '.pop__foot button[title^="Floating bar"]'
"${CDP[@]}" eval popover 'window.claudeWidget.windowAction({ type: "hide" })'
sleep 4
shot "$T/10-pill-and-bar"

# Same surfaces with the compositor off (i3, bare X11, some VMs).
xfwm4 --replace --compositor=off >>"$OUT/logs/xfwm4.log" 2>&1 &
sleep 4
shot "$T/11-pill-and-bar-no-compositor"
xdotool key ctrl+alt+u
sleep 2
shot "$T/12-popover-no-compositor"
"${CDP[@]}" click popover '.pop__action--primary'
sleep 4
shot "$T/13-dashboard-no-compositor"
"${CDP[@]}" eval dashboard 'window.claudeWidget.windowAction({ type: "hide" })'
xfwm4 --replace --compositor=on >>"$OUT/logs/xfwm4.log" 2>&1 &
sleep 3

# Many desktops (Cinnamon, KDE, MATE, Xfce's own second panel) keep the tray
# at the bottom. Move the panel there and click the icon again.
xfconf-query -c xfce4-panel -p /panels/panel-1/position -s 'p=8;x=0;y=0'
sleep 3
if XY=$(tray_icon_center $((H - PANEL))); then
  read -r TX TY <<<"$XY"
  note "bottom panel: tray icon at $TX,$TY"
  xdotool mousemove "$TX" "$TY" click 1
  sleep 2
  shot "$T/14-bottom-panel-popover-after-tray-click"
  xdotool mousemove 700 700 click 1
  sleep 1
else
  shot "$T/14-bottom-panel"
  note "bottom panel: tray icon NOT found"
fi
xfconf-query -c xfce4-panel -p /panels/panel-1/position -s 'p=6;x=0;y=0'

alive && note "tray pass: app still running at the end" || note "tray pass: APP EXITED"
"${CDP[@]}" eval popover 'document.fonts.check("13px \"Geist Variable\"") + " " + getComputedStyle(document.body).fontFamily' \
  >"$OUT/logs/tray-font-check.txt" 2>&1
quit_app
collect_logs tray

# ── Pass 2: no tray (stock GNOME without the AppIndicator extension) ─────────
T=linux-notray
pkill xfce4-panel
sleep 2
note "StatusNotifierWatcher after killing the panel: $(dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | grep -c StatusNotifierWatcher)"
reset_app_state
launch notray
sleep 12
shot "$T/01-first-launch"
xdotool mousemove 700 700 click 1
sleep 2
shot "$T/02-after-clicking-desktop"
xdotool key ctrl+alt+u
sleep 2
shot "$T/03-popover-via-ctrl-alt-u"
xdotool key Escape
sleep 1
# Launching it again from the app menu / AppImage is what most people will try.
"$APP" --no-sandbox >>"$OUT/logs/notray-second-instance.log" 2>&1
sleep 3
shot "$T/04-after-launching-again"
alive && note "notray pass: app still running" || note "notray pass: APP EXITED"
quit_app
collect_logs notray

# ── The AppImage exactly as a user double-clicks it (no flags) ──────────────
# 1) as the runner ships (no libfuse2, like a fresh Ubuntu 22.04+/24.04),
# 2) after installing libfuse2 (what the AppImage error tells people to do),
# 3) with --no-sandbox (the workaround users find on forums).
appimage_try() { # appimage_try <label> [args...]
  local label=$1
  shift
  reset_app_state
  timeout 20 "$APPIMAGE" "$@" >"$OUT/logs/appimage-$label.log" 2>&1
  local rc=$?
  note "AppImage $label: exit $rc (124 = still running after 20s, i.e. it started)"
  pkill -x claudget 2>/dev/null
  sleep 2
}
chmod +x "$APPIMAGE"
appimage_try 1-no-libfuse2
sudo apt-get install -y -qq libfuse2t64 >/dev/null 2>&1 || sudo apt-get install -y -qq libfuse2 >/dev/null 2>&1
appimage_try 2-with-libfuse2
(sleep 12 && shot "linux-notray/05-appimage-no-sandbox") &
SHOOTER=$!
appimage_try 3-with-libfuse2-no-sandbox --no-sandbox
wait "$SHOOTER"
reset_app_state
true
