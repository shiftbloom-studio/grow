# Contributing to grow

Thanks for helping grow grow. Bug reports, ideas, docs and code are all welcome.

## Before you start

- Look through [open issues](https://github.com/shiftbloom-studio/grow/issues) first. If nothing fits, open one and describe what you want to change, so we can agree on the approach before you spend time on it.
- Small fixes (typos, obvious bugs) can go straight to a pull request.
- Security problems: please don't open a public issue, see [SECURITY.md](SECURITY.md).

## Local setup

Requirements: Node.js 26+ and npm.

```bash
git clone https://github.com/shiftbloom-studio/grow.git
cd grow
npm install
cp .dev.vars.example .dev.vars          # optional, only for Twitch login
npx wrangler d1 migrations apply grow-cloud --local
npm run dev                              # http://localhost:8787
```

Everything runs locally through Wrangler and Miniflare. You don't need a Cloudflare account to develop.

Open `/app`, create an overlay and use **Try a chat command** to simulate viewers without a Twitch channel.

## Project layout

| Path | What lives there |
| --- | --- |
| `src/index.ts` | Worker entry: routing, auth, sessions, security headers |
| `src/channel.ts` | `ChannelRoom` Durable Object: tasks, WebSockets, Twitch chat |
| `src/commands.ts` | Chat command and IRC parsing (pure, unit tested) |
| `src/pages/` | Landing, dashboard, overlay, brand CSS and the Bloom mark |
| `migrations/` | D1 schema |
| `test/` | Vitest unit tests |

## Checks

Run these before you open a pull request. CI runs the same.

```bash
npm run typecheck
npm test
```

If you change chat parsing, add a test in `test/commands.test.ts`.

## Pull requests

- Keep them focused: one change per PR.
- Describe what changed and how you tested it. Screenshots help for UI changes.
- New migrations get a new numbered file in `migrations/`; never edit an applied one.
- UI follows the shiftbloom brand book: white mode, Bloom Red `#FF2E52` as the only accent, Clash Display for headlines, General Sans for text, JetBrains Mono for labels and numbers. Overlay themes may be louder, they live on stream.

## Working on an issue

Issues labeled `good first issue` or `help wanted` are open to anyone. Before you write code:

1. Comment on the issue and say how you plan to approach it: the files you expect to touch, and anything you would do differently from what the issue suggests. A few sentences are enough.
2. Wait until a maintainer assigns the issue to you. That way two people don't build the same thing, and we can point out a dead end before you spend an evening on it.
3. Open the pull request and link the issue (`Closes #123`).

Typo fixes and other small, obvious changes can go straight to a pull request.

If an assigned issue sees no activity for 14 days, we'll check in and may hand it to someone else. You're welcome to pick it up again later.

## Using AI tools

You're welcome to use AI assistants, the same way you'd use an editor or a linter. We only ask that a person stands behind every contribution:

- You have read and understood every line you submit, and you ran the checks yourself.
- You answer review questions in your own words and can change the code when we ask.
- The pull request description explains what you decided and why. The diff already shows what changed.

Issues, comments and pull requests that an agent wrote and posted on its own, with nobody actually involved, will be closed. This isn't about the tool. We'd like to get to know the people who work on this project.

## License

By contributing you agree that your contributions are licensed under the [GNU AGPL v3.0 or later](LICENSE) (`AGPL-3.0-or-later`), like the rest of the project.
