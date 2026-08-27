import { OG_ALT, OG_SIZE, renderOgCard } from "./og-card";

// Same card as Open Graph — `summary_large_image` expects the same 1.91:1 ratio.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return renderOgCard();
}
