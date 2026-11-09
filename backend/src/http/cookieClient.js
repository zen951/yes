/**
 * cookieClient.js
 *
 * Cookie-aware HTTP client; manually follows redirects so Set-Cookie headers
 * from every 3xx hop are captured (fetch redirect:"follow" drops them).
 *
 * Exports:
 *   createJar()                      — empty cookie jar
 *   mergeCookies(jar, response)      — harvest Set-Cookie into jar
 *   cookieStr(jar)                   — serialise jar → Cookie string
 *   request(method, url, jar, opts?) — core fetch + redirect loop
 *   get / post / multipartPost / jsonPost — request shorthands
 *   DEFAULT_UA                       — default User-Agent string
 */

import { fetch as undiciFetch } from "undici";

export const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MAX_REDIRECTS = 10;
const DEFAULT_TIMEOUT = 25_000;

// ── Jar helpers ───────────────────────────────────────────────────────────────

export const createJar = () => ({});

// Reads Set-Cookie headers from res into jar.
export function mergeCookies(jar, response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
}

// Serialises jar → Cookie header string.
export const cookieStr = (jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

// ── Shared helpers ────────────────────────────────────────────────────────────

// Base headers shared by every request (User-Agent + Cookie).
const baseHeaders = (ua, jar) => ({ "User-Agent": ua, Cookie: cookieStr(jar) });

// Common fetch opts with defaults.
const commonOpts = ({
  ua = DEFAULT_UA,
  timeout = DEFAULT_TIMEOUT,
  extraHeaders = {},
} = {}) => ({ ua, timeout, extraHeaders });

// ── Core request ──────────────────────────────────────────────────────────────

// Fetches url, manually follows redirects (collecting cookies at each hop).
// POST → 302 re-issues as GET (standard browser behaviour).
export async function request(method, url, jar, opts = {}) {
  const {
    body = null,
    referer = null,
    origin = null,
    dispatcher = null,
    ...rest
  } = opts;
  const { ua, timeout, extraHeaders } = commonOpts(rest);
  const jar_ = jar ?? {};
  let [curUrl, curMethod, curBody] = [url, method, body];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers = {
      ...baseHeaders(ua, jar_),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      ...extraHeaders,
    };

    if (curMethod === "POST") {
      Object.assign(headers, {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: origin ?? new URL(curUrl).origin,
        Referer: referer ?? curUrl,
      });
    }

    const fetchFn = dispatcher ? undiciFetch : fetch;
    const res = await fetchFn(curUrl, {
      method: curMethod,
      headers,
      body:
        curMethod === "POST" && curBody
          ? new URLSearchParams(curBody).toString()
          : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
      ...(dispatcher ? { dispatcher } : {}),
    });

    mergeCookies(jar_, res);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      curUrl = new URL(location, curUrl).href; // resolve relative Location
      curMethod = "GET";
      curBody = null;
      continue;
    }

    return { text: await res.text(), finalUrl: curUrl, status: res.status };
  }

  throw new Error(`[cookieClient] Too many redirects from ${url}`);
}

// ── Shorthands ────────────────────────────────────────────────────────────────

export const get = (url, jar, opts) => request("GET", url, jar, opts);
export const post = (url, jar, body, referer, opts) =>
  request("POST", url, jar, { body, referer, ...opts });

// Sends a multipart/form-data body via FormData.
// Do NOT set Content-Type — fetch sets it with the correct boundary automatically.
export async function multipartPost(url, jar, body, referer, opts = {}) {
  const { ua, timeout, extraHeaders } = commonOpts(opts);
  const jar_ = jar ?? {};

  const fd = new FormData();
  for (const [k, v] of Object.entries(body))
    if (v != null) fd.append(k, String(v));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...baseHeaders(ua, jar_),
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: new URL(url).origin,
      Referer: referer ?? url,
      ...extraHeaders,
    },
    body: fd,
    redirect: "manual",
    signal: AbortSignal.timeout(timeout),
  });

  mergeCookies(jar_, res);
  return { text: await res.text(), finalUrl: url, status: res.status };
}

// Posts JSON, harvests cookies if jar provided, returns parsed response (or {} on failure).
// jar optional — pass null for stateless calls.
// opts.throwOnError (default true) — set false to suppress throws on non-2xx.
export async function jsonPost(url, jar, body, opts = {}) {
  const { ua, timeout, extraHeaders } = commonOpts(opts);
  const { referer = null, origin = null, throwOnError = true } = opts;
  const jar_ = jar ?? {};

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...baseHeaders(ua, jar_),
      "Content-Type": "application/json",
      Accept: "application/json, text/html, */*;q=0.8",
      Origin: origin ?? new URL(url).origin,
      Referer: referer ?? url,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(timeout),
  });

  if (jar) mergeCookies(jar, res);

  let data;
  try {
    data = JSON.parse(await res.text());
  } catch {
    data = {};
  }

  if (throwOnError && !res.ok)
    throw new Error(data?.error ?? data?.message ?? `HTTP ${res.status}`);

  return data;
}
