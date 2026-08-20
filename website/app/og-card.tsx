import { ImageResponse } from "next/og";

/**
 * The shared 1200×630 preview card, used for both Open Graph and Twitter.
 *
 * The old preview was the 512×512 app logo. At `summary_large_image` that gets
 * cropped or letterboxed by every consumer — Google, X, Slack, LinkedIn,
 * iMessage — which is most of why links to the site looked wrong. 1200×630 is
 * the 1.91:1 ratio they all actually expect.
 *
 * Rendered with next/og (Satori), so no dependency and no committed binary.
 * Satori supports a subset of CSS: flexbox only, no CSS variables, no shorthand
 * gaps in older versions — hence the explicit inline styles and margins below.
 * Colours are the site's own tokens, hardcoded because vars aren't available.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT =
  "claudget — a small desktop monitor for Claude Code, showing tokens, cost and burn rate";

const BG = "#0b0b0c";
const LINE = "#2a2a30";
const TEXT = "#ededee";
const MUTED = "#8a8a93";
const ACCENT = "#ff6b3d";

/** One telemetry cell: big value over a small tracked label. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 64 }}>
      <div style={{ fontSize: 40, color: TEXT, fontWeight: 700, letterSpacing: -1 }}>
        {value}
      </div>
      <div style={{ fontSize: 17, color: MUTED, letterSpacing: 2, marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

export function renderOgCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 30,
              color: ACCENT,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            claudget
          </div>
          <div
            style={{
              fontSize: 68,
              color: TEXT,
              fontWeight: 700,
              letterSpacing: -2.5,
              lineHeight: 1.1,
              marginTop: 24,
              maxWidth: 900,
            }}
          >
            A small desktop monitor for Claude Code.
          </div>
          <div style={{ fontSize: 27, color: MUTED, marginTop: 24, maxWidth: 860 }}>
            Tokens, cost, burn rate and plan limits — read from your own local
            transcripts.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", height: 1, background: LINE, marginBottom: 32 }} />
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Stat value="6.9M" label="TOKENS" />
            <Stat value="$17.10" label="EST. COST" />
            <Stat value="42K/m" label="BURN RATE" />
            <div
              style={{
                display: "flex",
                marginLeft: "auto",
                fontSize: 19,
                color: MUTED,
                letterSpacing: 1,
              }}
            >
              macOS · Windows · Linux · MIT
            </div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
