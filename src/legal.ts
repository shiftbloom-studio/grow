// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 shiftbloom studio and contributors
//
// Imprint and privacy policy, in English and German. The operator's details come from
// environment variables (LEGAL_*), never from the repository, so every copy of grow names
// whoever runs it. Update the privacy text whenever grow stores, logs or sends something new,
// and keep both languages in step.
import type { Env } from "./types";

export type LegalPath = "/privacy" | "/datenschutz" | "/imprint" | "/impressum";
export const LEGAL_PATHS: LegalPath[] = ["/privacy", "/datenschutz", "/imprint", "/impressum"];

const UPDATED = { en: "Last updated 26 November 2026", de: "Stand: 26. November 2026" };

// Set POSTHOG_LOGS to "eu" or "us" when the Worker's logs are exported to PostHog (see README).
type LogRegion = { en: string; de: string };
const LOG_REGION: Record<string, LogRegion> = { eu: { en: "the EU (Frankfurt)", de: "in der EU (Frankfurt)" }, us: { en: "the USA", de: "in den USA" } };
const logRegion = (v: unknown): LogRegion | null => LOG_REGION[String(v ?? "").trim().toLowerCase()] ?? null;
const errorLogsEn = (where: LogRegion): string => `<h2>Logs at PostHog</h2>
<p>The request logs described under "Hosting" (IP address, approximate location, the address requested and details your browser sends) and the error messages our Worker writes (such as which step failed and the technical ID of the overlay or channel concerned) are also sent to PostHog Inc., 2261 Market St. #4008, San Francisco, CA 94114, USA, which stores them for us on servers in ${where.en}. They contain no file contents. We use them only to fix errors and to prevent abuse, and PostHog deletes them after 14 days. The legal basis is our legitimate interest in running grow securely and reliably (Art. 6(1)(f) GDPR). PostHog processes the data as our processor under a data processing agreement (Art. 28 GDPR) that contains the EU standard contractual clauses. More in <a href="https://posthog.com/privacy" rel="noopener">PostHog's privacy policy</a>.</p>
`;
const errorLogsDe = (where: LogRegion): string => `<h2>Protokolle bei PostHog</h2>
<p>Die unter „Hosting“ beschriebenen Anfrageprotokolle (IP-Adresse, ungefährer Standort, aufgerufene Adresse und Angaben, die dein Browser mitsendet) und die Fehlermeldungen, die unser Worker schreibt (etwa welcher Schritt fehlgeschlagen ist und die technische ID des betroffenen Overlays oder Kanals), werden außerdem an PostHog Inc., 2261 Market St. #4008, San Francisco, CA 94114, USA, gesendet, die sie für uns auf Servern ${where.de} speichert. Sie enthalten keine Dateiinhalte. Wir nutzen sie nur, um Fehler zu beheben und Missbrauch zu verhindern, und PostHog löscht sie nach 14 Tagen. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und zuverlässigen Betrieb von grow (Art. 6 Abs. 1 lit. f DSGVO). PostHog verarbeitet die Daten als unser Auftragsverarbeiter auf Grundlage eines Auftragsverarbeitungsvertrags (Art. 28 DSGVO), der die EU-Standardvertragsklauseln enthält. Mehr dazu in der <a href="https://posthog.com/privacy" rel="noopener">Datenschutzerklärung von PostHog</a>.</p>
`;


const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface Operator { name: string; business: string; street: string; city: string; country: string; email: string; phone: string; vatId: string; authority: string }

function operator(env: Env): Operator | null {
  const v = (k: keyof Env) => String(env[k] ?? "").trim();
  const op = {
    name: v("LEGAL_NAME"), business: v("LEGAL_BUSINESS"), street: v("LEGAL_STREET"), city: v("LEGAL_CITY"),
    country: v("LEGAL_COUNTRY"), email: v("LEGAL_EMAIL"), phone: v("LEGAL_PHONE"), vatId: v("LEGAL_VAT_ID"), authority: v("LEGAL_AUTHORITY"),
  };
  return op.name && op.street && op.city && op.email ? op : null;
}

