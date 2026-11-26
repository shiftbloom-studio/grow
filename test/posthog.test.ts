import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { phAi, phCapture, phException, phKey, phProxy, phScriptTag, scrubText, sizeBucket } from "../src/posthog";
import { legalPage } from "../src/legal";

const KEY = "phc_testtoken1234567890";
const env = { POSTHOG_KEY: KEY };
const KEEP = /^\/(request|privacy)?$/;

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("ok", { headers: { "set-cookie": "ph=1", "content-type": "text/plain" } });
  }));
  return calls;
}

describe("posthog config", () => {
  it("is off without a valid project token", () => {
    expect(phKey({})).toBeNull();
    expect(phKey({ POSTHOG_KEY: "phx_personal_key_000000" })).toBeNull();
    expect(phKey(env)).toBe(KEY);
    expect(phScriptTag({})).toBe("");
    expect(phScriptTag(env)).toBe('<script src="/_sb/init.js" defer></script>');
  });
  it("sends nothing when off", async () => {
    const calls = stubFetch();
    await phCapture({}, null, "x");
    await phException({}, null, new Error("boom"));
    expect(await phAi({}, null, { model: "m" }, async () => 7)).toBe(7);
    expect(calls).toHaveLength(0);
  });
});

describe("proxy", () => {
  const req = (path: string, init: RequestInit = {}) => new Request(`https://grow.test${path}`, init);

  it("ignores other paths and answers 404 while off", async () => {
    expect(await phProxy(req("/abc"), env)).toBeNull();
    expect(await phProxy(req("/_sbx"), env)).toBeNull();
    expect((await phProxy(req("/_sb/e/"), {}))!.status).toBe(404);
  });
  it("routes static files to the assets host and the rest to the API host", async () => {
    const calls = stubFetch();
    await phProxy(req("/_sb/static/array.js?v=1"), env);
    await phProxy(req("/_sb/i/v0/e/?ip=0", { method: "POST", body: "{}" }), env);
    expect(calls[0].url).toBe("https://us-assets.i.posthog.com/static/array.js?v=1");
    expect(calls[1].url).toBe("https://us.i.posthog.com/i/v0/e/?ip=0");
    expect(calls[1].init.method).toBe("POST");
  });
  it("follows POSTHOG_HOST", async () => {
    const calls = stubFetch();
    await phProxy(req("/_sb/static/x.js"), { ...env, POSTHOG_HOST: "https://eu.i.posthog.com/" });
    expect(calls[0].url).toBe("https://eu-assets.i.posthog.com/static/x.js");
  });
  it("never forwards cookies or the app's own bearer token, but passes the client IP", async () => {
    const calls = stubFetch();
    const res = await phProxy(req("/_sb/flags/", { method: "POST", body: "{}", headers: { cookie: "a=b", authorization: "Bearer drop_secret_token", "cf-connecting-ip": "203.0.113.9" } }), env);
    const h = new Headers(calls[0].init.headers);
    expect(h.get("cookie")).toBeNull();
    expect(h.get("authorization")).toBeNull();
    expect(h.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(res!.headers.get("set-cookie")).toBeNull();
    await phProxy(req("/_sb/i/v1/e", { method: "POST", body: "{}", headers: { authorization: `Bearer ${KEY}` } }), env);
    expect(new Headers(calls[1].init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
  });
});

describe("init.js", () => {
  async function load(path: string) {
    const res = await phProxy(new Request("https://grow.test/_sb/init.js"), env, { app: "grow", keep: KEEP });
    const code = await res!.text();
    let cfg: any = null;
    const script = { parentNode: { insertBefore() {} } };
    const win: any = {};
    win.window = win;
    win.document = { createElement: () => ({}), getElementsByTagName: () => [script] };
    win.location = { origin: "https://grow.test", pathname: path };
    win.URL = URL;
    runInNewContext(code, win);
    // the stub queued the init call: [token, config, name]
    cfg = win.posthog._i[0][1];
    return { token: win.posthog._i[0][0], cfg };
  }
  it("loads cookieless, without replay, through the proxy", async () => {
    const { token, cfg } = await load("/");
    expect(token).toBe(KEY);
    expect(cfg.api_host).toBe("/_sb");
    expect(cfg.cookieless_mode).toBe("always");
    expect(cfg.disable_session_recording).toBe(true);
    expect(cfg.autocapture.element_allowlist).toEqual(["a", "button"]);
  });
  it("masks item paths, query strings and link targets before sending", async () => {
    const { cfg } = await load("/");
    const ev = cfg.before_send({
      event: "$pageview",
      properties: {
        $current_url: "https://grow.test/aB3dE?x=1#y",
        $pathname: "/aB3dE",
        $referrer: "https://other.example/some/path?q=secret",
        $elements_chain: 'a.copy:attr__href="https://grow.test/aB3dE"attr__aria-label="Delete x.png"attr__id="cp"nth-child="1"',
        $set: { email: "x" },
      },
    });
    expect(ev.properties.$current_url).toBe("https://grow.test/[private]");
    expect(ev.properties.$pathname).toBe("/[private]");
    expect(ev.properties.$referrer).toBe("https://other.example");
    expect(ev.properties.$elements_chain).toBe('a.copy:attr__id="cp"nth-child="1"');
    expect(ev.properties.$set).toBeUndefined();
    expect(ev.properties.app).toBe("grow");
    const kept = cfg.before_send({ event: "$pageview", properties: { $current_url: "https://grow.test/privacy?utm=1" } });
    expect(kept.properties.$current_url).toBe("https://grow.test/privacy");
    expect(cfg.before_send({ event: "x", properties: { $referrer: "$direct" } }).properties.$referrer).toBe("$direct");
  });
});

describe("worker events", () => {
  it("sends server events without person profile or IP", async () => {
    const calls = stubFetch();
    await phCapture(env, null, "item_created", { kind: "file" });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://us.i.posthog.com/batch/");
    expect(body.api_key).toBe(KEY);
    expect(body.batch[0].properties).toMatchObject({ kind: "file", $process_person_profile: false, $geoip_disable: true });
  });
  it("masks long strings in exceptions", async () => {
    const calls = stubFetch();
    await phException(env, null, new Error("token drop_abcdefghijklmnopqrstuv failed"));
    const ex = JSON.parse(String(calls[0].init.body)).batch[0];
    expect(ex.event).toBe("$exception");
    expect(ex.properties.$exception_list[0].value).toBe("token [masked] failed");
  });
  it("reports AI calls without inputs or outputs", async () => {
    const calls = stubFetch();
    await expect(phAi(env, null, { model: "@cf/x" }, async () => ({ caption: "a cat", usage: { prompt_tokens: 3, completion_tokens: 2 } }))).resolves.toMatchObject({ caption: "a cat" });
    const p = JSON.parse(String(calls[0].init.body)).batch[0].properties;
    expect(p).toMatchObject({ $ai_model: "@cf/x", $ai_input_tokens: 3, $ai_output_tokens: 2 });
    expect(JSON.stringify(p)).not.toContain("a cat");
    await expect(phAi(env, null, { model: "@cf/x" }, async () => { throw new Error("down"); })).rejects.toThrow("down");
    expect(JSON.parse(String(calls[1].init.body)).batch[0].properties.$ai_is_error).toBe(true);
  });
  it("helpers", () => {
    expect(scrubText("x".repeat(600)).length).toBeLessThanOrEqual(500);
    expect(sizeBucket(500_000)).toBe("<1MB");
  });
});

describe("privacy policy", () => {
  const base = { LEGAL_NAME: "Jane Doe", LEGAL_STREET: "Example St 1", LEGAL_CITY: "12345 Town", LEGAL_COUNTRY: "DE", LEGAL_EMAIL: "jane@example.com", LEGAL_AUTHORITY: "DPA" } as any;
  it("names PostHog only when analytics is on", () => {
    const off = legalPage("/privacy", base, "https://grow.test");
    expect(off).not.toContain("Usage statistics");
    expect(off).toContain("uses no analytics");
    const on = legalPage("/privacy", { ...base, POSTHOG_KEY: KEY }, "https://grow.test");
    expect(on).toContain("<h2>Usage statistics</h2>");
    expect(on).toContain("Data Privacy Framework");
    expect(legalPage("/datenschutz", { ...base, POSTHOG_KEY: KEY }, "https://grow.test")).toContain("<h2>Nutzungsstatistik</h2>");
  });
});
