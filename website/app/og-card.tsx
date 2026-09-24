import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The shared 1200×630 preview card, used for both Open Graph and Twitter —
 * the 1.91:1 ratio every consumer (Google, X, Slack, LinkedIn, iMessage)
 * expects for `summary_large_image`.
 *
 * Rendered with next/og (Satori), so no committed binary. Satori supports a
 * subset of CSS — flexbox only, no CSS variables — hence the explicit inline
 * styles. Colours are the site's dark tokens, hardcoded for the same reason.
 * The mock on the right is the app's own pill and limit row.
 *
 * Satori's bundled face has a single regular weight, so Geist (the app's face
 * off the Mac) is fetched at render time, subset to the card's own text. If
 * that fails the card still renders, in the default face.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT =
  "claudget — see your Claude Code limits before you hit them. A menu bar app showing the 5-hour limit at 62%, full by 4:01 PM at the pace so far.";

const BG = "#0c0c0d";
const SURFACE = "#17171a";
const INK = "#ededee";
const INK_2 = "rgba(237, 237, 238, 0.66)";
const INK_3 = "rgba(237, 237, 238, 0.5)";
const LINE = "rgba(255, 255, 255, 0.13)";
const TRACK = "rgba(255, 255, 255, 0.1)";
const TINT = "#ff7a50";
const WARN = "#ffb020";

const HEADLINE = "See your Claude Code limits before you hit them.";
const FOOT = "Free and open source · macOS, Windows, Linux";
const MOCK = "5-hour62%2h 30mleftFull by 4:01 PM";

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

export async function renderOgCard() {
  const icon = await readFile(join(process.cwd(), "public/app-icon.png"));
  const iconSrc = `data:image/png;base64,${icon.toString("base64")}`;
  const text = `claudget${HEADLINE}${FOOT}${MOCK}`;
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
          background: BG,
          backgroundImage:
            "radial-gradient(circle at 100% 0%, rgba(255, 128, 84, 0.26), rgba(12, 12, 13, 0) 55%)",
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
                color: INK,
                letterSpacing: -0.5,
              }}
            >
              claudget
            </div>
          </div>
          <div
            style={{
              marginTop: 44,
              maxWidth: 620,
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1.06,
              letterSpacing: -2.2,
              color: INK,
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ marginTop: "auto", fontSize: 24, color: INK_3 }}>{FOOT}</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-end",
            width: 380,
          }}
        >
          {/* The floating pill, with its coral ring. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: 330,
              height: 56,
              padding: "0 24px",
              borderRadius: 28,
              background: BG,
              border: `1.5px solid ${TINT}`,
              boxShadow: "0 0 26px rgba(255, 122, 80, 0.45)",
              fontSize: 19,
              color: INK_2,
            }}
          >
            <div
              style={{ width: 10, height: 10, borderRadius: 5, background: TINT, marginRight: 14 }}
            />
            5-hour
            <div style={{ marginLeft: 12, fontSize: 23, fontWeight: 600, color: INK }}>62%</div>
            <div style={{ marginLeft: "auto" }}>2h 30m</div>
          </div>

          {/* The limit row: fill past the tick means ahead of pace. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 380,
              marginTop: 32,
              padding: "26px 28px 24px",
              borderRadius: 20,
              background: SURFACE,
              border: `1px solid ${LINE}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <div style={{ fontSize: 20, color: INK }}>5-hour</div>
              <div style={{ fontSize: 52, fontWeight: 600, letterSpacing: -1.5, color: INK }}>
                62%
              </div>
            </div>
            <div
              style={{
                display: "flex",
                position: "relative",
                height: 12,
                marginTop: 14,
                borderRadius: 6,
                background: TRACK,
              }}
            >
              <div style={{ display: "flex", width: "62%", height: 12, borderRadius: 6, background: TINT }} />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: -5,
                  width: 3,
                  height: 22,
                  marginLeft: -1.5,
                  borderRadius: 2,
                  background: INK,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 14,
                fontSize: 17,
                color: INK_2,
              }}
            >
              <div>2h 30m left</div>
              <div style={{ color: WARN }}>Full by 4:01 PM</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
