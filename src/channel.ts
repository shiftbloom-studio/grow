// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 shiftbloom studio and contributors
import { DurableObject } from "cloudflare:workers";
import { cleanText, isMod, hasRole, parseCommand, parseIrcPrivmsg } from "./commands";
import { DEFAULT_SETTINGS, type ChatUser, type Env, type Settings, type Task } from "./types";
import { phCapture, phKey } from "./posthog";

type SocketRole = "admin" | "overlay";
interface Attachment { role: SocketRole; preview?: boolean }

/** Why a chat command did nothing. Shown on the overlay (if enabled) and in the dashboard log. */
export type Rejection = "limit" | "list full" | "not allowed" | "mods only" | "no task" | "cooldown";
export interface LogEntry { at: number; user: string; text: string; result: string; detail?: number | string }

const VERBS: Record<string, string> = { add: "added", done: "finished", undo: "reopened", edit: "edited", remove: "removed", mine: "highlighted", clearDone: "cleared finished", clearAll: "cleared the list", clearUser: "cleared a viewer" };

const STREAMER: ChatUser = { userId: "streamer", login: "streamer", displayName: "Streamer", color: "", roles: ["everyone", "broadcaster"] };
const PALETTE = ["#ff7a90", "#ffb86b", "#ffe66d", "#7cf29c", "#6bd5ff", "#9d8cff", "#ff8cf0", "#8cffe4"];

