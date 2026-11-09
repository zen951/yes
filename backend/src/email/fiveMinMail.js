/**
 * 5minMail disposable email provider (website API).
 *
 * Generates a temporary address and reads its inbox through the public
 * 5minMail website endpoints. No account, token, or hardcoded mailbox is used.
 *
 * API:
 *   POST /generate          → { email, expires_in_minutes }
 *   GET  /inbox/{email}     → [{ sender, subject, body, received_at }]
 *                             bare array; `body` contains the full HTML/text body.
 */

import logger from "../logger.js";
import { makeApi } from "../http/apiClient.js";
import { makeGetReader, createProviderMethods, joinFields } from "./base.js";

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://5minmail.com";
const TAG = "5minMail";
const api = makeApi(BASE_URL);

const PREVIEW_FIELDS = "sender subject body";
const CONTENT_FIELDS = "body subject";

// ── Inbox reader ──────────────────────────────────────────────────────────────

// Normalises bare-array or { value: [...] } inbox shapes into a plain array.
const toList = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.value) ? data.value : [];

function buildReader(address) {
  let messages = [];
  const fetchInbox = () => api(`/inbox/${encodeURIComponent(address)}`);

  return {
    async fetchMessages() {
      messages = toList(await fetchInbox());
      return messages.map((m, i) => ({
        id: i,
        preview: joinFields(m, PREVIEW_FIELDS),
      }));
    },

    async readMessage(id) {
      if (!messages[id]) messages = toList(await fetchInbox());
      return joinFields(messages[id], CONTENT_FIELDS);
    },
  };
}

const getReader = makeGetReader("_fiveMinMailAddress", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "5minmail",
    name: "5minMail",
    url: BASE_URL,
    description: "@zelnro.com",
    apiOnly: false,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Creating mailbox...`);
    const { email: address, expires_in_minutes: expires } = await api(
      "/generate",
      { method: "POST" },
    );
    if (!address) throw new Error(`[${TAG}] No email returned from /generate.`);

    store._fiveMinMailAddress = address;
    logger.info(
      `[${TAG}] Email ready: ${address} (expires in ${expires ?? "unknown"} minutes)`,
    );
    return address;
  },

  ...createProviderMethods(TAG, getReader),
};
