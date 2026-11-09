/**
 * extractors.js — pure HTML / email content parsers (no side effects).
 *
 * HTML:        stripHtml · plainText · errSnippet
 * Form:        extractHiddenInputs · extractInputValue · extractCsrfToken · extractCsrfInlineJs
 * Links:       extractLinks · extractM3uLinks
 * Playlists:   extractDuration · extractPlaylists · EMPTY_PLAYLISTS
 * Credentials: extractCredentials · extractCredsFromM3u
 */

import { computeExpiresAt } from "./generators.js";

// ── Private helpers ───────────────────────────────────────────────────────────

const stripTags = (s) => s.replace(/<[^>]+>/g, " ");
const collapseWs = (s) => s.replace(/\s{2,}/g, " ");
const matchAll = (s, re) => [...s.matchAll(re)];

// Shared Xtream credential pattern — used by both credential extractors.
const CREDS_RE = /username=([^&"'\s]+)&(?:amp;)?password=([^&"'\s]+)/i;

// ── HTML cleaning ─────────────────────────────────────────────────────────────

// Strips script/style blocks + all tags, collapses whitespace.
export const stripHtml = (html) =>
  collapseWs(
    stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, ""),
    ),
  ).trim();

// Strips tags, collapses whitespace.
export const plainText = (html) => collapseWs(stripTags(html)).trim();

// Strips tags and returns the first n chars of plain text.
export const errSnippet = (html, n = 120) => stripTags(html).slice(0, n).trim();

// ── Form / hidden input helpers ───────────────────────────────────────────────

// Collects every <input type="hidden"> into { [name]: value }.
export function extractHiddenInputs(html) {
  const body = {};
  for (const [tag] of matchAll(
    html,
    /<input[^>]+type=["']hidden["'][^>]*>/gi,
  )) {
    const name = /name=["']([^"']+)["']/.exec(tag)?.[1];
    if (name) body[name] = /value=["']([^"']*)["']/.exec(tag)?.[1] ?? "";
  }
  return body;
}

// Hidden input value by name — tries name-before-value then value-before-name.
export function extractInputValue(html, name) {
  const e = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`name="${e}"[^>]*value="([^"]*)"`, "i").exec(html)?.[1] ??
    new RegExp(`value="([^"]*)"[^>]*name="${e}"`, "i").exec(html)?.[1] ??
    null
  );
}

// CSRF token from _token / csrf-token / csrfmiddlewaretoken inputs or <meta> tag.
export const extractCsrfToken = (html) =>
  extractInputValue(html, "_token") ||
  extractInputValue(html, "csrf-token") ||
  extractInputValue(html, "csrfmiddlewaretoken") ||
  html.match(/content="([^"]+)"\s+name="csrf-token"/i)?.[1] ||
  null;

// CSRF token from inline JS object literal: csrfToken: 'VALUE'.
export const extractCsrfInlineJs = (html) =>
  html.match(/csrfToken:\s*['"]([^'"]+)['"]/)?.[1] ?? null;

// ── Links ─────────────────────────────────────────────────────────────────────

