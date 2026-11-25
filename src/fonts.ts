// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 shiftbloom studio and contributors
//
// First-party font delivery. Browsers only ever talk to this origin: the Worker
// resolves each cut once from the upstream foundry CSS (Fontshare, Google Fonts),
// fetches the woff2 server-side and keeps it in the edge cache. No visitor IP is
// sent to a third party, and there is no render-blocking cross-origin CSS.

interface FontCut {
  family: string;
  weight: number;
  /** Upstream CSS that lists exactly this cut. */
  css: string;
  /** For Google Fonts: the subset block to take from the CSS. */
  subset?: string;
}

const fontshare = (slug: string, w: number) => `https://api.fontshare.com/v2/css?f[]=${slug}@${w}&display=swap`;
const google = (family: string, w: number) => `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${w}&display=swap`;

/** Only the cuts the pages actually use. */
export const FONT_CUTS: Record<string, FontCut> = {
  "clash-display-400": { family: "Clash Display", weight: 400, css: fontshare("clash-display", 400) },
  "clash-display-600": { family: "Clash Display", weight: 600, css: fontshare("clash-display", 600) },
  "general-sans-400": { family: "General Sans", weight: 400, css: fontshare("general-sans", 400) },
  "general-sans-500": { family: "General Sans", weight: 500, css: fontshare("general-sans", 500) },
  "general-sans-600": { family: "General Sans", weight: 600, css: fontshare("general-sans", 600) },
  "jetbrains-mono-400": { family: "JetBrains Mono", weight: 400, css: google("JetBrains Mono", 400), subset: "latin" },
  "jetbrains-mono-500": { family: "JetBrains Mono", weight: 500, css: google("JetBrains Mono", 500), subset: "latin" },
};

const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

export const FONTS_CSS = Object.entries(FONT_CUTS)
  .map(([name, c]) =>
    `@font-face{font-family:"${c.family}";font-style:normal;font-weight:${c.weight};font-display:swap;src:url(/fonts/${name}.woff2) format("woff2")${c.subset ? `;unicode-range:${LATIN}` : ""}}`,
  )
  .join("\n") + "\n";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ALLOWED_HOSTS = new Set(["cdn.fontshare.com", "fonts.gstatic.com"]);

/** Pull the woff2 URL for one cut out of the upstream CSS. Exported for tests. */
export function pickWoff2(css: string, subset?: string): string | null {
  let scope = css;
  if (subset) {
    const at = css.indexOf(`/* ${subset} */`);
    if (at < 0) return null;
    scope = css.slice(at, css.indexOf("}", at) + 1);
  }
  const m = /url\(\s*['"]?((?:https:)?\/\/[^'")\s]+\.woff2)['"]?\s*\)/.exec(scope);
  if (!m) return null;
  const u = new URL(m[1].startsWith("//") ? `https:${m[1]}` : m[1]);
  return ALLOWED_HOSTS.has(u.hostname) ? u.toString() : null;
}

// short cache so a failed upstream doesn't stick; the page falls back to system fonts meanwhile
const unavailable = () => new Response("Font source unavailable", { status: 502, headers: { "cache-control": "no-store" } });

export async function fontResponse(file: string, ctx: ExecutionContext): Promise<Response> {
  const name = /^([a-z-]+-\d{3})\.woff2$/.exec(file)?.[1];
  const cut = name ? FONT_CUTS[name] : undefined;
  if (!name || !cut) return new Response("Not found", { status: 404 });

  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://grow-fonts.internal/${name}.woff2`);
  const hit = await cache.match(key);
  if (hit) return hit;

  let font: Response;
  try {
    const css = await fetch(cut.css, { headers: { "user-agent": UA, accept: "text/css" } });
    const src = css.ok ? pickWoff2(await css.text(), cut.subset) : null;
    if (!src) return unavailable();
    font = await fetch(src, { headers: { "user-agent": UA } });
  } catch {
    return unavailable();
  }
  if (!font.ok || !font.body) return unavailable();

  const res = new Response(font.body, {
    headers: {
      "content-type": "font/woff2",
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
