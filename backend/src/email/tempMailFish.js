/**
 * TempMail.fish disposable email provider.
 *
 * Creates a temporary mailbox and reads its inbox through the TempMail.fish API.
 *
 * API:
 *   POST /emails/new-email                       → { email, authKey }
 *   GET  /emails/emails?emailAddress={address}   → [{ id, from, subject, htmlBody, textBody }]
 *
 * Auth: `Authorization: <authKey>` header on subsequent requests.
 */

import logger from "../logger.js";
import {
  makeGetReader,
  createProviderMethods,
  messageIdOf,
  joinFields,
} from "./base.js";

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.tempmail.fish";
const TAG = "TempMail.fish";

// ── HTTP helper ───────────────────────────────────────────────────────────────

// Performs API requests with JSON headers and an optional mailbox authKey.
async function request(path, { method = "GET", authKey } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(authKey
        ? { Authorization: authKey }
        : { "Content-Type": "application/json" }),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`[${TAG}] ${path} → HTTP ${res.status}`);
  return res.json();
}

// ── Inbox reader ──────────────────────────────────────────────────────────────

function buildReader({ address, authKey }) {
  let messages = [];
  const find = (id) =>
    messages.find((m, i) => String(messageIdOf(m, i)) === String(id));

  return {
    async fetchMessages() {
      const data = await request(
        `/emails/emails?emailAddress=${encodeURIComponent(address)}`,
        { authKey },
      );
      messages = Array.isArray(data) ? data : (data?.emails ?? []);
      return messages.map((msg, i) => ({
        id: String(messageIdOf(msg, i)),
        preview: joinFields(msg, "from subject textBody"),
      }));
    },

    async readMessage(id) {
      const msg = find(id);
      return joinFields(msg, "htmlBody textBody subject");
    },
  };
}

const getReader = makeGetReader("_tempMailFishCredential", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "tempmail-fish",
    name: TAG,
    url: "https://tempmail.fish",
    description: "@frostypeak.info",
    apiOnly: true,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Creating mailbox...`);
    const { email: address, authKey } = await request("/emails/new-email", {
      method: "POST",
    });
    if (!address || !authKey)
      throw new Error(`[${TAG}] Incomplete mailbox returned from API.`);

    store._tempMailFishCredential = { address, authKey };
    logger.info(`[${TAG}] Email ready: ${address}`);
    return address;
  },

  ...createProviderMethods(TAG, getReader),
};
