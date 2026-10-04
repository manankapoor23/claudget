#!/usr/bin/env bash
# Runs the packaged Linux builds on a virtual X display (Ubuntu 24.04, which
# restricts unprivileged user namespaces through AppArmor) and screenshots them
# the way a user meets them. Nothing is launched with --no-sandbox by hand:
#
#   appimage      The AppImage run plainly, as a file manager double-click
#                 does, with no libfuse2 installed.
#   deb           The .deb installed with apt, then `claudget` run plainly.
#   linux-tray    Xfce (xfwm4 + xfce4-panel with the systray plugin, which
#                 hosts StatusNotifierItem and XEmbed icons), driving the
#                 installed .deb: tray left/right click, popover placement
#                 under a top and above a bottom panel, the pill, then all of
#                 it again with no compositor from launch.
#   linux-notray  Same window manager, no panel at all — what a stock GNOME
#                 user (no AppIndicator extension) gets.
#
# Everything is driven from outside the app: xdotool for the real tray and
# keyboard, the DevTools port (cdp.mjs) for in-window buttons. No step aborts
# the run; whatever fails is visible in the screenshots and summary.txt.
#
#   linux.sh <linux-unpacked dir> <AppImage> <deb> <output dir>
set -uo pipefail

UNPACKED=$(realpath "$1")
APPIMAGE=$(realpath "$2")
DEB=$(realpath "$3")
OUT=$(realpath -m "$4")
HERE=$(dirname "$(realpath "$0")")
APP=/opt/claudget/claudget
W=1920
H=1080
export DISPLAY=:99
export NO_AT_BRIDGE=1
CDP=(node --experimental-websocket "$HERE/cdp.mjs")

mkdir -p "$OUT/linux-tray" "$OUT/linux-notray" "$OUT/linux-nocomp" "$OUT/logs"
SUMMARY="$OUT/logs/summary-linux.txt"
note() { echo "$*" | tee -a "$SUMMARY"; }

shot() { import -window root "$OUT/$1.png" && echo "shot $1"; }
# crop <src> <dst> <geometry> [scale%]
crop() { convert "$OUT/$1.png" -crop "$3" +repage -filter point -resize "${4:-100}%" "$OUT/$2.png"; }

