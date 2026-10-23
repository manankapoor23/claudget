import type { ReactNode } from "react";
import { Scene, Taskbar, TerminalWindow } from "../ui/Desktop";
import { Popover } from "../ui/Popover";
import type { DemoLimit } from "../ui/demo";

/**
 * Windows and Linux: a slice of desktop with the taskbar along the bottom,
 * claudget's tray icon pressed and its popover open above it — a left click
 * opens it on every platform (main/tray.ts) — and, when given, the floating
 * pill in the corner.
 */
export function TrayDesk({
  label,
  five,
  pill,
  className = "",
}: {
  label: string;
  /** The popover's 5-hour row, for a live demo. */
  five?: DemoLimit;
  pill?: ReactNode;
  className?: string;
}) {
  return (
    <Scene className={`tray-desk ${className}`.trim()} label={label}>
      <TerminalWindow className="tray-desk__term" />
      {pill ? <div className="tray-desk__pill">{pill}</div> : null}
      <div className="tray-desk__pop">
        <Popover five={five} />
      </div>
      <Taskbar pressed />
    </Scene>
  );
}
