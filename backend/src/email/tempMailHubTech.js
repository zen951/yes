/**
 * TempMailHub.tech disposable email provider.
 *
 * Generates Gmail dot aliases and reads their inbox through the API.
 *
 * API:
 *   POST /api/generate                → { success, data: { address } }
 *   GET  /api/inbox/{encoded address} → inbox messages
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

const BASE_URL = "https://tempmailhub.tech/api";
const SITE_URL = "https://tempmailhub.tech";
const TAG = "TempMailHub.tech";
const api = makeApi(BASE_URL);

const MESSAGE_FIELDS =
  "senderName senderEmail subject preview textBody htmlBody body";

// ── Inbox reader ──────────────────────────────────────────────────────────────

function buildReader({ address }) {
  let messages = [];
  const find = (id) =>
    messages.find((m, i) => String(messageIdOf(m, i)) === String(id));

  return {
    async fetchMessages() {
      const res = await api(`/inbox/${encodeURIComponent(address)}`);
      if (res?.success === false)
        throw new Error(
          `[${TAG}] Inbox request failed: ${res.message ?? res.error ?? ""}`,
        );

      // API wraps the array in varying shapes depending on the response version.
      messages =
        [
          res?.data?.messages,
          res?.data?.emails,
          res?.data,
          res?.messages,
          res?.emails,
        ].find(Array.isArray) ?? [];
      return messages.map((m, i) => ({
        id: messageIdOf(m, i),
        preview: joinFields(m, MESSAGE_FIELDS),
      }));
    },

    async readMessage(id) {
      return joinFields(find(id), MESSAGE_FIELDS);
    },
  };
}

const getReader = makeGetReader("_tempMailHubTechCredential", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "tempmailhub-tech",
    name: TAG,
    url: SITE_URL,
    description: "Gmail dot aliases",
    apiOnly: true,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Generating Gmail alias...`);
    const res = await api("/generate", {
      method: "POST",
      body: {
        domain: false,
        plusGmail: false,
        dotGmail: true,
        googleMail: false,
      },
    });
    const address = res?.data?.address;
    if (res?.success !== true || !address)
      throw new Error(`[${TAG}] No email returned from /generate.`);

    store._tempMailHubTechCredential = { address };
    logger.info(`[${TAG}] Email ready: ${address}`);
    return address;
  },

  ...createProviderMethods(TAG, getReader),
};