const COUNTRY_DE: Record<string, string> = { Germany: "Deutschland", Austria: "Österreich", Switzerland: "Schweiz" };

function address(op: Operator, lang: "en" | "de") {
  const country = lang === "de" ? COUNTRY_DE[op.country] ?? op.country : op.country;
  return `<address>${[op.name, op.business, op.street, op.city, country].filter(Boolean).map(esc).join("<br>")}</address>`;
}
const mail = (op: Operator) => `<a href="mailto:${esc(op.email)}">${esc(op.email)}</a>`;
const tel = (op: Operator) => `<a href="tel:${esc(op.phone.replace(/[^\d+]/g, ""))}">${esc(op.phone)}</a>`;

const MISSING = {
  en: `<p class="missing">This copy of grow has no operator details yet. Whoever runs it has to set the LEGAL_* variables described in the README.</p>`,
  de: `<p class="missing">Für diese Kopie von grow sind noch keine Betreiberangaben hinterlegt. Wer sie betreibt, muss die im README beschriebenen LEGAL_*-Variablen setzen.</p>`,
};

function imprint(lang: "en" | "de", op: Operator | null): string {
  const de = lang === "de";
  if (!op) return MISSING[lang];
  return `
<p>${de ? "Angaben gemäß § 5 DDG:" : "Information pursuant to § 5 DDG:"}</p>
${address(op, lang)}
<p>${de ? "E-Mail" : "Email"}: ${mail(op)}${op.phone ? `<br>${de ? "Telefon" : "Phone"}: ${tel(op)}` : ""}</p>
${op.vatId ? `<p>${de ? "Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG" : "VAT ID pursuant to § 27a UStG"}: ${esc(op.vatId)}</p>` : ""}
<h2>${de ? "Verbraucherstreitbeilegung" : "Consumer dispute resolution"}</h2>
<p>${de
    ? "Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen."
    : "We are not willing or obliged to take part in dispute resolution proceedings before a consumer arbitration board."}</p>
<h2>${de ? "Unabhängigkeit" : "Independence"}</h2>
<p>${de
    ? "grow ist ein unabhängiges Open-Source-Projekt. Es steht in keiner Verbindung zu Twitch oder OBS und wird von ihnen weder unterstützt noch empfohlen. Namen und Logos gehören ihren jeweiligen Inhabern."
    : "grow is an independent open-source project. It is not affiliated with or endorsed by Twitch or OBS. Their names and logos belong to their respective owners."}</p>`;
}

