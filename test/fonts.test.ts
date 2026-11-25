// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 shiftbloom studio and contributors
import { describe, expect, it } from "vitest";
import { FONTS_CSS, pickWoff2 } from "../src/fonts";

describe("fonts", () => {
  it("serves only same-origin font URLs", () => {
    expect(FONTS_CSS).toContain("url(/fonts/general-sans-400.woff2)");
    expect(FONTS_CSS).not.toMatch(/https?:/);
  });

  it("takes the woff2 from Fontshare CSS", () => {
    const css = "@font-face{font-family:'General Sans';src:url('//cdn.fontshare.com/wf/ABC123.woff2') format('woff2'),url('//cdn.fontshare.com/wf/ABC123.woff') format('woff');font-weight:400}";
    expect(pickWoff2(css)).toBe("https://cdn.fontshare.com/wf/ABC123.woff2");
  });

  it("takes the latin subset from Google Fonts CSS", () => {
    const css = "/* cyrillic */\n@font-face { src: url(https://fonts.gstatic.com/s/x/cyr.woff2) format('woff2'); }\n/* latin */\n@font-face { src: url(https://fonts.gstatic.com/s/x/latin.woff2) format('woff2'); }";
    expect(pickWoff2(css, "latin")).toBe("https://fonts.gstatic.com/s/x/latin.woff2");
  });

  it("refuses other hosts", () => {
    expect(pickWoff2("src:url(https://evil.example/f.woff2)")).toBeNull();
  });
});
