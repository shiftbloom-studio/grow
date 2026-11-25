// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 shiftbloom studio and contributors
import { describe, expect, it } from "vitest";
import { cleanText, parseCommand, parseIrcPrivmsg, hasRole } from "../src/commands";

const S = { prefix: "!" };

describe("parseCommand", () => {
  it("parses add aliases", () => {
    expect(parseCommand("!task read chapter 3", S)).toEqual({ kind: "add", text: "read chapter 3" });
    expect(parseCommand("!TODO  spaced   out ", S)).toEqual({ kind: "add", text: "spaced out" });
    expect(parseCommand("!task", S)).toBeNull();
  });
  it("parses indices", () => {
    expect(parseCommand("!done", S)).toEqual({ kind: "done", index: null });
    expect(parseCommand("!done 2", S)).toEqual({ kind: "done", index: 2 });
    expect(parseCommand("!remove #3", S)).toEqual({ kind: "remove", index: 3 });
    expect(parseCommand("!edit 2 new text", S)).toEqual({ kind: "edit", index: 2, text: "new text" });
    expect(parseCommand("!edit 2024 goals", S)).toEqual({ kind: "edit", index: null, text: "2024 goals" });
  });
  it("respects prefix and ignores chatter", () => {
    expect(parseCommand("hello !task x", S)).toBeNull();
    expect(parseCommand("!dance", S)).toBeNull();
    expect(parseCommand("?task x", { prefix: "?" })).toEqual({ kind: "add", text: "x" });
  });
  it("parses clearuser", () => {
    expect(parseCommand("!clearuser @Viewer_One", S)).toEqual({ kind: "clearUser", login: "viewer_one" });
    expect(parseCommand("!clearuser", S)).toBeNull();
  });
});

describe("cleanText", () => {
  it("strips control and zero-width chars and caps length", () => {
    expect(cleanText("a​b\u0007c")).toBe("abc");
    expect(cleanText("x".repeat(300)).length).toBe(140);
  });
});

describe("parseIrcPrivmsg", () => {
  it("parses tags and badges", () => {
    const line = "@badge-info=;badges=moderator/1,subscriber/12;color=#1E90FF;display-name=Viewer_One;id=abc-123;mod=1;user-id=42 :viewer_one!viewer_one@viewer_one.tmi.twitch.tv PRIVMSG #example_channel :!task read chapter 3";
    const m = parseIrcPrivmsg(line)!;
    expect(m.id).toBe("abc-123");
    expect(m.text).toBe("!task read chapter 3");
    expect(m.user).toMatchObject({ userId: "42", login: "viewer_one", displayName: "Viewer_One", color: "#1E90FF" });
    expect(hasRole(m.user, "moderator")).toBe(true);
    expect(hasRole(m.user, "broadcaster")).toBe(false);
  });
  it("ignores non-privmsg", () => {
    expect(parseIrcPrivmsg(":tmi.twitch.tv 001 justinfan1 :Welcome")).toBeNull();
  });
});
