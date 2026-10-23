import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import {
  HARDWARE_D,
  OUTLINE_D,
  OUTLINE_LEN,
  PAD_X,
  TONE,
  VIEW_H,
  VIEW_W,
} from "./components/notch/geometry";

/**
 * The shared 1200×630 preview card, used for both Open Graph and Twitter —
 * the 1.91:1 ratio every consumer (Google, X, Slack, LinkedIn, iMessage)
 * expects for `summary_large_image`.
 *
 * Rendered with next/og (Satori), so no committed binary. Satori supports a
 * subset of CSS — flexbox only, no CSS variables — hence the explicit inline
 * styles. Colours are the site's paper tokens, hardcoded for the same reason.
 * On the right, the page's own picture: the notch hanging from the card's top
 * edge with the line 62% of the way round, and the card it drops, as on the
 * home page. The notch is an SVG image whose dash is in plain units (the
 * renderer doesn't read pathLength).
 *
 * Satori's bundled face has a single regular weight, so Geist (the app's face
 * off the Mac) is fetched at render time, subset to the card's own text. If
 * that fails the card still renders, in the default face.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT =
  "claudget: the notch, now with your Claude Code limit. An orange line runs 62% of the way round a MacBook’s notch, and the card it drops reads 5-hour about 62%, resets in 2h 30m, full by 4:01 PM, weekly 31%.";

// The page: paper and ink.
const PAPER = "#f7f5f0";
const PAPER_INK = "#1a1917";
const PAPER_INK_3 = "#625e58";

const HEADLINE = "The notch, now with your Claude Code limit.";
const FOOT = "Free and open source · macOS, Windows, Linux";
const CARD = "5-hour~62%Resets in 2h 30mFull by 4:01 PMWeekly31%";

/** Pixels per point for the notch and its card. */
const K = 2.15;
const PCT = 62;

/** One weight of Geist from Google Fonts as TrueType (what Satori reads). */
async function geist(weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Geist:wght@${weight}&text=${encodeURIComponent(text)}`,
    ).then((r) => r.text());
    const src = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!src) return null;
    const font = await fetch(src);
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** The cutout, the black track and the orange fill, dimmed as an estimate. */
function notchSvg(): string {
  const fill = (PCT / 100) * OUTLINE_LEN;
  const line = `fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD_X} 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W * K}" height="${VIEW_H * K}">
<path d="${HARDWARE_D}" fill="#000" stroke="#000" stroke-width="1.6"/>
<path d="${OUTLINE_D}" stroke="#000" ${line}/>
<path d="${OUTLINE_D}" stroke="${TONE.ok}" stroke-opacity="0.72" stroke-dasharray="${fill.toFixed(2)} 1000" ${line}/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** The notch and, under it, the card it drops (NotchCard), in points × K. */
function NotchArt() {
  const s = (n: number) => n * K;
  const label = "rgba(255,255,255,0.55)";
  const quiet = "rgba(255,255,255,0.42)";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: s(248) + 8,
        marginTop: -72,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={notchSvg()} width={VIEW_W * K} height={VIEW_H * K} alt="" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: s(248),
          height: s(112),
          marginTop: s(38 - VIEW_H),
          padding: `${s(13)}px ${s(16)}px 0`,
          borderRadius: s(16),
          background: "#000",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 30px 60px -24px rgba(0,0,0,0.45)",
          color: "rgba(255,255,255,0.95)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: s(12), color: label }}>5-hour</div>
          <div style={{ display: "flex", fontSize: s(15), fontWeight: 600 }}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 400 }}>~</span>
            {PCT}%
          </div>
        </div>
        <div
          style={{
            display: "flex",
            height: s(4),
            marginTop: s(5),
            borderRadius: s(2),
            background: "rgba(255,255,255,0.1)",
          }}
        >
          <div
            style={{
              display: "flex",
              width: `${PCT}%`,
              height: s(4),
              borderRadius: s(2),
              background: TONE.ok,
              opacity: 0.75,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: s(7),
            fontSize: s(11),
          }}
        >
          <div style={{ color: quiet }}>Resets in 2h 30m</div>
          <div style={{ color: "rgba(255,178,36,0.9)" }}>Full by 4:01 PM</div>
        </div>
        <div
          style={{
            display: "flex",
            height: 1,
            marginTop: s(10),
            background: "rgba(255,255,255,0.08)",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: s(9),
            fontSize: s(12),
          }}
        >
          <div style={{ color: label }}>Weekly</div>
          <div style={{ color: "rgba(255,255,255,0.85)" }}>31%</div>
        </div>
      </div>
    </div>
  );
}

export async function renderOgCard() {
  const icon = await readFile(join(process.cwd(), "public/app-icon.png"));
  const iconSrc = `data:image/png;base64,${icon.toString("base64")}`;
  const text = `claudget${HEADLINE}${FOOT}${CARD}`;
  const [regular, semibold, bold] = await Promise.all([
    geist(400, text),
    geist(600, text),
    geist(700, text),
  ]);
  const fonts = (
    [
      [regular, 400],
      [semibold, 600],
      [bold, 700],
    ] as const
  ).flatMap(([data, weight]) =>
    data ? [{ name: "Geist", data, weight, style: "normal" as const }] : [],
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 72,
          fontFamily: fonts.length > 0 ? "Geist" : undefined,
          background: PAPER,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSrc} width={84} height={84} alt="" style={{ margin: -8 }} />
            <div
              style={{
                marginLeft: 26,
                fontSize: 34,
                fontWeight: 700,
                color: PAPER_INK,
                letterSpacing: -0.5,
              }}
            >
              claudget
            </div>
          </div>
          <div
            style={{
              marginTop: 44,
              maxWidth: 520,
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1.06,
              letterSpacing: -2,
              color: PAPER_INK,
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ marginTop: "auto", fontSize: 21, color: PAPER_INK_3 }}>{FOOT}</div>
        </div>
        <NotchArt />
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
