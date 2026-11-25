# Security policy

## Reporting a vulnerability

Please report security issues privately, not in public issues or pull requests.

Use GitHub's [private vulnerability reporting](https://github.com/shiftbloom-studio/grow/security/advisories/new) ("Report a vulnerability" on the Security tab). Only the maintainers can see it.

Include what you found, how to reproduce it and the impact you expect. We aim to answer within 3 working days and will keep you posted until it's fixed. If you like, we credit you in the release notes.

## Supported versions

Only the latest `main` (and the hosted version at grow.shiftbloom.studio) receives security fixes.

## Scope

In scope: this repository and the hosted instance. Out of scope: denial of service through volume, findings that need a compromised device, and reports from automated scanners without a working proof of concept.

## How grow handles data

- Dashboard keys and session tokens are stored only as SHA-256 hashes.
- Overlay links are read-only and can be rotated at any time.
- Twitch chat is read anonymously and only while an overlay or dashboard is connected. No chat history is stored, only the tasks viewers create.
- Twitch login (when enabled) only reads your public user id and login; the access token is revoked right after sign-in.
