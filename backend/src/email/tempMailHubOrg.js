/**
 * TempMailHubOrg disposable email provider (tempmailhub.org).
 *
 * Creates a temporary Gmail address and reads its inbox through the TempMailHub API.
 *
 * API:
 *   POST /emails                              → { email, email_id }
 *   POST /emails/messages?email_id={email_id} → { emails: [{ id, subject, senderName, senderEmail, body }] }
 *
 * The full body is returned in the inbox listing, so no separate read request is needed.
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

const BASE_URL = "https://api.tempmailhub.org";
const SITE_URL = "https://tempmailhub.org";
const TAG = "TempMailHubOrg";
const api = makeApi(BASE_URL);

const PREVIEW_FIELDS = "senderName senderEmail subject body";
const CONTENT_FIELDS = "body subject senderName senderEmail";

// ── Inbox reader ──────────────────────────────────────────────────────────────

function buildReader({ emailId }) {
  let messages = [];
  const fetchInbox = () =>
    api(`/emails/messages?email_id=${emailId}`, { method: "POST", body: {} });
  const find = (id) =>
    messages.find((m, i) => String(messageIdOf(m, i)) === String(id));

  return {
    async fetchMessages() {
      messages = (await fetchInbox())?.emails ?? [];
      return messages.map((m, i) => ({
        id: messageIdOf(m, i),
        preview: joinFields(m, PREVIEW_FIELDS),
      }));
    },

    // Body ships in the inbox listing — read from cache.
    async readMessage(id) {
      const msg = find(id);
      return msg ? joinFields(msg, CONTENT_FIELDS) : "";
    },
  };
}

const getReader = makeGetReader("_tempMailHubOrgCredential", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "tempmailhub",
    name: TAG,
    url: SITE_URL,
    description: "@gmail.com [Real]",
    apiOnly: false,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Creating mailbox...`);
    const { email, email_id: emailId } = await api("/emails", {
      method: "POST",
      body: {},
    });
    if (!email || !emailId)
      throw new Error(`[${TAG}] Incomplete mailbox returned from /emails.`);

    store._tempMailHubOrgCredential = { emailId };
    logger.info(`[${TAG}] Email ready: ${email}`);
    return email;
  },

  ...createProviderMethods(TAG, getReader),
};
