# Runs the packaged Windows build on the runner's interactive desktop and
# screenshots it the way a user would meet it: first launch, the notification
# area, the popover after a real click on the tray icon, the dashboard,
# settings, and the floating pill and bar. Driven from outside the app: real
# mouse input for the tray (found with UI Automation), the DevTools port
# (cdp.mjs) for in-window buttons. No step aborts the run.
#
#   windows.ps1 -Unpacked <win-unpacked dir> -Out <output dir>
param(
  [Parameter(Mandatory)] [string] $Unpacked,
  [Parameter(Mandatory)] [string] $Out
)
$ErrorActionPreference = 'Continue'
$Here = $PSScriptRoot
$Exe = Join-Path (Resolve-Path $Unpacked) 'claudget.exe'
$Shots = Join-Path $Out 'windows'
$Logs = Join-Path $Out 'logs'
New-Item -ItemType Directory -Force -Path $Shots, $Logs | Out-Null
$Summary = Join-Path $Logs 'summary-windows.txt'
function Note($msg) { Write-Host $msg; Add-Content -Path $Summary -Value $msg }

Add-Type -AssemblyName System.Drawing, System.Windows.Forms, UIAutomationClient, UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Native {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, UIntPtr w, string l, uint flags, uint timeout, out UIntPtr result);
}
'@
[Native]::SetProcessDPIAware() | Out-Null

