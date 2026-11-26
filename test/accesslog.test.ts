import { describe, expect, it } from "vitest";
import { logPath, requestLine } from "../src/accesslog";

describe("request log line", () => {
  it("masks overlay keys", () => {
    expect(logPath("/o/AbCdEfGhIjKlMnOpQrStUvWx")).toBe("/o/:key");
    expect(logPath("/ws/AbCdEfGhIjKlMnOpQrStUvWx")).toBe("/ws/:key");
    expect(logPath("/api/channels")).toBe("/api/channels");
  });
  it("drops the query string and secret headers", () => {
    const req = new Request("https://grow.example/auth/twitch/callback?code=oauthcode&state=st4te", {
      headers: { cookie: "grow_session=s3ss", authorization: "Bearer t0k", referer: "https://grow.example/o/AbCdEfGhIjKlMnOpQrStUvWx", "user-agent": "OBS", "cf-connecting-ip": "203.0.113.1" },
    });
    const s = JSON.stringify(requestLine(req, 302, 4));
    for (const secret of ["oauthcode", "st4te", "s3ss", "t0k", "AbCdEf", "referer"]) expect(s).not.toContain(secret);
    expect(s).toContain("/auth/twitch/callback");
    expect(s).toContain("OBS");
    expect(s).toContain("203.0.113.1");
  });
});
