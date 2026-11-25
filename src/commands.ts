// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 shiftbloom studio and contributors
import type { ChatUser, Role, Settings } from "./types";

export type Command =
  | { kind: "add"; text: string }
  | { kind: "done"; index: number | null }
  | { kind: "undo"; index: number | null }
  | { kind: "edit"; index: number | null; text: string }
  | { kind: "remove"; index: number | null }
  | { kind: "mine" }
  | { kind: "clearDone" }
  | { kind: "clearAll" }
  | { kind: "clearUser"; login: string };

const ALIASES: Record<string, string> = {
  task: "add", add: "add", todo: "add",
  done: "done", check: "done", finish: "done",
  undo: "undo", uncheck: "undo",
  edit: "edit",
  remove: "remove", delete: "remove", rm: "remove",
  mytasks: "mine", tasks: "mine",
  cleardone: "clearDone",
  clearall: "clearAll",
  clearuser: "clearUser",
};

const RANK: Record<Role, number> = { everyone: 0, subscriber: 1, vip: 2, moderator: 3, broadcaster: 4 };

export function topRank(roles: Role[]): number {
  return roles.reduce((m, r) => Math.max(m, RANK[r] ?? 0), 0);
}

export function hasRole(user: ChatUser, min: Role): boolean {
  return topRank(user.roles) >= RANK[min];
}

export function isMod(user: ChatUser): boolean {
  return topRank(user.roles) >= RANK.moderator;
}

// built from a string so no tool chokes on raw line/paragraph separators in a regex literal
const UNSAFE_CHARS = new RegExp("[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f]", "g");

/** Remove control chars, collapse whitespace, cap length. */
export function cleanText(s: string, max = 140): string {
  return s.replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function takeIndex(rest: string): { index: number | null; rest: string } {
  const m = /^#?(\d{1,3})(?:\s+|$)/.exec(rest);
  if (!m) return { index: null, rest };
  return { index: parseInt(m[1], 10), rest: rest.slice(m[0].length) };
}

export function parseCommand(message: string, settings: Pick<Settings, "prefix">): Command | null {
  const prefix = settings.prefix || "!";
  if (!message.startsWith(prefix)) return null;
  const body = message.slice(prefix.length).trim();
  const sp = body.search(/\s/);
  const word = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? "" : body.slice(sp + 1).trim();
  const kind = ALIASES[word];
  if (!kind) return null;
  switch (kind) {
    case "add": {
      const text = cleanText(rest);
      return text ? { kind: "add", text } : null;
    }
    case "done":
    case "undo":
    case "remove":
      return { kind, index: takeIndex(rest).index } as Command;
    case "edit": {
      const t = takeIndex(rest);
      const text = cleanText(t.rest);
      return text ? { kind: "edit", index: t.index, text } : null;
    }
    case "mine":
      return { kind: "mine" };
    case "clearDone":
      return { kind: "clearDone" };
    case "clearAll":
      return { kind: "clearAll" };
    case "clearUser": {
      const login = rest.replace(/^@/, "").toLowerCase().split(/\s/)[0];
      return /^[a-z0-9_]{1,25}$/.test(login) ? { kind: "clearUser", login } : null;
    }
  }
  return null;
}

/** Parse a raw Twitch IRC line (with tags) into a PRIVMSG event, or null. */
export function parseIrcPrivmsg(line: string): { id: string; user: ChatUser; text: string } | null {
  let rest = line;
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    for (const kv of rest.slice(1, sp).split(";")) {
      const eq = kv.indexOf("=");
      tags[kv.slice(0, eq)] = kv.slice(eq + 1).replace(/\\s/g, " ").replace(/\\:/g, ";").replace(/\\\\/g, "\\");
    }
    rest = rest.slice(sp + 1);
  }
  const m = /^:([a-z0-9_]+)![^ ]+ PRIVMSG #[a-z0-9_]+ :(.*)$/.exec(rest);
  if (!m) return null;
  const badges = (tags["badges"] || "").split(",").map((b) => b.split("/")[0]);
  const roles: Role[] = ["everyone"];
  if (badges.includes("subscriber") || badges.includes("founder") || tags["subscriber"] === "1") roles.push("subscriber");
  if (badges.includes("vip")) roles.push("vip");
  if (badges.includes("moderator") || tags["mod"] === "1") roles.push("moderator");
  if (badges.includes("broadcaster")) roles.push("broadcaster");
  let text = m[2].replace(/\r$/, "");
  // strip /me ACTION wrapper
  const action = /^\u0001ACTION (.*)\u0001$/.exec(text);
  if (action) text = action[1];
  return {
    id: tags["id"] || crypto.randomUUID(),
    user: {
      userId: tags["user-id"] || m[1],
      login: m[1],
      displayName: tags["display-name"] || m[1],
      color: /^#[0-9a-fA-F]{6}$/.test(tags["color"] || "") ? tags["color"] : "",
      roles,
    },
    text,
  };
}
