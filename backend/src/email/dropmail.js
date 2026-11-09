/**
 * DropMail disposable email provider.
 *
 * Uses the DropMail public REST API — no auth required.
 *
 * API:
 *   POST /mailbox           → { address }
 *   GET  /mailbox/{address} → { messages: [{ id, from, subject, text, html }] }
 */

import logger from "../logger.js";
import { makeApi } from "../http/apiClient.js";
import { makeGetReader, createProviderMethods, joinFields } from "./base.js";

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://dropmail.click/api/v1/public";
const TAG = "DropMail";
const api = makeApi(BASE_URL);

// ── Inbox reader ──────────────────────────────────────────────────────────────

// DropMail includes full message content in the list response, so messages are cached locally.
function buildReader(address) {
  let cache = [];

  return {
    async fetchMessages() {
      const data = await api(`/mailbox/${encodeURIComponent(address)}`);
      cache = data?.messages ?? [];
      return cache.map((msg) => ({
        id: msg.id,
        preview: joinFields(msg, "from subject"),
      }));
    },

    async readMessage(id) {
      const msg = cache.find((m) => m.id === id);
      return msg ? joinFields(msg, "text html") : "";
    },
  };
}

const getReader = makeGetReader("_dropmailAddress", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "dropmail",
    name: "DropMail",
    url: "https://dropmail.click",
    description: "@dropmail.click",
    apiOnly: true,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Creating mailbox...`);
    const data = await api("/mailbox", { method: "POST" });
    const address = data?.address;
    if (!address) throw new Error(`[${TAG}] No address returned from API.`);
    store._dropmailAddress = address;
    logger.info(`[${TAG}] Email ready: ${address}`);
    return address;
  },

  ...createProviderMethods(TAG, getReader),
};
