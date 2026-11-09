/**
 * apiClient.js
 *
 * Generic JSON API fetch helper for REST-based services.
 *
 * Exports:
 *   makeApi(baseUrl, defaultOpts?) — returns a fetch helper bound to baseUrl
 *
 * Call opts:
 *   method      — HTTP verb (default "GET")
 *   body        — request payload; serialised to JSON automatically
 *   token       — Bearer token injected as Authorization header
 *   errorDetail — fn(json) → string; extracts a human-readable error from a
 *                 non-2xx response body (default: json.message)
 */

const DEFAULT_TIMEOUT = 25_000;

// JSON fetch — throws on non-2xx, returns null on 204.
async function apiFetch(
  baseUrl,
  path,
  {
    method = "GET",
    token = null,
    body = null,
    errorDetail = null,
    extraHeaders = {},
  } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = errorDetail?.(j) ?? j.message ?? JSON.stringify(j);
    } catch {
      /* unparseable body — detail stays empty */
    }
    throw new Error(
      `[apiClient] ${method} ${baseUrl}${path} → ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  return res.status === 204 ? null : res.json();
}

// Returns a fetch helper pre-bound to baseUrl.
export function makeApi(baseUrl, defaultOpts = {}) {
  return (path, callOpts) =>
    apiFetch(baseUrl, path, { ...defaultOpts, ...callOpts });
}
