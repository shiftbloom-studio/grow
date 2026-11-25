// SPDX-License-Identifier: AGPL-3.0-or-later
// Prints the self-contained HTML for the social preview image (scripts/og.html with the Bloom script inlined).
// Render it at 1200x630 with any headless browser, e.g. Cloudflare Browser Rendering's /screenshot endpoint.
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("./og.html", import.meta.url), "utf8");
const bloom = readFileSync(new URL("../src/pages/bloom.js.txt", import.meta.url), "utf8");
process.stdout.write(html.replace("/*BLOOM*/", bloom));
