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
Cdp shot popover (Join-Path $Shots '01b-popover-renderer-only.png')
Cdp eval popover 'window.screenX + "," + window.screenY + " " + window.outerWidth + "x" + window.outerHeight' |
  Set-Content (Join-Path $Logs 'win-first-run-popover-geometry.txt')
Crop '01-first-launch' '02-notification-area-zoom' ($screen.Bounds.Width - 420) ($screen.Bounds.Height - $tb) 420 $tb 3
Dump-Buttons 'win-uia-buttons-after-launch.txt'

# Click empty desktop: the first-run popover should hide on blur.
Click 300 300
Start-Sleep -Seconds 2
Shot '03-after-clicking-desktop'

# ── Find the tray icon like a user: visible, or behind the overflow chevron ──
$icon = Find-Named '^claudget'
if ($icon) {
  Note "tray icon VISIBLE in the notification area at $(Center $icon)"
} else {
  Note 'tray icon NOT visible in the notification area; trying the overflow chevron'
  $chev = Find-Named '(?i)hidden icons|chevron|show more'
  if ($chev) {
    $cx, $cy = Center $chev
    Note "chevron '$($chev.Current.Name)' at $cx,$cy"
    Click $cx $cy
    Start-Sleep -Seconds 2
    Shot '04-overflow-flyout'
    Dump-Buttons 'win-uia-buttons-overflow.txt'
    $icon = Find-Named '^claudget'
    if ($icon) { Note "tray icon found in the OVERFLOW flyout at $(Center $icon)" }
  } else {
    Note 'no overflow chevron found either'
  }
}

if ($icon) {
  $ix, $iy = Center $icon
  Crop '03-after-clicking-desktop' '02b-tray-icon-zoom' ($ix - 60) ($iy - 30) 120 60 6
  Click $ix $iy
  Start-Sleep -Seconds 2
  Shot '05-popover-after-tray-left-click'
  Cdp eval popover 'window.screenX + "," + window.screenY + " " + window.outerWidth + "x" + window.outerHeight' |
    Set-Content (Join-Path $Logs 'win-tray-popover-geometry.txt')
  # Second click on the icon should close it (toggle).
  $icon2 = Find-Named '^claudget'
  if ($icon2) { $ix, $iy = Center $icon2 }
  Click $ix $iy
  Start-Sleep -Seconds 2
  Shot '06-after-second-tray-click'
  $icon3 = Find-Named '^claudget'
  if ($icon3) {
    $rx, $ry = Center $icon3
    Click $rx $ry -Right
    Start-Sleep -Seconds 2
    Shot '07-tray-right-click-menu'
    Key @(0x1B) # Esc
    Start-Sleep -Seconds 1
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

# Dashboard and Settings, through the popover's own buttons.
Cdp click popover '.pop__action--primary'
Start-Sleep -Seconds 4
Shot '09-dashboard'
Hide-Surface dashboard
Cdp click popover '.pop__foot button[title^="Settings"]'
Start-Sleep -Seconds 4
Shot '10-settings'
Hide-Surface settings

# Pill and floating bar, through the popover's toggles.
Cdp click popover '.pop__foot button[title^="Floating pill"]'
Cdp click popover '.pop__foot button[title^="Floating bar"]'
Hide-Surface popover
Start-Sleep -Seconds 4
Shot '11-pill-and-bar'

# Taskbar in the other colour mode, to judge the icon's contrast on both.
$light = if ($personal.SystemUsesLightTheme -eq 1) { 0 } else { 1 }
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name SystemUsesLightTheme -Value $light -Type DWord
$res = [UIntPtr]::Zero
[Native]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, 'ImmersiveColorSet', 2, 5000, [ref]$res) | Out-Null
Start-Sleep -Seconds 4
Shot '12-taskbar-other-theme'
Crop '12-taskbar-other-theme' '12b-notification-area-other-theme-zoom' ($screen.Bounds.Width - 420) ($screen.Bounds.Height - $tb) 420 $tb 3

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