// Collects all URLs from href attributes and bare links (deduped).
export function extractLinks(content) {
  const hrefs = matchAll(content, /href=["']([^"']+)["']/gi).map((m) => m[1]);
  const bare = matchAll(content, /https?:\/\/[^\s"'<>\]]+/gi).map((m) => m[0]);
  return [...new Set([...hrefs, ...bare])];
}

// Recursively collects M3U-looking strings from any JSON shape.
export function extractM3uLinks(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.values(obj).flatMap((v) =>
    typeof v === "string" && /\.m3u|get\.php|type=m3u/i.test(v)
      ? [v]
      : typeof v === "object"
        ? extractM3uLinks(v)
        : [],
  );
}

// ── Playlists ─────────────────────────────────────────────────────────────────

const DURATION_UNITS = [
  { pattern: /дней|день|дня|days?/i, label: "Days", ms: 864e5 },
  { pattern: /месяцев|месяца|месяц|months?/i, label: "Months", ms: 2592e6 },
  { pattern: /часов|часа|час|hours?/i, label: "Hours", ms: 36e5 },
];

const DURATION_RE = new RegExp(
  `(\\d+)\\s*(${DURATION_UNITS.map((u) => u.pattern.source).join("|")})`,
  "i",
);

// Parses a duration string (e.g. "24 Hours", "3 дня") → { duration, expiresAt }.
export function extractDuration(content) {
  const m = content.match(DURATION_RE);
  if (!m) return { duration: null, expiresAt: null };
  const n = +m[1];
  const unit = DURATION_UNITS.find((u) => u.pattern.test(m[2]));
  return {
    duration: unit
      ? `${n} ${n === 1 ? unit.label.slice(0, -1) : unit.label}`
      : `${n} ${m[2]}`,
    expiresAt: unit
      ? computeExpiresAt(n * unit.ms, { timeZone: "Asia/Jerusalem" })
      : null,
  };
}

// Empty playlist result — returned by callers when no playlists are found.
export const EMPTY_PLAYLISTS = {
  tvPlaylist: null,
  vodPlaylist: null,
  allM3uLinks: [],
  duration: null,
  expiresAt: null,
};

// Parses M3U links from content, classifies TV vs VOD. Returns null if none found.
export function extractPlaylists(content) {
  const d = content.replace(/&amp;/gi, "&"); // decode &amp; so query-string URLs survive

  const M3U_RE =
    /https?:\/\/[^\s"'<>]*(?:\.m3u8?|[?&](?:type|output)=m3u|\/playlist\/)[^\s"'<>]*/gi;
  const HREF_RE =
    /href=["']([^"']*(?:\.m3u8?|[?&](?:type|output)=m3u)[^"']*)/gi;
  const CLIP_RE =
    /data-clipboard-text=["']([^"']*(?:\.m3u8?|[?&](?:type|output)=m3u|\/playlist\/)[^"']*)/gi;

  const unique = [
    ...new Set([
      ...matchAll(d, M3U_RE).map((m) => m[0]),
      ...matchAll(d, HREF_RE).map((m) => m[1]),
      ...matchAll(d, CLIP_RE).map((m) => m[1]),
    ]),
  ].filter((u) => /^https?:\/\//i.test(u));

  if (!unique.length) return null;

  const tv =
    unique.find((u) => /type=m3u|\/tv\.|\/playlist|live/i.test(u)) ?? unique[0];
  const vod =
    unique.find((u) => /\/vod\.|type=m3u8/i.test(u) && u !== tv) ??
    unique[1] ??
    null;

  return {
    tvPlaylist: tv,
    vodPlaylist: vod,
    allM3uLinks: unique,
    ...extractDuration(content),
  };
}

// ── Credentials ───────────────────────────────────────────────────────────────

// Extracts { user, pass } from HTML — get.php URL, data-* attrs, or label:value text.
export function extractCredentials(html) {
  if (!html) return null;
  const xtream = /get\.php\?/.test(html) && CREDS_RE.exec(html);
  if (xtream) return { user: xtream[1], pass: xtream[2] };
  const u =
    /data-username="([^"]+)"/i.exec(html)?.[1] ??
    /(?:username|user)[^>]{0,80}value="([^"]+)"/i.exec(html)?.[1] ??
    /(?:username|user)\s*[:-]\s*([A-Za-z0-9_@.+-]+)/i.exec(html)?.[1];
  const p =
    /data-password="([^"]+)"/i.exec(html)?.[1] ??
    /(?:password|passwd|pass)[^>]{0,80}value="([^"]+)"/i.exec(html)?.[1] ??
    /(?:password|passwd|pass)\s*[:-]\s*([A-Za-z0-9_@.+!#$%-]+)/i.exec(
      html,
    )?.[1];
  return u && p ? { user: u, pass: p } : null;
}

// Extracts { user, pass } from an M3U URL — /playlist/user/pass/ path or ?username=&password= query.
export const extractCredsFromM3u = (url) => {
  if (!url) return null;
  const r = /\/playlist\/([^/]+)\/([^/]+)\//.exec(url) ?? CREDS_RE.exec(url);
  return r ? { user: r[1], pass: r[2] } : null;
};
