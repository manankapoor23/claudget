"use client";

import { useEffect } from "react";

/**
 * Upgrades the macOS download from the universal build to the matching
 * single-arch build — but only when the architecture is known for certain.
 *
 * Why this can't be done on the server: macOS lies. On this M2, both
 * `navigator.platform` and the User-Agent report "MacIntel" / "Intel Mac OS X
 * 10_15_7", so header sniffing would hand every Apple Silicon Mac the Intel
 * build. Two signals do tell the truth:
 *
 *   1. `getHighEntropyValues(['architecture'])` → "arm" | "x86". Definitive,
 *      but Chromium-only and requires a secure context.
 *   2. The WebGL renderer string, e.g. "ANGLE (Apple, ANGLE Metal Renderer:
 *      Apple M2, …)". Used only for an explicit "Apple M<n>" match.
 *
 * Safari implements neither — it has no `userAgentData` and masks the renderer
 * to a bare "Apple GPU", which is identical on Intel and Apple Silicon. So
 * Safari is genuinely undetectable, and anything short of certainty must leave
 * the universal build in place rather than guess. A wrong guess here means an
 * app that won't launch; a "wrong" default just means a larger download.
 *
 * The server already rendered a working universal link, so this only ever
 * swaps one correct download for a smaller correct download.
 */

type Arch = "arm64" | "x64";

async function detectArch(): Promise<Arch | null> {
  // 1. User-Agent Client Hints — authoritative where implemented.
  try {
    const uaData = (
      navigator as unknown as {
        userAgentData?: {
          getHighEntropyValues(h: string[]): Promise<{ architecture?: string }>;
        };
      }
    ).userAgentData;

    if (uaData?.getHighEntropyValues) {
      const { architecture } = await uaData.getHighEntropyValues(["architecture"]);
      if (architecture === "arm") return "arm64";
      if (architecture === "x86") return "x64";
    }
  } catch {
    // Rejected or unavailable — fall through to the GPU string.
  }

  // 2. WebGL renderer. Only an explicit Apple-silicon chip counts; "Apple GPU"
  //    (Safari's masked value) is ambiguous and deliberately not matched.
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) {
      const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      if (/Apple\s+M\d/i.test(renderer)) return "arm64";
      if (/\b(Intel|AMD|Radeon)\b/i.test(renderer)) return "x64";
    }
  } catch {
    // WebGL blocked — stay on universal.
  }

  return null;
}

export default function MacArch() {
  useEffect(() => {
    // Only Macs have a choice to make here.
    if (!/Mac/i.test(navigator.platform || navigator.userAgent || "")) return;

    let cancelled = false;
    void detectArch().then((arch) => {
      if (cancelled || !arch) return;

      // Only claim an architecture the current release actually ships. Older
      // releases carry the universal dmg alone; setting `data-arch` there would
      // un-badge the universal row without a per-arch row to badge instead, so
      // the download table would highlight nothing at all.
      const offered =
        document.querySelector(`[data-arch-swap][data-href-${arch}]`) ??
        document.querySelector(arch === "arm64" ? ".dl--macArm64" : ".dl--macX64");
      if (!offered) return;

      // Re-point every element that carries a variant for this arch. Each one
      // already has a valid universal href, so a missing attribute is a no-op.
      document.querySelectorAll<HTMLElement>("[data-arch-swap]").forEach((el) => {
        const href = el.dataset[arch === "arm64" ? "hrefArm64" : "hrefX64"];
        const size = el.dataset[arch === "arm64" ? "sizeArm64" : "sizeX64"];
        if (!href || !size) return;

        if (el instanceof HTMLAnchorElement) el.href = href;
        const label = el.querySelector<HTMLElement>("[data-arch-size]");
        if (label) label.textContent = size;
      });

      // Lets CSS badge the matching row in the download table.
      document.documentElement.dataset.arch = arch;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