function privacyEn(op: Operator | null, host: string, twitchLogin: boolean, logs: LogRegion | null): string {
  return `
<p>grow sets no tracking cookies and uses no analytics or advertising. It doesn't analyze visitors or their behavior and makes no automated decisions about you. This policy covers the personal data grow processes when you use ${esc(host)}: your IP address, the overlay you create, and the chat commands of the channels that use it.</p>

<h2>Controller</h2>
${op ? `${address(op, "en")}<p>Email: ${mail(op)}</p>` : MISSING.en}

<h2>Hosting</h2>
<p>Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA, delivers all of grow's pages and files on our behalf and runs its server code (a Cloudflare Worker), its database (Cloudflare D1) and the rooms that keep each overlay's list (Durable Objects). To do so, Cloudflare processes your IP address, the address of the page you request, the time, and details your browser sends, such as its user agent and the page you came from. You don't have to provide this data, but without it the site can't be shown to you.</p>
<p>Requests that our Worker handles are logged, including the IP address, the approximate location Cloudflare derives from it, and the address requested. We use these logs only to fix errors and to prevent abuse, and they are deleted after at most 7 days. To prevent abuse, the Worker also counts how often an IP address creates an overlay or signs in within one minute and refuses requests above a limit. The count is held only in the memory of Cloudflare's rate limiter.</p>
<p>The fonts are served from our own address. Our Worker fetches them once from Fontshare and Google Fonts and keeps them in Cloudflare's cache, so your browser doesn't connect to those services and they don't receive your IP address.</p>
<p>The legal basis is our legitimate interest in running grow securely and reliably (Art. 6(1)(f) GDPR). Cloudflare processes the data as our processor under a data processing agreement (Art. 28 GDPR). Cloudflare, Inc. is certified under the EU-U.S. Data Privacy Framework, for which the European Commission has adopted an adequacy decision (Art. 45 GDPR), and the agreement also contains the EU standard contractual clauses. More in <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</a>.</p>

${logs ? errorLogsEn(logs) : ""}<h2>Your overlay</h2>
<p>When you make an overlay, we store its name, a hash of your dashboard key (never the key itself), the secret overlay link, the time it was created and when the dashboard was last used. With the overlay we keep its settings, among them the Twitch channel whose chat it reads, and the tasks on its list. All of this stays until you delete the overlay in the dashboard, which removes it at once. You can also email us to have it deleted.</p>
<p>When you sign in, grow sets a cookie called grow_session that keeps you signed in for 60 days or until you sign out. We store only a hash of it. ${twitchLogin ? "Signing in with Twitch also sets a cookie called grow_oauth for 10 minutes, which protects the sign-in against forgery. " : ""}Your browser also keeps a few notes in its local storage, such as whether you already saved your key or copied the overlay link, so the dashboard doesn't ask again. They start with grow: and never leave your browser. These cookies and notes are strictly necessary for the service you asked for (§ 25(2) no. 2 TDDDG).</p>
${twitchLogin ? `<p>If you sign in with Twitch, Twitch tells us your Twitch user ID, login name and display name. We ask for no permissions beyond that, revoke the access token right after the sign-in and store only the user ID and login name with your overlay. Twitch Interactive, Inc. is based in the USA and processes the sign-in under its own responsibility.</p>` : ""}
<p>The legal basis is the performance of the service you request (Art. 6(1)(b) GDPR).</p>

<h2>Twitch chat</h2>
<p>While an overlay or its dashboard is open, our Worker reads the chat of the channel set in it from Twitch over an anonymous, read-only connection. Twitch doesn't receive your IP address for this. grow only acts on messages that start with a command, such as !task or !done, and ignores every other message without storing it.</p>

<h2>If you chat in a channel that uses grow</h2>
<p>When you type a command, grow shows your task on stream with your display name and color, as Twitch delivers them. With each task we store your Twitch user ID, login name, display name, color, the text you typed and when you added or finished it. A task stays on the list until you, a moderator or the streamer removes it, or until the streamer deletes the overlay. The dashboard also shows the streamer the last 20 commands with your display name, held only in memory. To stop people from flooding the list, grow briefly remembers in memory when you last sent a command.</p>
<p>We receive these messages from Twitch, not from you. The legal basis is our legitimate interest, and the streamer's, in showing the tasks that viewers add from the public chat on the stream (Art. 6(1)(f) GDPR). Cloudflare processes them as our processor, as described under "Hosting". You can remove your own tasks at any time with !remove.</p>

<h2>Email</h2>
<p>If you email us, we use your address and message only to reply (Art. 6(1)(f) GDPR) and delete them once the matter is settled, unless the law requires us to keep them.</p>

<h2>Your rights</h2>
<p>You have the right of access to your personal data (Art. 15 GDPR), to rectification (Art. 16), to erasure (Art. 17), to restriction of processing (Art. 18) and to data portability (Art. 20). To exercise them, email us. You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR), for example the one where you live${op?.authority ? ` or the one responsible for us: ${esc(op.authority)}` : ""}.</p>

<h2>Right to object</h2>
<p><strong>You may object at any time, on grounds relating to your particular situation, to the processing of your personal data based on Art. 6(1)(f) GDPR (Art. 21 GDPR).</strong></p>`;
}

