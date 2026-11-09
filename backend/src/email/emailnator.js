/**
 * Emailnator disposable email provider.
 *
 * Generates dot-trick @gmail.com addresses via the Emailnator web API.
 * No session or XSRF token required.
 *
 * API:
 *   POST /api/generate-email { ids: [3] } → { email: "address" }
 *   POST /api/message-list   { email }    → { messages: [{id, from, subject, locked}] }
 *   GET  /api/message/:id                 → { content (HTML) }
 */

import logger from "../logger.js";
import { makeGetReader, createProviderMethods, joinFields } from "./base.js";
import { DEFAULT_UA } from "../http/cookieClient.js";
import { errSnippet } from "../parsing/extractors.js";

// ── Config ───────────────────────────────────────────────────────────────────

const BASE = "https://www.emailnator.com";
const TAG = "Emailnator";

// ── HTTP helper ───────────────────────────────────────────────────────────────

// Sends a request to the Emailnator API with required browser-like headers.
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, */*",
      "User-Agent": DEFAULT_UA,
      Referer: `${BASE}/`,
      Origin: BASE,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `[${TAG}] ${method} ${path} → ${res.status} ${errSnippet(text)}`,
    );
  }
  return res.json();
}

// ── Inbox reader ──────────────────────────────────────────────────────────────

function buildReader({ address }) {
  return {
    // Returns unlocked messages only — locked messages are ads/system notices.
    async fetchMessages() {
      const data = await api("POST", "/api/message-list", { email: address });
      return (data?.messages ?? [])
        .filter((m) => !m.locked)
        .map((m) => ({
          id: m.id,
          preview: joinFields(m, "from subject"),
        }));
    },

    async readMessage(id) {
      const data = await api("GET", `/api/message/${encodeURIComponent(id)}`);
      return data?.content ?? "";
    },
  };
}

const getReader = makeGetReader("_emailnatorCredential", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "emailnator",
    name: "Emailnator",
    url: BASE,
    description: "dot/plus Gmail ",
    apiOnly: true,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Generating dotGmail address...`);
    const data = await api("POST", "/api/generate-email", { ids: [3] }); // 3 = dotGmail
    const address = typeof data?.email === "string" ? data.email : null;
    if (!address)
      throw new Error(`[${TAG}] No address returned from generate-email.`);
    store._emailnatorCredential = { address };
    logger.info(`[${TAG}] Email ready: ${address}`);
    return address;
  },

  ...createProviderMethods(TAG, getReader),
};
