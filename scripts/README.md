# scripts

## Social preview image

`og.html` is the template for the 1200×630 image that link previews (Discord, X, Slack) show. To regenerate it:

1. `node scripts/og.mjs > og.html` prints the page with the Bloom drawing inlined.
2. Render it at 1200×630, for example with Cloudflare Browser Rendering (`POST /accounts/{account_id}/browser-rendering/screenshot` with `html` and `viewport`), or any headless browser.
3. Store the PNG in the `assets` table of your D1 database (migration `0002_assets.sql`):

   ```bash
   npx wrangler d1 execute grow-cloud --remote --command \
     "INSERT OR REPLACE INTO assets (name, type, data, updated_at) VALUES ('og.png', 'image/png', X'$(xxd -p og.png | tr -d '\n')', unixepoch() * 1000)"
   ```

The Worker serves it at `/og.png`. Without it, `/og.png` returns 404 and previews fall back to text.