function privacyDe(op: Operator | null, host: string, twitchLogin: boolean, logs: LogRegion | null): string {
  return `
<p>grow setzt keine Tracking-Cookies und nutzt keine Analyse- oder Werbedienste. Es wertet weder Besucher noch ihr Verhalten aus und trifft keine automatisierten Entscheidungen über dich. Diese Erklärung beschreibt, welche personenbezogenen Daten grow verarbeitet, wenn du ${esc(host)} nutzt: deine IP-Adresse, das Overlay, das du anlegst, und die Chat-Befehle der Kanäle, die es verwenden.</p>

<h2>Verantwortlicher</h2>
${op ? `${address(op, "de")}<p>E-Mail: ${mail(op)}</p>` : MISSING.de}

<h2>Hosting</h2>
<p>Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA, liefert in unserem Auftrag alle Seiten und Dateien von grow aus und betreibt seinen Servercode (einen Cloudflare Worker), seine Datenbank (Cloudflare D1) und die Räume, die die Liste jedes Overlays halten (Durable Objects). Dazu verarbeitet Cloudflare deine IP-Adresse, die Adresse der aufgerufenen Seite, den Zeitpunkt und Angaben, die dein Browser mitsendet, etwa den User-Agent und die Seite, von der du kommst. Du musst diese Daten nicht bereitstellen, ohne sie kann die Website aber nicht angezeigt werden.</p>
<p>Anfragen, die unser Worker bearbeitet, werden protokolliert, samt IP-Adresse, dem ungefähren Standort, den Cloudflare daraus ableitet, und der aufgerufenen Adresse. Wir nutzen diese Protokolle nur, um Fehler zu beheben und Missbrauch zu verhindern. Sie werden nach spätestens 7 Tagen gelöscht. Um Missbrauch zu verhindern, zählt der Worker außerdem, wie oft eine IP-Adresse innerhalb einer Minute ein Overlay anlegt oder sich anmeldet, und weist Anfragen oberhalb einer Grenze ab. Die Zählung liegt nur im Arbeitsspeicher von Cloudflares Rate-Limiter.</p>
<p>Die Schriften kommen von unserer eigenen Adresse. Unser Worker lädt sie einmal bei Fontshare und Google Fonts und hält sie im Cache von Cloudflare vor. Dein Browser verbindet sich also nicht mit diesen Diensten, und sie erhalten deine IP-Adresse nicht.</p>
<p>Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und zuverlässigen Betrieb von grow (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare verarbeitet die Daten als unser Auftragsverarbeiter auf Grundlage eines Auftragsverarbeitungsvertrags (Art. 28 DSGVO). Cloudflare, Inc. ist nach dem EU-U.S. Data Privacy Framework zertifiziert, für das ein Angemessenheitsbeschluss der Europäischen Kommission besteht (Art. 45 DSGVO). Der Vertrag enthält zusätzlich die EU-Standardvertragsklauseln. Mehr dazu in der <a href="https://www.cloudflare.com/de-de/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.</p>

${logs ? errorLogsDe(logs) : ""}<h2>Dein Overlay</h2>
<p>Wenn du ein Overlay anlegst, speichern wir seinen Namen, einen Hash deines Dashboard-Schlüssels (nie den Schlüssel selbst), den geheimen Overlay-Link, den Zeitpunkt der Erstellung und wann das Dashboard zuletzt genutzt wurde. Zum Overlay gehören seine Einstellungen, darunter der Twitch-Kanal, dessen Chat es liest, und die Aufgaben auf seiner Liste. All das bleibt gespeichert, bis du das Overlay im Dashboard löschst, was es sofort entfernt. Du kannst uns auch per E-Mail bitten, es zu löschen.</p>
<p>Wenn du dich anmeldest, setzt grow ein Cookie namens grow_session, das dich 60 Tage lang oder bis zur Abmeldung angemeldet hält. Wir speichern davon nur einen Hash. ${twitchLogin ? "Die Anmeldung mit Twitch setzt außerdem für 10 Minuten ein Cookie namens grow_oauth, das die Anmeldung vor Fälschung schützt. " : ""}Dein Browser behält außerdem ein paar Notizen in seinem lokalen Speicher, etwa ob du deinen Schlüssel schon gesichert oder den Overlay-Link kopiert hast, damit das Dashboard nicht erneut fragt. Sie beginnen mit grow: und verlassen deinen Browser nie. Diese Cookies und Notizen sind unbedingt erforderlich, um den von dir gewünschten Dienst bereitzustellen (§ 25 Abs. 2 Nr. 2 TDDDG).</p>
${twitchLogin ? `<p>Wenn du dich mit Twitch anmeldest, teilt Twitch uns deine Twitch-Nutzer-ID, deinen Login-Namen und deinen Anzeigenamen mit. Wir fragen keine weiteren Berechtigungen an, widerrufen das Zugriffstoken direkt nach der Anmeldung und speichern nur Nutzer-ID und Login-Namen mit deinem Overlay. Twitch Interactive, Inc. sitzt in den USA und verarbeitet die Anmeldung in eigener Verantwortung.</p>` : ""}
<p>Rechtsgrundlage ist die Erbringung des Dienstes, den du anforderst (Art. 6 Abs. 1 lit. b DSGVO).</p>

<h2>Twitch-Chat</h2>
<p>Solange ein Overlay oder sein Dashboard geöffnet ist, liest unser Worker den Chat des dort eingestellten Kanals über eine anonyme, nur lesende Verbindung bei Twitch mit. Twitch erhält deine IP-Adresse dafür nicht. grow reagiert nur auf Nachrichten, die mit einem Befehl beginnen, etwa !task oder !done, und ignoriert alle anderen Nachrichten, ohne sie zu speichern.</p>

<h2>Wenn du in einem Kanal mit grow chattest</h2>
<p>Wenn du einen Befehl schreibst, zeigt grow deine Aufgabe im Stream mit deinem Anzeigenamen und deiner Farbe, so wie Twitch sie liefert. Zu jeder Aufgabe speichern wir deine Twitch-Nutzer-ID, deinen Login-Namen, Anzeigenamen, deine Farbe, den Text, den du geschrieben hast, und wann du sie angelegt oder erledigt hast. Eine Aufgabe bleibt auf der Liste, bis du, ein Moderator oder wer streamt sie entfernt, oder bis das Overlay gelöscht wird. Das Dashboard zeigt außerdem die letzten 20 Befehle mit deinem Anzeigenamen, nur im Arbeitsspeicher. Damit niemand die Liste flutet, merkt sich grow kurz im Arbeitsspeicher, wann du zuletzt einen Befehl geschickt hast.</p>
<p>Wir erhalten diese Nachrichten von Twitch, nicht von dir. Rechtsgrundlage ist unser berechtigtes Interesse und das der Streamerin oder des Streamers, die Aufgaben, die Zuschauer im öffentlichen Chat anlegen, im Stream anzuzeigen (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare verarbeitet sie als unser Auftragsverarbeiter, wie unter „Hosting“ beschrieben. Deine eigenen Aufgaben kannst du jederzeit mit !remove entfernen.</p>

<h2>E-Mail</h2>
<p>Wenn du uns schreibst, nutzen wir deine Adresse und Nachricht nur, um dir zu antworten (Art. 6 Abs. 1 lit. f DSGVO), und löschen sie, sobald die Sache erledigt ist, es sei denn, das Gesetz verpflichtet uns zur Aufbewahrung.</p>

<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft über deine personenbezogenen Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Schreib uns dazu eine E-Mail. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), etwa bei der an deinem Wohnort${op?.authority ? ` oder bei der für uns zuständigen: ${esc(op.authority)}` : ""}.</p>

<h2>Widerspruchsrecht</h2>
<p><strong>Du kannst der Verarbeitung deiner personenbezogenen Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO jederzeit aus Gründen widersprechen, die sich aus deiner besonderen Situation ergeben (Art. 21 DSGVO).</strong></p>`;
}

