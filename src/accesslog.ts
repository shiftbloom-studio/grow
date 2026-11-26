// One cleaned log line per request, written when the Worker's logs are exported (POSTHOG_LOGS set).
// Cloudflare's own invocation logs carry the full URL, and an overlay URL is the overlay key, so the
// export turns them off ("invocation_logs": false) and relies on this line instead: overlay keys are
// masked, the query string (Twitch sign-in codes) is dropped, and only harmless headers are kept.

const HEADERS = ["user-agent", "accept-language", "content-type", "content-length"];

/** The path with overlay keys replaced by ":key". */
export function logPath(pathname: string): string {
  return pathname.replace(/^\/(o|ws)\/[^/]+/, "/$1/:key").slice(0, 120);
}

export function requestLine(req: Request, status: number, ms: number) {
  const cf = (req as Request & { cf?: { country?: string; colo?: string } }).cf;
  const headers: Record<string, string> = {};
  for (const h of HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v.slice(0, 200);
  }
  return {
    message: "request",
    method: req.method,
    path: logPath(new URL(req.url).pathname),
    status,
    ms,
    websocket: req.headers.get("upgrade") === "websocket" || undefined,
    ip: req.headers.get("cf-connecting-ip") || undefined,
    country: cf?.country,
    colo: cf?.colo,
    headers,
  };
}
