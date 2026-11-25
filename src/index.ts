// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 shiftbloom studio and contributors
import { ChannelRoom } from "./channel";
import { cleanText } from "./commands";
import type { Env } from "./types";
import landingHtml from "./pages/landing.html";
import appHtml from "./pages/app.html";
import overlayHtml from "./pages/overlay.html";
import brandCss from "./pages/brand.css";
import bloomJs from "./pages/bloom.js.txt";
import faviconSvg from "./pages/favicon.svg";
import commandsHtml from "./pages/commands.html";
import llmsTxt from "./pages/llms.txt";
import { FONTS_CSS, fontResponse } from "./fonts";

export { ChannelRoom };

const SESSION_COOKIE = "grow_session";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 60; // 60 days
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomId(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "SAMEORIGIN",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
};

function html(body: string, extra: HeadersInit = {}) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": CSP,
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

function asset(body: BodyInit, type: string, extra: HeadersInit = {}) {
  return new Response(body, {
    headers: { "content-type": type, "cache-control": "public, max-age=3600", ...SECURITY_HEADERS, ...extra },
  });
}

const SITE = "https://grow.shiftbloom.studio";

function robotsTxt(base: string) {
  return `User-agent: *\nDisallow: /o/\nDisallow: /api/\nDisallow: /ws/\nDisallow: /auth/\n\nSitemap: ${base}/sitemap.xml\n`;
}

