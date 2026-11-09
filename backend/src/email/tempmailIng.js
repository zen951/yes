/**
 * TempMail.ing disposable email provider (website API).
 *
 * Generates a temporary address and reads its inbox through the public API.
 * No account, token, or hardcoded mailbox is used.
 *
 * API:
 *   POST /api/generate             → { success, email: { address, ... } }
 *   GET  /api/emails/{email}       → { success, emails: [{ id, content, ... }] }
 */

import logger from "../logger.js";
import { makeApi } from "../http/apiClient.js";
import {
  makeGetReader,
  createProviderMethods,
  messageIdOf,
  joinFields,
} from "./base.js";

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.tempmail.ing";
const SITE_URL = "https://tempmail.ing";
const TAG = "TempMail.ing";
const api = makeApi(BASE_URL);

const MESSAGE_FIELDS =
  "from_address sender to_address subject preview text content html";

// ── Inbox reader ──────────────────────────────────────────────────────────────

function buildReader(address) {
  let messages = [];
  const fetchInbox = () => api(`/api/emails/${encodeURIComponent(address)}`);
  const toList = (data) => (Array.isArray(data?.emails) ? data.emails : []);
  const find = (id) =>
    messages.find((m, i) => String(messageIdOf(m, i)) === String(id));

  return {
    async fetchMessages() {
      messages = toList(await fetchInbox());
      return messages.map((m, i) => ({
        id: messageIdOf(m, i),
        preview: joinFields(m, MESSAGE_FIELDS),
      }));
    },

    async readMessage(id) {
      let msg = find(id);
      if (!msg) {
        messages = toList(await fetchInbox());
        msg = find(id);
      }
      return joinFields(msg, MESSAGE_FIELDS);
    },
  };
}

const getReader = makeGetReader("_tempmailIngAddress", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "tempmail-ing",
    name: "TempMail.ing",
    url: SITE_URL,
    description: "@.com",
    apiOnly: false,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Creating mailbox...`);
    const data = await api("/api/generate", { method: "POST", body: {} });
    const address = data?.email?.address;
    if (!address)
      throw new Error(`[${TAG}] No email returned from /api/generate.`);

    store._tempmailIngAddress = address;
    logger.info(`[${TAG}] Email ready: ${address}`);
    return address;
  },

  ...createProviderMethods(TAG, getReader),
};