function Shot([string] $name) {
  $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
  $path = Join-Path $Shots "$name.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "shot $name"
}
function Crop([string] $src, [string] $dst, [int] $x, [int] $y, [int] $w, [int] $h, [int] $scale = 1) {
  $img = [System.Drawing.Image]::FromFile((Join-Path $Shots "$src.png"))
  $x = [Math]::Max(0, $x); $y = [Math]::Max(0, $y)
  $w = [Math]::Min($w, $img.Width - $x); $h = [Math]::Min($h, $img.Height - $y)
  $bmp = New-Object System.Drawing.Bitmap ($w * $scale), ($h * $scale)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, ($w * $scale), ($h * $scale)), $x, $y, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save((Join-Path $Shots "$dst.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}
function Click([int] $x, [int] $y, [switch] $Right) {
  [Native]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 150
  if ($Right) { $down = 0x0008; $up = 0x0010 } else { $down = 0x0002; $up = 0x0004 }
  [Native]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [Native]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
}
function Key([byte[]] $vks) {
  foreach ($k in $vks) { [Native]::keybd_event($k, 0, 0, [UIntPtr]::Zero) }
  [array]::Reverse($vks)
  foreach ($k in $vks) { [Native]::keybd_event($k, 0, 2, [UIntPtr]::Zero) }
}
function Cdp { & node --experimental-websocket (Join-Path $Here 'cdp.mjs') @args 2>&1 }

$UIA = [System.Windows.Automation.AutomationElement]
function Find-Buttons {
  $cond = New-Object System.Windows.Automation.PropertyCondition($UIA::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
  $UIA::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
}
function Dump-Buttons([string] $file) {
  Find-Buttons | ForEach-Object {
    $r = $_.Current.BoundingRectangle
    '{0,-60} {1,-34} {2}' -f $_.Current.Name, $_.Current.ClassName, "$([int]$r.X),$([int]$r.Y) $([int]$r.Width)x$([int]$r.Height)"
  } | Set-Content -Path (Join-Path $Logs $file)
}
function Find-Named([string] $pattern) {
  Find-Buttons | Where-Object { $_.Current.Name -match $pattern -and -not $_.Current.BoundingRectangle.IsEmpty } | Select-Object -First 1
}
# Tray buttons are named after the tooltip (with a leading invisible char on
# Windows 11), so match loosely but only inside the notification area.
function Find-Tray {
  Find-Buttons | Where-Object {
    $_.Current.Name -match 'claudget' -and $_.Current.ClassName -like 'SystemTray*' -and -not $_.Current.BoundingRectangle.IsEmpty
  } | Select-Object -First 1
}
function Center($el) {
  $r = $el.Current.BoundingRectangle
  [int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2)
}
function Hide-Surface([string] $surface) { Cdp eval $surface 'window.claudeWidget.windowAction({ type: "hide" })' | Out-Null }

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
Note "screen $($screen.Bounds.Width)x$($screen.Bounds.Height), work area $($screen.WorkingArea), OS $([Environment]::OSVersion.VersionString)"
$build = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion')
Note "product $($build.ProductName) $($build.DisplayVersion) build $($build.CurrentBuild)"
$personal = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -ErrorAction SilentlyContinue
Note "SystemUsesLightTheme=$($personal.SystemUsesLightTheme) AppsUseLightTheme=$($personal.AppsUseLightTheme)"
$tb = $screen.Bounds.Height - $screen.WorkingArea.Height

$UserDataDirs = @((Join-Path $env:APPDATA 'claudget'), (Join-Path $env:APPDATA '@claude-widget\desktop'))
foreach ($d in $UserDataDirs) { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }

# The runner's own console sits on the desktop; get it out of the way.
(New-Object -ComObject Shell.Application).MinimizeAll()
Start-Sleep -Seconds 2
Shot '00-desktop-before-launch'
Dump-Buttons 'win-uia-buttons-before.txt'

# ── First launch ────────────────────────────────────────────────────────────
$proc = Start-Process -FilePath $Exe -PassThru -ArgumentList @(
  '--remote-debugging-port=9222', '--enable-logging=file', "--log-file=$(Join-Path $Logs 'win-chromium.log')"
)
Note "launched claudget pid $($proc.Id)"
Start-Sleep -Seconds 12
Shot '01-first-launch'
Cdp list | Set-Content (Join-Path $Logs 'win-cdp-targets.txt')
Cdp shot dashboard (Join-Path $Shots '01b-dashboard-renderer-only.png')
Note "first-run welcome: $((Cdp eval dashboard 'document.querySelector(".welcome")?.innerText ?? "(none)"') -join ' ')"
Crop '01-first-launch' '02-notification-area-zoom' ($screen.Bounds.Width - 420) ($screen.Bounds.Height - $tb) 420 $tb 3
Dump-Buttons 'win-uia-buttons-after-launch.txt'

# Click empty desktop: the first-run dashboard is a real window and stays.
Click 300 300
Start-Sleep -Seconds 2
Shot '03-after-clicking-desktop'
Hide-Surface dashboard
Start-Sleep -Seconds 1

# ── Find the tray icon like a user: visible, or behind the overflow chevron ──
# Returns the icon's UIA element, opening the "Show hidden icons" flyout first
# when it isn't in the visible notification area.
function Reach-TrayIcon([string] $shotName) {
  $el = Find-Tray
  if ($el) { return $el }
  $chev = Find-Named '(?i)hidden icons|chevron|show more'
  if (-not $chev) { return $null }
  $cx, $cy = Center $chev
  Click $cx $cy
  Start-Sleep -Seconds 2
  if ($shotName) { Shot $shotName; Dump-Buttons 'win-uia-buttons-overflow.txt' }
  Find-Tray
}
if (Find-Tray) { Note 'tray icon VISIBLE in the notification area' }
else { Note 'tray icon NOT visible: Windows put it behind the "Show hidden icons" chevron' }
$icon = Reach-TrayIcon '04-overflow-flyout'

if ($icon) {
  $ix, $iy = Center $icon
  Note "clicking tray icon at $ix,$iy"
  Crop '04-overflow-flyout' '02b-tray-icon-zoom' ($ix - 60) ($iy - 30) 120 60 6
  Click $ix $iy
  Start-Sleep -Seconds 2
  Shot '05-popover-after-tray-left-click'
  Cdp eval popover 'window.screenX + "," + window.screenY + " " + window.outerWidth + "x" + window.outerHeight' |
    Set-Content (Join-Path $Logs 'win-tray-popover-geometry.txt')
  # Second click on the icon should close it (toggle). From the overflow that
  # means chevron, then icon again.
  $icon2 = Reach-TrayIcon $null
  if ($icon2) { $ix, $iy = Center $icon2; Click $ix $iy }
  Start-Sleep -Seconds 2
  Shot '06-after-second-tray-click'
  Click 300 300
  Start-Sleep -Seconds 1
  $icon3 = Reach-TrayIcon $null
  if ($icon3) {
    $rx, $ry = Center $icon3
    Click $rx $ry -Right
    Start-Sleep -Seconds 2
    Shot '07-tray-right-click-menu'
    Key @(0x1B) # Esc
    Start-Sleep -Seconds 1
    Key @(0x1B)
  }
} else {
  Note 'could not find the tray icon anywhere via UI Automation'
}

# Keyboard: the global shortcut the app registers (Ctrl+Alt+U).
Click 300 300
Start-Sleep -Seconds 1
Key @(0x11, 0x12, 0x55)
Start-Sleep -Seconds 2
Shot '08-popover-via-ctrl-alt-u'
Cdp shot popover (Join-Path $Shots '08b-popover-renderer-only.png')
Note "popover button titles: $((Cdp eval popover '[...document.querySelectorAll(".pop__foot button")].map(b => b.title).join(" | ")') -join ' ')"
# Ctrl+D in the popover opens the dashboard (it was Cmd-only).
Key @(0x11, 0x44)
Start-Sleep -Seconds 3
Shot '08c-dashboard-via-ctrl-d'
Note "dashboard visible after Ctrl+D: $((Cdp eval dashboard 'document.visibilityState') -join ' ')"
Hide-Surface dashboard

# Dashboard and Settings, through the popover's own buttons.
Cdp click popover '.pop__action--primary'
Start-Sleep -Seconds 4
Shot '09-dashboard'
Hide-Surface dashboard
Cdp click popover '.pop__foot button[title^="Settings"]'
Start-Sleep -Seconds 4
Shot '10-settings'
$wcond = New-Object System.Windows.Automation.PropertyCondition($UIA::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)
$titles = $UIA::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $wcond) | ForEach-Object { $_.Current.Name } | Where-Object { $_ -match 'claudget' }
Note "claudget window titles: $($titles -join ' | ')"
Note "click-through hint: $((Cdp eval settings 'document.body.innerText.match(/[^\n]*toggles it[^\n]*/)?.[0] ?? "(not on this tab)"') -join ' ')"
Hide-Surface settings

# Pill and floating bar, through the popover's toggles.
Cdp click popover '.pop__foot button[title^="Floating pill"]'
Cdp click popover '.pop__foot button[title^="Floating bar"]'
Hide-Surface popover
Start-Sleep -Seconds 4
Shot '11-pill-and-bar'
Note "pill window: $((Cdp eval pill 'window.screenX + "," + window.screenY + " " + window.outerWidth + "x" + window.outerHeight') -join ' '); bar window: $((Cdp eval minibar 'window.screenX + "," + window.screenY + " " + window.outerWidth + "x" + window.outerHeight') -join ' ')"

# What it looks like once the user pins the icon to the visible area
# (Settings > Personalization > Taskbar > Other system tray icons). Windows 11
# keeps that choice in HKCU\Control Panel\NotifyIconSettings\<id>\IsPromoted.
$promoted = $false
Get-ChildItem 'HKCU:\Control Panel\NotifyIconSettings' -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  if ($p.ExecutablePath -like '*claudget.exe') {
    Set-ItemProperty $_.PSPath -Name IsPromoted -Value 1 -Type DWord
    $promoted = $true
  }
}
Note "promoted tray icon via NotifyIconSettings: $promoted"
Start-Sleep -Seconds 4
Shot '12-icon-promoted'
Crop '12-icon-promoted' '12b-notification-area-promoted-zoom' ($screen.Bounds.Width - 420) ($screen.Bounds.Height - $tb) 420 $tb 3
$icon = Find-Tray
if ($icon) {
  $ix, $iy = Center $icon
  Note "promoted tray icon at $ix,$iy"
  Crop '12-icon-promoted' '12c-tray-icon-promoted-zoom' ($ix - 40) ($iy - 24) 80 48 8
  Click $ix $iy
  Start-Sleep -Seconds 2
  Shot '13-popover-from-visible-icon'
  Cdp eval popover 'window.screenX + "," + window.screenY + " " + window.outerWidth + "x" + window.outerHeight' |
    Set-Content (Join-Path $Logs 'win-promoted-popover-geometry.txt')
  Click 300 300
  Start-Sleep -Seconds 1
}

# Dark taskbar: switch the system theme and restart Explorer (which is also
# what happens after an Explorer crash — the icon must come back by itself).
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name SystemUsesLightTheme -Value 0 -Type DWord
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 10
if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe; Start-Sleep -Seconds 8 }
(New-Object -ComObject Shell.Application).MinimizeAll()
Start-Sleep -Seconds 2
Shot '14-dark-taskbar'
Crop '14-dark-taskbar' '14b-notification-area-dark-zoom' ($screen.Bounds.Width - 420) ($screen.Bounds.Height - $tb) 420 $tb 3
$icon = Find-Tray
Note "tray icon present after Explorer restart: $([bool]$icon)"
if ($icon) {
  $ix, $iy = Center $icon
  Crop '14-dark-taskbar' '14c-tray-icon-dark-zoom' ($ix - 40) ($iy - 24) 80 48 8
}
Dump-Buttons 'win-uia-buttons-after-explorer-restart.txt'
$tasks = Find-Buttons | Where-Object { $_.Current.Name -match 'claudget' -and $_.Current.ClassName -like 'Taskbar*' } | ForEach-Object { $_.Current.Name }
Note "claudget taskbar buttons after Explorer restart: $(if ($tasks) { $tasks -join ' | ' } else { 'none' })"

$alive = -not $proc.HasExited
Note "app still running at the end: $alive"
Cdp eval popover 'document.fonts.check("13px \"Geist Variable\"") + " " + getComputedStyle(document.body).fontFamily' |
  Set-Content (Join-Path $Logs 'win-font-check.txt')

Stop-Process -Name claudget -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
foreach ($d in $UserDataDirs) {
  if (Test-Path $d) {
    Note "userData: $d"
    Get-ChildItem $d -Recurse -Include *.log, *.json, welcomed -Depth 2 -ErrorAction SilentlyContinue |
      ForEach-Object { Copy-Item $_.FullName (Join-Path $Logs ("win-" + $_.Name)) }
  }
}
exit 0