function colorFor(login: string): string {
  let h = 0;
  for (const c of login) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function clampSettings(input: Partial<Settings>, base: Settings): Settings {
  const s: Settings = { ...base };
  const str = (v: unknown, max: number) => (typeof v === "string" ? cleanText(v, max) : undefined);
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  if (str(input.title, 60) !== undefined) s.title = str(input.title, 60)!;
  if (typeof input.twitchLogin === "string") {
    const l = input.twitchLogin.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\/(www\.)?twitch\.tv\//, "");
    if (l === "" || /^[a-z0-9_]{3,25}$/.test(l)) s.twitchLogin = l;
  }
  if (typeof input.prefix === "string" && /^[!?.#~$%&+-]$/.test(input.prefix)) s.prefix = input.prefix;
  if (input.minRole && ["everyone", "subscriber", "vip", "moderator", "broadcaster"].includes(input.minRole)) s.minRole = input.minRole;
  if (input.theme && ["glass", "minimal", "neon", "paper", "bloom"].includes(input.theme)) s.theme = input.theme;
  if (typeof input.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(input.accent)) s.accent = input.accent;
  for (const [k, lo, hi] of [["maxPerUser", 1, 20], ["maxTasks", 5, 500], ["fontSize", 10, 48], ["width", 200, 1920], ["maxHeight", 120, 1080], ["scrollSpeed", 5, 200]] as const) {
    const v = num(input[k], lo, hi);
    if (v !== undefined) s[k] = v;
  }
  for (const k of ["chatEnabled", "showDone", "groupByUser", "autoScroll", "showRejections"] as const) {
    const v = bool(input[k]);
    if (v !== undefined) s[k] = v;
  }
  return s;
}

/** Pseudonymous reference for analytics: a hash of the object id, never the channel's name, login or keys. */
export async function channelRef(id: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`grow-channel:${id}`));
  return [...new Uint8Array(d).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Dashboard actions that are counted; anything else a client sends is not a key in the stats. */
const DASHBOARD_OPS = new Set(["add", "toggle", "edit", "delete", "move", "clearDone", "clearAll", "settings", "simulate", "delete-many"]);

export class ChannelRoom extends DurableObject<Env> {
  private settings: Settings = DEFAULT_SETTINGS;
  private irc: WebSocket | null = null;
  private ircChannel = "";
  private ircConnecting = false;
  private seen = new Set<string>();
  private cooldown = new Map<string, number>();
  private rejectNotice = new Map<string, number>();
  private log: LogEntry[] = [];
  private lastVerb = "done";
  /** Counts of chat commands and dashboard actions since the last report (sent from the alarm, at most once a minute). */
  private stats: Record<string, number> = {};

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, login TEXT NOT NULL, display_name TEXT NOT NULL,
        color TEXT NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, done_at INTEGER, position REAL NOT NULL)`);
      const stored = await ctx.storage.get<Partial<Settings>>("settings");
      this.settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
    });
  }

  // ---------- data ----------
  private tasks(): Task[] {
    return this.ctx.storage.sql
      .exec<Record<string, string | number | null>>("SELECT * FROM tasks ORDER BY position ASC")
      .toArray()
      .map((r) => ({
        id: r.id as string, userId: r.user_id as string, login: r.login as string, displayName: r.display_name as string,
        color: r.color as string, text: r.text as string, done: r.done === 1, createdAt: r.created_at as number,
        doneAt: (r.done_at as number | null) ?? null, position: r.position as number,
      }));
  }

  private userTasks(userId: string): Task[] {
    return this.tasks().filter((t) => t.userId === userId);
  }

  private addTask(user: ChatUser, text: string): { ok: boolean; reason?: string } {
    const all = this.tasks();
    if (all.length >= this.settings.maxTasks) return { ok: false, reason: "list full" };
    const open = all.filter((t) => t.userId === user.userId && !t.done);
    if (user.userId !== STREAMER.userId && !isMod(user) && open.length >= this.settings.maxPerUser) return { ok: false, reason: "limit" };
    const pos = all.length ? all[all.length - 1].position + 1 : 1;
    this.ctx.storage.sql.exec(
      "INSERT INTO tasks (id,user_id,login,display_name,color,text,done,created_at,done_at,position) VALUES (?,?,?,?,?,?,0,?,NULL,?)",
      crypto.randomUUID(), user.userId, user.login, cleanText(user.displayName, 25) || user.login,
      user.color || colorFor(user.login), cleanText(text), Date.now(), pos,
    );
    return { ok: true };
  }

  /** Resolve a user's task by 1-based index over their tasks; default = first open (or first done for undo). */
  private pick(userId: string, index: number | null, prefer: "open" | "done" | "any"): Task | undefined {
    const mine = this.userTasks(userId);
    if (index !== null) return mine[index - 1];
    if (prefer === "open") return mine.find((t) => !t.done);
    if (prefer === "done") return [...mine].reverse().find((t) => t.done);
    return [...mine].reverse().find((t) => !t.done) ?? mine[mine.length - 1];
  }

  private setDone(id: string, done: boolean) {
    this.ctx.storage.sql.exec("UPDATE tasks SET done=?, done_at=? WHERE id=?", done ? 1 : 0, done ? Date.now() : null, id);
  }

  // ---------- chat ----------
  handleChat(msg: { id: string; user: ChatUser; text: string }): string | null {
    const result = this.runChat(msg);
    if (result === null) return null;
    this.count(result === "ok" ? `chat_${this.lastVerb.replace(/ /g, "_")}` : "chat_rejected");
    const detail = result === "ok" ? undefined : this.rejectDetail(result as Rejection, msg.text);
    this.record(msg.user, msg.text, result === "ok" ? this.lastVerb : result, detail);
    if (result !== "ok") this.reject(msg.user, result as Rejection, detail);
    return result;
  }

  private rejectDetail(reason: Rejection, text: string): number | string | undefined {
    if (reason === "limit") return this.settings.maxPerUser;
    if (reason === "list full") return this.settings.maxTasks;
    if (reason === "not allowed") return this.settings.minRole;
    if (reason === "no task") { const c = parseCommand(text, this.settings); return c && "index" in c ? c.index ?? undefined : undefined; }
    return undefined;
  }

  private record(user: ChatUser, text: string, result: string, detail?: number | string) {
    const entry: LogEntry = { at: Date.now(), user: user.displayName, text: cleanText(text, 160), result, detail };
    this.log.push(entry);
    if (this.log.length > 20) this.log.shift();
    for (const ws of this.ctx.getWebSockets("admin")) this.send(ws, { t: "log", entry });
  }

  /** Tell the overlay why nothing happened, at most once per viewer every 10 s. Cooldown hits stay silent. */
  private reject(user: ChatUser, reason: Rejection, detail?: number | string) {
    if (reason === "cooldown" || !this.settings.showRejections) return;
    const now = Date.now();
    if ((this.rejectNotice.get(user.userId) ?? 0) > now) return;
    this.rejectNotice.set(user.userId, now + 10_000);
    if (this.rejectNotice.size > 500) this.rejectNotice.clear();
    this.broadcast({ t: "rejected", user: user.displayName, color: user.color || colorFor(user.login), reason, detail });
  }

  private runChat(msg: { id: string; user: ChatUser; text: string }): string | null {
    if (this.seen.has(msg.id)) return null;
    this.seen.add(msg.id);
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-250));
    const cmd = parseCommand(msg.text, this.settings);
    if (!cmd) return null;
    this.lastVerb = VERBS[cmd.kind] ?? "done";
    const user = msg.user;
    if (!hasRole(user, this.settings.minRole) && !isMod(user)) return "not allowed";
    const now = Date.now();
    if (!isMod(user) && (this.cooldown.get(user.userId) ?? 0) > now) return "cooldown";
    this.cooldown.set(user.userId, now + 1500);
    if (this.cooldown.size > 1000) for (const [id, until] of this.cooldown) if (until <= now) this.cooldown.delete(id);

    let changed = false;
    let event: { kind: string; user: string; color: string; text: string } | null = null;
    const ev = (kind: string, text: string) => (event = { kind, user: user.displayName, color: user.color || colorFor(user.login), text });
    switch (cmd.kind) {
      case "add": {
        const r = this.addTask(user, cmd.text);
        if (!r.ok) return r.reason ?? "error";
        changed = true; ev("added", cmd.text);
        break;
      }
      case "done":
      case "undo": {
        const t = this.pick(user.userId, cmd.index, cmd.kind === "done" ? "open" : "done");
        if (!t) return "no task";
        this.setDone(t.id, cmd.kind === "done");
        changed = true; ev(cmd.kind === "done" ? "done" : "undone", t.text);
        break;
      }
      case "edit": {
        const t = this.pick(user.userId, cmd.index, "any");
        if (!t) return "no task";
        this.ctx.storage.sql.exec("UPDATE tasks SET text=? WHERE id=?", cmd.text, t.id);
        changed = true;
        break;
      }
      case "remove": {
        const t = this.pick(user.userId, cmd.index, "any");
        if (!t) return "no task";
        this.ctx.storage.sql.exec("DELETE FROM tasks WHERE id=?", t.id);
        changed = true;
        break;
      }
      case "mine":
        ev("highlight", "");
        break;
      case "clearDone":
        if (!isMod(user)) return "mods only";
        this.ctx.storage.sql.exec("DELETE FROM tasks WHERE done=1");
        changed = true;
        break;
      case "clearAll":
        if (!isMod(user)) return "mods only";
        this.ctx.storage.sql.exec("DELETE FROM tasks");
        changed = true;
        break;
      case "clearUser":
        if (!isMod(user)) return "mods only";
        this.ctx.storage.sql.exec("DELETE FROM tasks WHERE login=?", cmd.login);
        changed = true;
        break;
    }
    if (changed) this.broadcastTasks();
    if (event) this.broadcast({ t: "event", ...(event as object) });
    return "ok";
  }

  private async ensureIrc() {
    const want = this.settings.chatEnabled && this.settings.twitchLogin && this.ctx.getWebSockets("overlay").length + this.ctx.getWebSockets("admin").length > 0;
    if (!want) {
      if (this.irc) { try { this.irc.close(1000, "idle"); } catch {} this.irc = null; this.broadcastChat(); }
      return;
    }
    if (this.irc && this.ircChannel === this.settings.twitchLogin) return;
    if (this.irc) { try { this.irc.close(1000, "switch"); } catch {} this.irc = null; }
    if (this.ircConnecting) return;
    this.ircConnecting = true;
    try {
      const resp = await fetch("https://irc-ws.chat.twitch.tv/", { headers: { Upgrade: "websocket" } });
      const ws = resp.webSocket;
      if (!ws) throw new Error(`irc upgrade failed: ${resp.status}`);
      ws.accept();
      const channel = this.settings.twitchLogin;
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws.send(`JOIN #${channel}`);
      ws.addEventListener("message", (e) => {
        const data = typeof e.data === "string" ? e.data : "";
        for (const line of data.split("\r\n")) {
          if (!line) continue;
          if (line.startsWith("PING")) { ws.send(line.replace("PING", "PONG")); continue; }
          if (line.includes(" RECONNECT")) { try { ws.close(1000, "reconnect"); } catch {} continue; }
          const msg = parseIrcPrivmsg(line);
          if (msg) this.handleChat(msg);
        }
      });
      // Twitch drops idle or restarting connections; try again in a few seconds instead of waiting for the next minute alarm
      const drop = () => { if (this.irc === ws) { this.irc = null; this.broadcastChat(); this.ctx.storage.setAlarm(Date.now() + 5_000).catch(() => {}); } };
      ws.addEventListener("close", drop);
      ws.addEventListener("error", drop);
      this.irc = ws;
      this.ircChannel = channel;
      this.broadcastChat();
    } catch (err) {
      console.error("irc connect failed", err);
    } finally {
      this.ircConnecting = false;
    }
  }

  // ---------- sockets ----------
  private send(ws: WebSocket, data: unknown) { try { ws.send(JSON.stringify(data)); } catch {} }
  private broadcast(data: unknown) { for (const ws of this.ctx.getWebSockets()) this.send(ws, data); }
  private broadcastTasks() { this.broadcast({ t: "tasks", tasks: this.tasks() }); }
  private broadcastChat() { this.broadcast({ t: "chat", connected: !!this.irc, channel: this.settings.twitchLogin }); }
  /** Live overlays (OBS), not the dashboard preview. */
  private liveOverlays(except?: WebSocket) {
    return this.ctx.getWebSockets("live").filter((w) => w !== except && w.readyState === WebSocket.OPEN).length;
  }
  private broadcastPresence(except?: WebSocket) {
    const overlays = this.liveOverlays(except);
    for (const ws of this.ctx.getWebSockets("admin")) if (ws !== except) this.send(ws, { t: "presence", overlays });
  }
  private snapshot() {
    return { t: "state", tasks: this.tasks(), settings: this.settings, chat: { connected: !!this.irc, channel: this.settings.twitchLogin } };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      const role: SocketRole = url.searchParams.get("role") === "admin" ? "admin" : "overlay";
      const preview = role === "overlay" && url.searchParams.get("preview") === "1";
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], role === "admin" ? ["admin"] : ["overlay", preview ? "preview" : "live"]);
      pair[1].serializeAttachment({ role, preview } satisfies Attachment);
      this.send(pair[1], this.snapshot());
      if (role === "admin") {
        this.send(pair[1], { t: "presence", overlays: this.liveOverlays() });
        this.send(pair[1], { t: "logs", entries: this.log });
      } else if (!preview) {
        this.broadcastPresence();
      }
      await this.ensureIrc();
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === "/init" && request.method === "POST") {
      const body = (await request.json()) as Partial<Settings>;
      this.settings = clampSettings(body, this.settings);
      await this.ctx.storage.put("settings", this.settings);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/state") return Response.json(this.snapshot());
    if (url.pathname === "/kick-overlays" && request.method === "POST") {
      for (const ws of this.ctx.getWebSockets("overlay")) { this.send(ws, { t: "revoked" }); try { ws.close(4001, "overlay key rotated"); } catch {} }
      this.broadcastPresence();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/wipe" && request.method === "POST") {
      for (const ws of this.ctx.getWebSockets()) { this.send(ws, { t: "revoked" }); try { ws.close(4002, "channel deleted"); } catch {} }
      if (this.irc) { try { this.irc.close(1000, "wipe"); } catch {} this.irc = null; }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      this.settings = DEFAULT_SETTINGS;
      return Response.json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }

  private count(key: string) {
    if (!phKey(this.env)) return;
    this.stats[key] = (this.stats[key] ?? 0) + 1;
  }

  /** One aggregated event per channel and minute: how many commands and dashboard actions, never their text or who sent them. */
  private async reportStats() {
    const counts = this.stats;
    if (!Object.keys(counts).length) return;
    this.stats = {};
    const tasks = this.ctx.storage.sql.exec("SELECT COUNT(*) AS n, SUM(done) AS d FROM tasks").one() as { n: number; d: number | null };
    await phCapture(this.env, null, "channel_activity", { ...counts, open_tasks: tasks.n - (tasks.d ?? 0), done_tasks: tasks.d ?? 0, overlays: this.ctx.getWebSockets().filter((w) => (w.deserializeAttachment() as Attachment | null)?.role === "overlay").length, distinct_id: `channel_${await channelRef(this.ctx.id.toString())}` });
  }

  async alarm() {
    await this.reportStats().catch(() => {});
    const sockets = this.ctx.getWebSockets();
    await this.ensureIrc();
    if (sockets.length > 0) await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (typeof raw !== "string" || raw.length > 8192) return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.op === "ping") return this.send(ws, { t: "pong" });
    if (att?.role !== "admin") return; // overlays are read-only
    const id = typeof msg.id === "string" ? msg.id : "";
    if (typeof msg.op === "string" && DASHBOARD_OPS.has(msg.op)) this.count(`dashboard_${msg.op.replace(/-/g, "_")}`);
    switch (msg.op) {
      case "add": {
        const text = cleanText(String(msg.text ?? ""));
        if (!text) return;
        const r = this.addTask(STREAMER, text);
        if (!r.ok) return this.send(ws, { t: "error", message: r.reason });
        this.broadcastTasks();
        this.broadcast({ t: "event", kind: "added", user: STREAMER.displayName, color: colorFor("streamer"), text });
        return;
      }
      case "toggle": {
        const t = this.tasks().find((x) => x.id === id);
        if (!t) return;
        this.setDone(id, !t.done);
        this.broadcastTasks();
        if (!t.done) this.broadcast({ t: "event", kind: "done", user: t.displayName, color: t.color, text: t.text });
        return;
      }
      case "edit": {
        const text = cleanText(String(msg.text ?? ""));
        if (!text) return;
        this.ctx.storage.sql.exec("UPDATE tasks SET text=? WHERE id=?", text, id);
        return this.broadcastTasks();
      }
      case "delete":
        this.ctx.storage.sql.exec("DELETE FROM tasks WHERE id=?", id);
        return this.broadcastTasks();
      case "move": {
        const list = this.tasks();
        const from = list.findIndex((t) => t.id === id);
        const to = Math.max(0, Math.min(list.length - 1, Number(msg.to)));
        if (from < 0 || !Number.isFinite(to)) return;
        const [item] = list.splice(from, 1);
        list.splice(to, 0, item);
        list.forEach((t, i) => this.ctx.storage.sql.exec("UPDATE tasks SET position=? WHERE id=?", i + 1, t.id));
        return this.broadcastTasks();
      }
      case "clearDone":
        this.ctx.storage.sql.exec("DELETE FROM tasks WHERE done=1");
        return this.broadcastTasks();
      case "clearAll":
        this.ctx.storage.sql.exec("DELETE FROM tasks");
        return this.broadcastTasks();
      case "settings": {
        this.settings = clampSettings((msg.patch ?? {}) as Partial<Settings>, this.settings);
        await this.ctx.storage.put("settings", this.settings);
        this.broadcast({ t: "settings", settings: this.settings });
        await this.ensureIrc();
        this.broadcastChat();
        return;
      }
      case "simulate": {
        const login = String(msg.login ?? "viewer").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 25) || "viewer";
        const allowed: ChatUser["roles"] = ["subscriber", "vip", "moderator"];
        const roles = Array.isArray(msg.roles) ? allowed.filter((r) => (msg.roles as unknown[]).includes(r)) : [];
        const result = this.handleChat({
          id: crypto.randomUUID(),
          user: { userId: `sim:${login}`, login, displayName: login, color: "", roles: ["everyone", ...roles] },
          text: String(msg.text ?? ""),
        });
        return this.send(ws, { t: "simulated", result });
      }
      case "delete-many": {
        // the dashboard sends this after its 5 s undo window
        const ids = Array.isArray(msg.ids) ? (msg.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 500) : [];
        for (const tid of ids) this.ctx.storage.sql.exec("DELETE FROM tasks WHERE id=?", tid);
        return this.broadcastTasks();
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    this.broadcastPresence(ws);
    await this.ensureIrc();
  }

  async webSocketError(ws: WebSocket) {
    this.broadcastPresence(ws);
    await this.ensureIrc();
  }
}