const PAGES: Record<LegalPath, { lang: "en" | "de"; title: string; other: LegalPath; kind: "privacy" | "imprint" }> = {
  "/privacy": { lang: "en", title: "Privacy policy", other: "/datenschutz", kind: "privacy" },
  "/datenschutz": { lang: "de", title: "Datenschutzerklärung", other: "/privacy", kind: "privacy" },
  "/imprint": { lang: "en", title: "Imprint", other: "/impressum", kind: "imprint" },
  "/impressum": { lang: "de", title: "Impressum", other: "/imprint", kind: "imprint" },
};

export function legalPage(path: LegalPath, env: Env, base: string): string {
  const p = PAGES[path];
  const de = p.lang === "de";
  const op = operator(env);
  const host = new URL(base).host;
  const body = p.kind === "imprint" ? imprint(p.lang, op) : de ? privacyDe(op, host, !!env.TWITCH_CLIENT_ID, logRegion(env.POSTHOG_LOGS)) : privacyEn(op, host, !!env.TWITCH_CLIENT_ID, logRegion(env.POSTHOG_LOGS));
  return `<!doctype html>
<html lang="${p.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>grow. · ${esc(p.title)}</title>
<meta name="robots" content="noindex">
<link rel="alternate" hreflang="${de ? "en" : "de"}" href="${p.other}">
<meta name="theme-color" content="#F6F1EE">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/fonts.css">
<link rel="stylesheet" href="/assets/brand.css">
<style>
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 clamp(20px, 5vw, 56px); }
  nav { display: flex; align-items: center; gap: 24px; padding: 28px 0; }
  nav .brand { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; }
  nav .brand [data-bloom] { width: 30px; height: 30px; }
  nav .wordmark { font-size: 22.4px; }
  nav .sp { flex: 1; }
  h1 { font-size: clamp(36px, 5vw, 56px); margin: 24px 0 14px; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; font: 400 13px/1.6 var(--mono); color: var(--ink-60); margin-bottom: 40px; }
  .meta a { color: var(--ink); }
  article h2 { font-size: 24px; margin: 40px 0 12px; }
  article p, article address { margin: 0 0 14px; max-width: 40em; }
  article address { font-style: normal; }
  article a { color: var(--ink); }
  .missing { border: 1.5px solid var(--bloom); border-radius: 12px; padding: 14px 16px; }
  footer { border-top: 1.5px solid var(--ink); margin-top: 64px; padding: 32px 0 48px; font: 400 13px/1.7 var(--mono); color: var(--ink-60); }
  footer a { color: var(--ink); }
</style>
</head>
<body>
<div class="wrap">
  <nav>
    <a class="brand" href="/" aria-label="grow home"><span data-bloom></span><span class="wordmark">grow<span class="seed">.</span></span></a>
    <div class="sp"></div>
    <a class="btn ghost sm" href="/app">Dashboard</a>
  </nav>
  <div class="label">${de ? "grow · rechtliches" : "grow · legal"}</div>
  <h1>${esc(p.title)}<span class="seed">.</span></h1>
  <div class="meta"><a href="${p.other}" hreflang="${de ? "en" : "de"}" lang="${de ? "en" : "de"}">${de ? "English" : "Deutsch"}</a>${p.kind === "privacy" ? `<span>${UPDATED[p.lang]}</span>` : ""}</div>
  <article>${body}</article>
  <footer>${de
    ? `<a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a> · <a href="https://github.com/shiftbloom-studio/grow">Quellcode auf GitHub</a> unter AGPL-3.0-or-later`
    : `<a href="/privacy">Privacy</a> · <a href="/imprint">Imprint</a> · <a href="https://github.com/shiftbloom-studio/grow">Source on GitHub</a> under AGPL-3.0-or-later`}</footer>
</div>
<script src="/assets/bloom.js"></script>
</body>
</html>`;
}
