import type { ReactNode } from "react";
import {
  GlyphBattery,
  GlyphChevronUp,
  GlyphFolder,
  GlyphGlobe,
  GlyphSearch,
  GlyphStart,
  GlyphTerminal,
  GlyphVolume,
  GlyphWifi,
  IconClose,
  IconMinus,
  IconSquare,
} from "../../icons";
import { CLOCK } from "./demo";

/**
 * A slice of desktop: wallpaper, and whatever sits on it. Announced once, by
 * its label — the product text inside is illustration, not page content, so
 * it is hidden from assistive tech and kept out of search snippets.
 */
export function Scene({
  label,
  className = "",
  reveal = false,
  children,
}: {
  label: string;
  className?: string;
  /** Rise into view once, as it scrolls in (motion.css). */
  reveal?: boolean;
  children: ReactNode;
}) {
  return (
    <figure
      className={`scene ${className}`.trim()}
      role="img"
      aria-label={label}
      data-nosnippet=""
      data-reveal={reveal ? "rise" : undefined}
    >
      <div className="scene__desk" aria-hidden>
        {children}
      </div>
    </figure>
  );
}

/**
 * Windows and Linux: a taskbar with the tray. claudget's tray icon is the
 * logo, the same in every state — trays there don't tint template glyphs and
 * don't show text (main/tray.ts) — drawn pressed while its popover is open.
 */
export function Taskbar({ pressed = false }: { pressed?: boolean }) {
  return (
    <div className="taskbar">
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
      <span className="taskbar__tray">
        <GlyphChevronUp width={14} height={14} />
        <span className={pressed ? "tbi tbi--claudget tbi--on" : "tbi tbi--claudget"}>
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
 * the request, one edit with its result, and the input box waiting. It sits
 * behind the popover, so it stays short and quiet.
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
          <i>⏺</i> Update(src/renderer/styles/system.css)
        </p>
        <p className="term__out">
          ⎿ Updated with <span className="term__add">61 additions</span> and{" "}
          <span className="term__del">24 removals</span>
        </p>
        <div className="term__input">
          <span className="term__dim">&gt;</span> <b />
        </div>
      </div>
    </div>
  );
}
