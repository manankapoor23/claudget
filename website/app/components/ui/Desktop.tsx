import type { ReactNode } from "react";
import {
  GlyphBattery,
  GlyphChevronUp,
  GlyphFolder,
  GlyphGlobe,
  GlyphSearch,
  GlyphStart,
  GlyphSwitches,
  GlyphTerminal,
  GlyphTray,
  GlyphVolume,
  GlyphWifi,
  IconApple,
  IconClose,
  IconMinus,
  IconSquare,
} from "../../icons";
import { LiveNumber } from "./Limit";
import { CLOCK, FIVE_HOUR, WEEKLY } from "./demo";

/**
 * A slice of desktop: wallpaper, and whatever sits on it. Announced once, by
 * its label — the product text inside is illustration, not page content, so
 * it is hidden from assistive tech and kept out of search snippets.
 */
export function Scene({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={`scene ${className}`.trim()} role="img" aria-label={label} data-nosnippet="">
      <div className="scene__desk" aria-hidden>
        {children}
      </div>
    </figure>
  );
}

/**
 * macOS menu bar. The claudget item is the glyph plus both limits, 5-hour
 * first (main/tray.ts). `compact` keeps only the status side, for small scenes.
 * `live` ticks the 5-hour figure up in step with the popover's.
 */
export function MenuBar({ compact = false, live = false }: { compact?: boolean; live?: boolean }) {
  return (
    <div className={compact ? "menubar menubar--compact" : "menubar"}>
      {compact ? null : (
        <>
          <span className="menubar__apple">
            <IconApple width={14} height={14} />
          </span>
          <span className="menubar__app">Terminal</span>
          <span className="menubar__menus">
            <span>Shell</span>
            <span>Edit</span>
            <span>View</span>
            <span>Window</span>
            <span>Help</span>
          </span>
        </>
      )}
      <span className="menubar__status">
        <span className={live ? "mbi mbi--claudget live-tick" : "mbi mbi--claudget"}>
          <GlyphTray width={16} height={16} />
          <span>
            {live ? <LiveNumber to={FIVE_HOUR.pct} suffix="%" /> : `${FIVE_HOUR.pct}%`} ·{" "}
            {WEEKLY.pct}%
          </span>
        </span>
        <span className="mbi">
          <GlyphWifi width={16} height={16} />
        </span>
        <span className="mbi">
          <GlyphBattery width={25} height={13} />
        </span>
        <span className="mbi mbi--hide-sm">
          <GlyphSearch width={15} height={15} />
        </span>
        <span className="mbi mbi--hide-sm">
          <GlyphSwitches width={15} height={15} />
        </span>
        <span className="mbi mbi--clock">
          <span className="mbi__day">{CLOCK.day}&nbsp;&nbsp;</span>
          {CLOCK.time}
        </span>
      </span>
    </div>
  );
}

/**
 * Windows and Linux: a taskbar with the tray. The tray icon is the logo — trays
 * there don't tint template glyphs (main/tray.ts), and don't show text.
 */
export function Taskbar({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "taskbar taskbar--compact" : "taskbar"}>
      {compact ? null : (
        <span className="taskbar__apps">
          <span className="tba">
            <GlyphStart width={17} height={17} />
          </span>
          <span className="tba">
            <GlyphSearch width={17} height={17} />
          </span>
          <span className="tba">
            <GlyphFolder width={18} height={18} />
          </span>
          <span className="tba">
            <GlyphGlobe width={18} height={18} />
          </span>
          <span className="tba tba--on">
            <GlyphTerminal width={18} height={18} />
          </span>
        </span>
      )}
      <span className="taskbar__tray">
        <GlyphChevronUp width={14} height={14} />
        <span className="tbi tbi--claudget">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tray-logo.png" alt="" width={16} height={16} loading="lazy" />
        </span>
        <GlyphWifi width={15} height={15} />
        <GlyphVolume width={15} height={15} />
        <GlyphBattery width={22} height={12} />
        <span className="taskbar__clock">
          <span>{CLOCK.time}</span>
          <span>{CLOCK.date}</span>
        </span>
      </span>
    </div>
  );
}

/**
 * The work claudget is watching: a Claude Code session, in its own idiom —
 * tool calls with their results, the reply, and the input box waiting.
 */
export function TerminalWindow({ className = "" }: { className?: string }) {
  return (
    <div className={`term ${className}`.trim()}>
      <div className="term__bar">
        <span className="lights">
          <i />
          <i />
          <i />
        </span>
        <span className="term__title">claudget — claude</span>
        <span className="winctl">
          <IconMinus width={14} height={14} />
          <IconSquare width={12} height={12} />
          <IconClose width={13} height={13} />
        </span>
      </div>
      <div className="term__body">
        <p className="term__dim">
          <span className="os-mac">~/claudget %</span>
          <span className="os-other">PS C:\dev\claudget&gt;</span> claude
        </p>
        <p className="term__you">&gt; Polish the usage dashboard</p>
        <p className="term__tool">
          <i>⏺</i> Read(src/renderer/components/WidgetOverview.tsx)
        </p>
        <p className="term__out">⎿ Read 164 lines</p>
        <p className="term__tool">
          <i>⏺</i> Update(src/renderer/styles/system.css)
        </p>
        <p className="term__out">
          ⎿ Updated with <span className="term__add">61 additions</span> and{" "}
          <span className="term__del">24 removals</span>
        </p>
        <p className="term__tool">
          <i>⏺</i> Bash(npm test)
        </p>
        <p className="term__out">
          ⎿ <span className="term__add">24 passed</span>
        </p>
        <p className="term__say">
          <i>⏺</i> The overview now leads with both limits. Want me to tighten the session
          list next?
        </p>
        <div className="term__input">
          <span className="term__dim">&gt;</span> <b />
        </div>
      </div>
    </div>
  );
}