function sitemapXml(base: string) {
  const urls = ["/", "/commands"].map((p) => `  <url><loc>${base}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const NOINDEX = { "x-robots-tag": "noindex, nofollow" };

/** Per-IP limit for account creation and logins (Workers rate limiting binding). */
async function limited(req: Request, env: Env): Promise<boolean> {
  if (!env.RL_AUTH) return false;
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const { success } = await env.RL_AUTH.limit({ key: ip });
  return !success;
}

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

function getCookie(req: Request, name: string): string | null {
  const c = req.headers.get("cookie") || "";
  for (const part of c.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function cookie(name: string, value: string, maxAgeSec: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function origin(req: Request, env: Env) {
  return env.PUBLIC_URL || new URL(req.url).origin;
}

interface ChannelRow { id: string; name: string; overlay_key: string; twitch_login: string | null; twitch_user_id: string | null; created_at: number }

async function createSession(env: Env, channelId: string): Promise<string> {
  const token = randomId(40);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, channel_id, created_at, expires_at) VALUES (?,?,?,?)")
    .bind(await sha256(token), channelId, now, now + SESSION_TTL).run();
  return token;
}

async function currentChannel(req: Request, env: Env): Promise<ChannelRow | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT c.* FROM sessions s JOIN channels c ON c.id = s.channel_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).bind(await sha256(token), Date.now()).first<ChannelRow>();
}

/** CSRF guard for cookie-authenticated mutations: require same-origin. */
function sameOrigin(req: Request): boolean {
  const o = req.headers.get("origin");
  return !o || o === new URL(req.url).origin;
}

function stub(env: Env, channelId: string) {
  return env.CHANNEL.get(env.CHANNEL.idFromName(channelId));
}

async function newChannel(env: Env, name: string, twitch?: { id: string; login: string }) {
  const id = randomId(12);
  const adminKey = `grow_${randomId(36)}`;
  const overlayKey = randomId(24);
  await env.DB.prepare(
    "INSERT INTO channels (id, name, admin_key_hash, overlay_key, twitch_user_id, twitch_login, created_at) VALUES (?,?,?,?,?,?,?)",
  ).bind(id, name, await sha256(adminKey), overlayKey, twitch?.id ?? null, twitch?.login ?? null, Date.now()).run();
  await stub(env, id).fetch("https://do/init", {
    method: "POST",
    body: JSON.stringify({ twitchLogin: twitch?.login ?? "", title: "Today's tasks" }),
  });
  return { id, adminKey, overlayKey };
}

function meResponse(req: Request, env: Env, ch: ChannelRow) {
  return {
    id: ch.id,
    name: ch.name,
    twitchLogin: ch.twitch_login,
    twitchLinked: !!ch.twitch_user_id,
    overlayUrl: `${origin(req, env)}/o/${ch.overlay_key}`,
  };
}

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === "/api/config") {
    return json({ twitchLogin: !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) });
  }

  if (path === "/api/channels" && req.method === "POST") {
    if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
    if (await limited(req, env)) return json({ error: "Too many requests. Wait a minute and try again." }, 429);
    const body = (await req.json().catch(() => ({}))) as { name?: string };
    const name = cleanText(body.name || "", 40) || "Today's tasks";
    const ch = await newChannel(env, name);
    const token = await createSession(env, ch.id);
    return json(
      { adminKey: ch.adminKey, overlayUrl: `${origin(req, env)}/o/${ch.overlayKey}` },
      201,
      { "set-cookie": cookie(SESSION_COOKIE, token, SESSION_TTL / 1000) },
    );
  }

  if (path === "/api/login" && req.method === "POST") {
    if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
    if (await limited(req, env)) return json({ error: "Too many requests. Wait a minute and try again." }, 429);
    const body = (await req.json().catch(() => ({}))) as { key?: string };
    const key = (body.key || "").trim();
    if (!/^grow_[A-Za-z0-9]{36}$/.test(key)) return json({ error: "invalid key" }, 401);
    const ch = await env.DB.prepare("SELECT id FROM channels WHERE admin_key_hash = ?").bind(await sha256(key)).first<{ id: string }>();
    if (!ch) return json({ error: "invalid key" }, 401);
    const token = await createSession(env, ch.id);
    return json({ ok: true }, 200, { "set-cookie": cookie(SESSION_COOKIE, token, SESSION_TTL / 1000) });
  }

  if (path === "/api/logout" && req.method === "POST") {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": cookie(SESSION_COOKIE, "", 0) });
  }

  const ch = await currentChannel(req, env);
  if (!ch) return json({ error: "unauthorized" }, 401);

  if (path === "/api/me") {
    await env.DB.prepare("UPDATE channels SET last_seen_at = ? WHERE id = ?").bind(Date.now(), ch.id).run();
    return json(meResponse(req, env, ch));
  }

  if (path === "/api/ws") {
    if (req.headers.get("Upgrade") !== "websocket") return json({ error: "expected websocket" }, 426);
    if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
    return stub(env, ch.id).fetch("https://do/ws?role=admin", req);
  }

  if (req.method !== "POST" || !sameOrigin(req)) return json({ error: "not found" }, 404);

  if (path === "/api/rename") {
    const body = (await req.json().catch(() => ({}))) as { name?: string };
    const name = cleanText(body.name || "", 40);
    if (!name) return json({ error: "name required" }, 400);
    await env.DB.prepare("UPDATE channels SET name = ? WHERE id = ?").bind(name, ch.id).run();
    return json({ ok: true });
  }

  if (path === "/api/rotate-overlay") {
    const overlayKey = randomId(24);
    await env.DB.prepare("UPDATE channels SET overlay_key = ? WHERE id = ?").bind(overlayKey, ch.id).run();
    await stub(env, ch.id).fetch("https://do/kick-overlays", { method: "POST" });
    return json({ overlayUrl: `${origin(req, env)}/o/${overlayKey}` });
  }

  if (path === "/api/rotate-admin") {
    const adminKey = `grow_${randomId(36)}`;
    await env.DB.batch([
      env.DB.prepare("UPDATE channels SET admin_key_hash = ? WHERE id = ?").bind(await sha256(adminKey), ch.id),
      env.DB.prepare("DELETE FROM sessions WHERE channel_id = ? AND token_hash != ?").bind(ch.id, await sha256(getCookie(req, SESSION_COOKIE) || "")),
    ]);
    return json({ adminKey });
  }

  if (path === "/api/delete-channel") {
    await stub(env, ch.id).fetch("https://do/wipe", { method: "POST" });
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE channel_id = ?").bind(ch.id),
      env.DB.prepare("DELETE FROM channels WHERE id = ?").bind(ch.id),
    ]);
    return json({ ok: true }, 200, { "set-cookie": cookie(SESSION_COOKIE, "", 0) });
  }

  return json({ error: "not found" }, 404);
}

async function twitchAuth(req: Request, env: Env, url: URL): Promise<Response> {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return new Response("Twitch sign-in isn't set up on this server.", { status: 404 });
  const redirectUri = `${origin(req, env)}/auth/twitch/callback`;
  if (url.pathname === "/auth/twitch") {
    const state = randomId(24);
    const auth = new URL("https://id.twitch.tv/oauth2/authorize");
    auth.search = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", scope: "", state }).toString();
    return new Response(null, { status: 302, headers: { location: auth.toString(), "set-cookie": cookie("grow_oauth", state, 600) } });
  }
  if (await limited(req, env)) return new Response("Too many requests. Wait a minute and try again.", { status: 429 });
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || !state || state !== getCookie(req, "grow_oauth")) return new Response("The Twitch sign-in timed out. Start again.", { status: 400 });
  const tok = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
  });
  if (!tok.ok) return new Response("Twitch didn't accept the sign-in. Try again.", { status: 502 });
  const { access_token } = (await tok.json()) as { access_token: string };
  const usr = await fetch("https://api.twitch.tv/helix/users", { headers: { authorization: `Bearer ${access_token}`, "client-id": env.TWITCH_CLIENT_ID } });
  const { data } = (await usr.json()) as { data: { id: string; login: string; display_name: string }[] };
  const tw = data?.[0];
  if (!tw) return new Response("Couldn't look up your Twitch account. Try again.", { status: 502 });
  // revoke: we only needed identity
  await fetch("https://id.twitch.tv/oauth2/revoke", { method: "POST", body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, token: access_token }) }).catch(() => {});

  let channelId: string;
  let fresh: string | null = null;
  const existing = await env.DB.prepare("SELECT id FROM channels WHERE twitch_user_id = ?").bind(tw.id).first<{ id: string }>();
  if (existing) {
    channelId = existing.id;
    await env.DB.prepare("UPDATE channels SET twitch_login = ? WHERE id = ?").bind(tw.login, channelId).run();
  } else {
    const created = await newChannel(env, tw.display_name || tw.login, { id: tw.id, login: tw.login });
    channelId = created.id;
    fresh = created.adminKey;
  }
  const token = await createSession(env, channelId);
  const headers = new Headers({ location: fresh ? `/app#welcome=${fresh}` : "/app" });
  headers.append("set-cookie", cookie(SESSION_COOKIE, token, SESSION_TTL / 1000));
  headers.append("set-cookie", cookie("grow_oauth", "", 0));
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const base = (env.PUBLIC_URL || SITE).replace(/\/$/, "");
    try {
      if (path === "/") return html(landingHtml);
      if (path === "/commands") return html(commandsHtml);
      if (path === "/app") return html(appHtml, NOINDEX);
      if (path === "/healthz") return json({ ok: true });
      if (path === "/robots.txt") return asset(robotsTxt(base), "text/plain; charset=utf-8");
      if (path === "/sitemap.xml") return asset(sitemapXml(base), "application/xml; charset=utf-8");
      if (path === "/llms.txt") return asset(llmsTxt, "text/plain; charset=utf-8");
      if (path === "/og.png") {
        // rendered from scripts/og.html and stored in D1 (see scripts/README.md), so no binary lives in the bundle
        const img = await env.DB.prepare("SELECT data, type FROM assets WHERE name = ?").bind("og.png").first<{ data: number[] | ArrayBuffer; type: string }>();
        if (!img) return new Response("Not found", { status: 404, headers: NOINDEX });
        return asset(new Uint8Array(img.data as ArrayBuffer), img.type, { "cache-control": "public, max-age=86400" });
      }
      if (path === "/fonts.css") return asset(FONTS_CSS, "text/css; charset=utf-8", { "cache-control": "public, max-age=86400" });
      if (path.startsWith("/fonts/")) return await fontResponse(path.slice(7), ctx);
      if (path === "/assets/brand.css") return asset(brandCss, "text/css; charset=utf-8");
      if (path === "/assets/bloom.js") return asset(bloomJs, "text/javascript; charset=utf-8");
      if (path === "/assets/favicon.svg" || path === "/favicon.ico") return asset(faviconSvg, "image/svg+xml");
      if (path.startsWith("/api/")) return await handleApi(req, env, url);
      if (path.startsWith("/auth/twitch")) return await twitchAuth(req, env, url);

      const overlay = /^\/o\/([A-Za-z0-9]{24})$/.exec(path);
      if (overlay) return html(overlayHtml, NOINDEX);

      const ws = /^\/ws\/([A-Za-z0-9]{24})$/.exec(path);
      if (ws) {
        if (req.headers.get("Upgrade") !== "websocket") return json({ error: "expected websocket" }, 426);
        const ch = await env.DB.prepare("SELECT id FROM channels WHERE overlay_key = ?").bind(ws[1]).first<{ id: string }>();
        if (!ch) return json({ error: "unknown overlay" }, 404);
        const preview = url.searchParams.get("preview") === "1" ? "&preview=1" : "";
        return stub(env, ch.id).fetch(`https://do/ws?role=overlay${preview}`, req);
      }
      return new Response("Not found", { status: 404, headers: NOINDEX });
    } catch (err) {
      console.error(err);
      return json({ error: "internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
