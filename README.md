# grow.

[![CI](https://github.com/shiftbloom-studio/grow/actions/workflows/ci.yml/badge.svg)](https://github.com/shiftbloom-studio/grow/actions/workflows/ci.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-FF2E52.svg)](LICENSE)

grow puts a to-do list on your stream that your chat can edit. Viewers add goals with `!task` and tick them off with `!done`, and the list updates in OBS while everyone works. It started as a tool for study streams, where watching other people finish things turns out to be motivating.

Hosted version, free to use: **https://grow.shiftbloom.studio**

## Using the hosted version

1. Open [grow.shiftbloom.studio/app](https://grow.shiftbloom.studio/app) and create an overlay.
2. Save the dashboard key that is shown once. It's your login on other devices.
3. Enter your Twitch channel in the settings.
4. In OBS add a **Browser** source with the overlay link. The background is transparent, no extra CSS needed.

No bot account is needed. grow reads chat anonymously and only while an overlay or the dashboard is open. The full command reference with examples is at [grow.shiftbloom.studio/commands](https://grow.shiftbloom.studio/commands).

### Chat commands

| Command | Who | What |
| --- | --- | --- |
| `!task <text>` (`!add`, `!todo`) | allowed viewers | add a task |
| `!done [n]` | everyone | finish your first open (or n-th) task |
| `!undo [n]` | everyone | reopen a finished task |
| `!edit [n] <text>` | everyone | change a task |
| `!remove [n]` | everyone | delete a task |
| `!mytasks` | everyone | highlight your tasks on the overlay |
| `!cleardone`, `!clearall`, `!clearuser @name` | mods, broadcaster | moderation |

The prefix, who may add tasks (everyone, subs, VIPs, mods), the per-viewer limit and the total limit are configurable.

### Overlay options

Themes (`glass`, `minimal`, `neon`, `paper`, `bloom`), accent color, font size, width, max height, grouping by viewer, hiding finished tasks, auto-scroll and the short notice viewers see when a command doesn't work are set live from the dashboard. Every overlay link also accepts URL overrides, e.g. `?theme=neon&accent=ff00aa&toasts=0`.

## Architecture

```
OBS browser source ──ws──┐
Dashboard ───────ws──────┤   Worker (router, auth)   ── D1: channels, sessions
                         └──▶ Durable Object per channel
                               ├─ SQLite: tasks, settings
                               ├─ hibernating WebSockets (overlays + dashboard)
                               └─ Twitch IRC (anonymous, only while someone is connected)
```

| Part | File | Role |
| --- | --- | --- |
| Worker | `src/index.ts` | pages, REST API, cookie sessions, optional Twitch OAuth, security headers |
| Durable Object `ChannelRoom` | `src/channel.ts` | one per channel; owns tasks, applies chat commands, fans out updates |
| Parser | `src/commands.ts` | chat commands and Twitch IRC lines |
| Fonts | `src/fonts.ts` | serves the brand fonts from the Worker's own origin, cached at the edge |
| D1 | `migrations/` | channel accounts, hashed dashboard keys, sessions |

Overlay links are read-only. Dashboard keys and session tokens are stored only as SHA-256 hashes. Pages send a strict CSP and the usual security headers, sign-in and overlay creation have a per-IP rate limit, and there is no `workers.dev` route, so traffic always passes the zone's WAF. Browsers never contact a third party: fonts are served from the same origin. See [SECURITY.md](SECURITY.md).

## Development

Requirements: Node.js 22+. No Cloudflare account needed.

```bash
npm install
cp .dev.vars.example .dev.vars          # optional
npx wrangler d1 migrations apply grow-cloud --local
npm run dev                              # http://localhost:8787
npm test                                 # unit tests
npm run typecheck
```

More in [CONTRIBUTING.md](CONTRIBUTING.md).

## Self-hosting

grow runs entirely on Cloudflare's developer platform (Workers, Durable Objects with SQLite, D1, Workers rate limiting). The Workers Paid plan is required for Durable Objects.

1. **Fork and install**
   ```bash
   git clone https://github.com/<you>/grow.git && cd grow && npm install
   npx wrangler login
   ```
2. **Create the database** and replace `<your-d1-database-id>` in `wrangler.jsonc` with the id it prints:
   ```bash
   npx wrangler d1 create grow-cloud
   npm run db:migrate
   ```
3. **Set your domain.** In `wrangler.jsonc`, uncomment the `routes` example with a hostname on a zone in your account and set `vars.PUBLIC_URL` to the same origin. Without a custom domain, set `"workers_dev": true` instead.
4. **Deploy**
   ```bash
   npm run deploy
   ```
5. **Optional: deploy on every push with Workers Builds.** Connect the repository to the Worker in the Cloudflare dashboard (Settings > Build) and add the build variables `D1_DATABASE_ID` and `GROW_HOSTNAME`. The deploy command fills them into `wrangler.jsonc`, so your ids never have to be committed. See [Continuous deployment](#continuous-deployment).
6. **Optional: Twitch login.** Create an app at [dev.twitch.tv](https://dev.twitch.tv/console/apps) with redirect URL `https://<your-domain>/auth/twitch/callback`, then:
   ```bash
   npx wrangler secret put TWITCH_CLIENT_ID
   npx wrangler secret put TWITCH_CLIENT_SECRET
   ```
7. **Legal pages.** grow serves a privacy policy and an imprint in English and German at `/privacy`, `/datenschutz`, `/imprint` and `/impressum`. They name whoever runs the copy, so set your details as secrets. They stay out of the repository and survive every deploy:
   ```bash
   npx wrangler secret put LEGAL_NAME       # person or company
   npx wrangler secret put LEGAL_STREET
   npx wrangler secret put LEGAL_CITY       # postcode and city
   npx wrangler secret put LEGAL_EMAIL
   ```
   `LEGAL_BUSINESS`, `LEGAL_COUNTRY`, `LEGAL_PHONE`, `LEGAL_VAT_ID` and `LEGAL_AUTHORITY` (the data protection authority responsible for you) are optional. Until the four required ones are set, the pages say that operator details are missing. Read the privacy policy before going live and adjust `src/legal.ts` if your copy processes more than the stock code does.

### Configuration

| Name | Kind | Required | Purpose |
| --- | --- | --- | --- |
| `DB` | D1 binding | yes | accounts and sessions |
| `CHANNEL` | Durable Object binding | yes | one `ChannelRoom` per overlay |
| `RL_AUTH` | rate limit binding | no | limits sign-in and creation per IP |
| `PUBLIC_URL` | var | no | origin used in overlay links (defaults to the request origin) |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | secrets | no | enables "Continue with Twitch" |
| `LEGAL_NAME`, `LEGAL_STREET`, `LEGAL_CITY`, `LEGAL_EMAIL` | secrets | yes, for a public copy | operator named in the imprint and privacy policy |
| `LEGAL_BUSINESS`, `LEGAL_COUNTRY`, `LEGAL_PHONE`, `LEGAL_VAT_ID`, `LEGAL_AUTHORITY` | secrets | no | more imprint details and the responsible data protection authority |

### Continuous deployment

`.github/workflows/ci.yml` runs typecheck and tests on every push and pull request. Deploys run in [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), so no API token is stored on GitHub. A working setup for `main`:

- Build command: `npm ci && npm run typecheck && npm test`
- Deploy command:
  ```bash
  sed -i "s/<your-d1-database-id>/$D1_DATABASE_ID/" wrangler.jsonc && sed -i "s|\"vars\": { \"PUBLIC_URL\": \"\" }|\"vars\": { \"PUBLIC_URL\": \"https://$GROW_HOSTNAME\" }, \"routes\": [{ \"pattern\": \"$GROW_HOSTNAME\", \"custom_domain\": true }]|" wrangler.jsonc && npx wrangler d1 migrations apply grow-cloud --remote && npx wrangler deploy
  ```
- Build variables: `D1_DATABASE_ID`, `GROW_HOSTNAME`, and `NODE_VERSION=26`

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Copyright (C) 2026 shiftbloom studio and contributors.

grow is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version (`AGPL-3.0-or-later`). See [LICENSE](LICENSE). If you run a modified version as a network service, you must offer its source to its users.

Made in Hamburg by [shiftbloom studio](https://shiftbloom.studio).