user_data_dirs() { echo "$HOME/.config/claudget" "$HOME/.config/@claude-widget/desktop"; }
reset_app_state() { for d in $(user_data_dirs); do rm -rf "$d"; done; }
app_log() { cat "$HOME"/.config/@claude-widget/desktop/logs/*.log "$HOME"/.config/claudget/logs/*.log 2>/dev/null; }
collect_logs() { # collect_logs <label>
  for d in $(user_data_dirs); do
    [ -d "$d" ] || continue
    note "userData for $1: $d"
    find "$d" -maxdepth 2 \( -name '*.log' -o -name '*.json' -o -name welcomed \) -print \
      | while read -r f; do cp "$f" "$OUT/logs/$1-$(basename "$f")"; done
  done
}

APP_PID=
launch() { # launch <label>: the installed .deb, plainly (sandbox on)
  # Debug logging, for the popover-anchor lines.
  local ud="$HOME/.config/@claude-widget/desktop"
  mkdir -p "$ud"
  [ -f "$ud/config.json" ] || echo '{ "logLevel": "debug" }' >"$ud/config.json"
  "$APP" --remote-debugging-port=9222 >>"$OUT/logs/$1-stdout.log" 2>&1 &
  APP_PID=$!
  sleep 4
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    note "$1: installed app exited at launch; falling back to the unpacked build with --no-sandbox"
    "$UNPACKED/claudget" --no-sandbox --remote-debugging-port=9222 >>"$OUT/logs/$1-stdout.log" 2>&1 &
    APP_PID=$!
  fi
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

geometry() { # geometry <surface> → "x,y wxh" of that window on screen
  "${CDP[@]}" eval "$1" 'window.screenX + "," + window.screenY + " " + window.outerWidth + "x" + window.outerHeight' 2>&1
}
# The pill's own centre on screen (not its window's), for clicking it.
pill_center() {
  "${CDP[@]}" eval pill '(() => { const s = document.querySelector(".pshell"); return Math.round(window.screenX + s.offsetLeft + s.offsetWidth / 2) + " " + Math.round(window.screenY + s.offsetTop + s.offsetHeight / 2); })()' 2>/dev/null | tr -d '"'
}

# ── Display, session bus, Xfce pieces ───────────────────────────────────────
Xvfb :99 -screen 0 ${W}x${H}x24 +extension Composite +extension RANDR -nolisten tcp &
sleep 2
eval "$(dbus-launch --sh-syntax)"
export DBUS_SESSION_BUS_ADDRESS

note "kernel.apparmor_restrict_unprivileged_userns=$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo n/a)"
note "unshare -Ur true: $(unshare -Ur true 2>&1 && echo works || echo fails)"
note "libfuse.so.2 present: $(ldconfig -p | grep -q 'libfuse.so.2' && echo yes || echo no)"
note "fusermount3: $(command -v fusermount3 || echo missing), fusermount: $(command -v fusermount || echo missing)"

# ── The AppImage, run plainly (what a double-click does) ────────────────────
appimage_try() { # appimage_try <label> [args...]
  local label=$1
  shift
  reset_app_state
  timeout 25 "$APPIMAGE" "$@" >"$OUT/logs/appimage-$label.log" 2>&1
  local rc=$?
  note "AppImage $label: exit $rc (124 = still running after 25s, i.e. it started)"
  note "AppImage $label log: $(app_log | grep -E 'Display|claudget starting' | tr '\n' ' ')"
  cp "$HOME"/.config/@claude-widget/desktop/logs/*.log "$OUT/logs/appimage-$label-app.log" 2>/dev/null
  pkill -x claudget 2>/dev/null
  sleep 2
}
chmod +x "$APPIMAGE"
(sleep 14 && shot "linux-notray/00-appimage-plain-launch") &
SHOOTER=$!
appimage_try 1-plain
wait "$SHOOTER"

# ── The .deb, installed with apt, run plainly ───────────────────────────────
sudo apt-get install -y -qq "$DEB" >"$OUT/logs/deb-install.log" 2>&1
note "deb install: exit $? ($(dpkg-query -W -f='${Package} ${Version}' claudget 2>/dev/null))"
note "deb: chrome-sandbox $(stat -c '%U %a' /opt/claudget/chrome-sandbox 2>/dev/null), AppArmor profile $(ls /etc/apparmor.d/claudget 2>/dev/null || echo missing), loaded: $(sudo aa-status 2>/dev/null | grep -c claudget)"
reset_app_state
timeout 25 claudget >"$OUT/logs/deb-plain.log" 2>&1
note "deb plain launch: exit $? (124 = still running after 25s, i.e. it started)"
note "deb plain launch log: $(app_log | grep -E 'Display|claudget starting' | tr '\n' ' ')"
cp "$HOME"/.config/@claude-widget/desktop/logs/*.log "$OUT/logs/deb-plain-app.log" 2>/dev/null
pkill -x claudget 2>/dev/null
sleep 2

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
note "StatusNotifierWatcher on the bus: $(dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | grep -c StatusNotifierWatcher)"

# ── Pass 1: Xfce with a system tray, compositor on ──────────────────────────
T=linux-tray
reset_app_state
shot "$T/00-desktop-before-launch"
launch tray
sleep 10
shot "$T/01-first-launch"
"${CDP[@]}" list >"$OUT/logs/tray-cdp-targets.txt" 2>&1
"${CDP[@]}" eval dashboard 'document.querySelector(".welcome")?.innerText ?? "(no welcome)"' >"$OUT/logs/tray-welcome.txt" 2>&1
crop "$T/01-first-launch" "$T/02-panel-right-zoom" "480x${PANEL}+$((W - 480))+0" 400
"${CDP[@]}" eval dashboard 'window.claudeWidget.windowAction({ type: "hide" })'
sleep 2

if XY=$(tray_icon_center 0); then
  read -r TX TY <<<"$XY"
  note "tray icon found at $TX,$TY"
  shot "$T/03-desktop"
  crop "$T/03-desktop" "$T/02b-tray-icon-zoom" "64x${PANEL}+$((TX - 32))+0" 800
  xdotool mousemove "$TX" "$TY" click 1
  sleep 2
  shot "$T/04-popover-after-tray-left-click"
  note "top panel: popover at $(geometry popover)"
  # Second left click should toggle it closed.
  xdotool click 1
  sleep 1.5
  shot "$T/05-after-second-tray-click"
  xdotool mousemove "$TX" "$TY" click 3
  sleep 2
  shot "$T/06-tray-right-click"
  # The menu's first item opens the glance (for trays that only show menus).
  xdotool key Down Return
  sleep 2
  shot "$T/06b-open-claudget-from-menu"
  note "menu 'Open claudget': popover visible = $("${CDP[@]}" eval popover 'document.visibilityState' 2>&1)"
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
"${CDP[@]}" eval popover '[...document.querySelectorAll(".pop__foot button")].map(b => b.title).join(" | ")' >"$OUT/logs/tray-popover-titles.txt" 2>&1
# Ctrl+D in the popover opens the dashboard.
xdotool key ctrl+d
sleep 3
shot "$T/08-dashboard-via-ctrl-d"
"${CDP[@]}" eval dashboard 'window.claudeWidget.windowAction({ type: "hide" })'
"${CDP[@]}" click popover '.pop__foot button[title^="Settings"]'
sleep 4
shot "$T/09-settings"
note "settings window title: $(xdotool search --name 'claudget Settings' getwindowname 2>/dev/null | head -1)"
"${CDP[@]}" eval settings 'window.claudeWidget.windowAction({ type: "hide" })'

# Pill and floating bar, through the popover's toggles.
"${CDP[@]}" click popover '.pop__foot button[title^="Floating pill"]'
"${CDP[@]}" click popover '.pop__foot button[title^="Floating bar"]'
"${CDP[@]}" eval popover 'window.claudeWidget.windowAction({ type: "hide" })'
sleep 4
shot "$T/10-pill-and-bar"
note "pill window $(geometry pill), bar window $(geometry minibar)"
# The pill must take clicks (X11 can't forward mouse moves to an ignoring window).
if PC=$(pill_center) && [ -n "$PC" ]; then
  read -r PX PY <<<"$PC"
  note "pill centre at $PX,$PY"
  xdotool mousemove "$PX" "$PY" click 1
  sleep 1.5
  shot "$T/10b-pill-clicked-open"
  note "pill open after click: $("${CDP[@]}" eval pill 'document.querySelector(".pshell").classList.contains("pshell--open")' 2>&1)"
  xdotool key Escape
  sleep 1
  # And drag: press, move, release.
  xdotool mousemove "$PX" "$PY" mousedown 1
  for i in 1 2 3 4 5 6 7 8 9 10; do xdotool mousemove_relative -- -30 20; sleep 0.05; done
  xdotool mouseup 1
  sleep 1
  shot "$T/10c-pill-dragged"
  note "pill window after drag $(geometry pill)"
fi

# Many desktops (Cinnamon, KDE, MATE, Xfce's own second panel) keep the tray
# at the bottom. Move the panel there and click the icon again.
xfconf-query -c xfce4-panel -p /panels/panel-1/position -s 'p=8;x=0;y=0'
sleep 3
if XY=$(tray_icon_center $((H - PANEL))); then
  read -r TX TY <<<"$XY"
  note "bottom panel: tray icon at $TX,$TY"
  xdotool mousemove "$TX" "$TY" click 1
  sleep 2
  shot "$T/11-bottom-panel-popover-after-tray-click"
  note "bottom panel: popover at $(geometry popover)"
  xdotool mousemove 700 700 click 1
  sleep 1
else
  shot "$T/11-bottom-panel"
  note "bottom panel: tray icon NOT found"
fi
xfconf-query -c xfce4-panel -p /panels/panel-1/position -s 'p=6;x=0;y=0'
sleep 2

alive && note "tray pass: app still running at the end" || note "tray pass: APP EXITED"
note "tray pass log: $(app_log | grep -E 'Display|Tray|Popover anchor' | tr '\n' ' ')"
quit_app
collect_logs tray

# ── Pass 2: no compositor from launch (i3, Openbox, LXQt, bare X11, VMs) ────
T=linux-nocomp
xfwm4 --replace --compositor=off >>"$OUT/logs/xfwm4.log" 2>&1 &
sleep 4
launch nocomp
sleep 10
shot "$T/01-pill-and-bar"
note "nocomp log: $(app_log | grep -E 'Display' | tail -1)"
if PC=$(pill_center) && [ -n "$PC" ]; then
  read -r PX PY <<<"$PC"
  crop "$T/01-pill-and-bar" "$T/01b-pill-zoom" "420x120+$((PX - 210))+$((PY - 60))" 200
  xdotool mousemove "$PX" "$PY" click 1
  sleep 1.5
  shot "$T/02-pill-clicked-open"
  xdotool key Escape
  sleep 1
fi
xdotool mousemove 700 700 click 1
xdotool key ctrl+alt+u
sleep 2
shot "$T/03-popover"
"${CDP[@]}" click popover '.pop__action--primary'
sleep 4
shot "$T/04-dashboard"
"${CDP[@]}" eval dashboard 'window.claudeWidget.windowAction({ type: "hide" })'
quit_app
collect_logs nocomp
xfwm4 --replace --compositor=on >>"$OUT/logs/xfwm4.log" 2>&1 &
sleep 3

# ── Pass 3: no tray (stock GNOME without the AppIndicator extension) ─────────
T=linux-notray
pkill xfce4-panel
sleep 2
note "StatusNotifierWatcher after killing the panel: $(dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | grep -c StatusNotifierWatcher)"
reset_app_state
launch notray
sleep 10
shot "$T/01-first-launch"
"${CDP[@]}" eval dashboard 'document.querySelector(".welcome")?.innerText ?? "(no welcome)"' >"$OUT/logs/notray-welcome.txt" 2>&1
xdotool mousemove 700 700 click 1
sleep 2
shot "$T/02-after-clicking-desktop"
xdotool key ctrl+alt+u
sleep 2
shot "$T/03-popover-via-ctrl-alt-u"
xdotool key Escape
sleep 1
# Launching it again from the app menu is what most people will try.
"$APP" >>"$OUT/logs/notray-second-instance.log" 2>&1
sleep 3
shot "$T/04-after-launching-again"
alive && note "notray pass: app still running" || note "notray pass: APP EXITED"
quit_app
collect_logs notray
reset_app_state
true
