/**
 * TrueTempMail disposable email provider.
 *
 * Creates a temporary Gmail address and reads its inbox through the TrueTempMail API.
 * Every request requires a per-device client_id ("client_<12chars>") that mirrors
 * the browser's "truetempmail_client_id" localStorage token.
 *
 * API:
 *   POST /api/create-gmail-inbox  { client_id, rotation_counter } → { id, display_email }
 *   POST /api/get-emails          { inbox_id, client_id }         → [ { id, from, sender, subject, otp_code } ]
 *   POST /api/get-email-detail    { inbox_id, client_id, email_id } → { …, body_text, body_html }
 */

import logger from "../logger.js";
import { makeApi } from "../http/apiClient.js";
import {
  makeGetReader,
  createProviderMethods,
  messageIdOf,
  joinFields,
} from "./base.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.truetempmail.com";
const TAG = "TrueTempMail";
const api = makeApi(BASE_URL);

// Shorthand for every POST call to this API.
const post = (path, body) => api(path, { method: "POST", body });

// ── Inbox reader ──────────────────────────────────────────────────────────────

// Builds an inbox reader bound to a specific inbox / client pair.
function buildReader({ inboxId, clientId }) {
  let items = [];
  const creds = { inbox_id: inboxId, client_id: clientId };

  // Finds a cached list item by its stable id.
  const find = (id) =>
    items.find((m, i) => String(messageIdOf(m, i)) === String(id));

  return {
    // Polls the inbox; API returns a bare array, not a wrapped object.
    async fetchMessages() {
      const res = await post("/api/get-emails", creds);
      items = Array.isArray(res) ? res : [];
      return items.map((m, i) => ({
        id: messageIdOf(m, i),
        preview: joinFields(m, "from sender subject otp_code"),
      }));
    },

    // Fetches the full body via get-email-detail; falls back to list fields on error.
    async readMessage(id) {
      const item = find(id) ?? {};
      try {
        const detail = await post("/api/get-email-detail", {
          ...creds,
          email_id: id,
        });
        return joinFields(
          { ...item, ...detail },
          "subject from sender body_text body_html otp_code",
        );
      } catch {
        return joinFields(item, "from sender subject otp_code");
      }
    },
  };
}

const getReader = makeGetReader("_trueTempMailCredential", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "truetempmail",
    name: TAG,
    url: BASE_URL,
    description: "dot Gmail",
    apiOnly: true,
  },

  // Creates a Gmail inbox and stores the inbox id + client token for polling.
  async createEmail(store) {
    logger.info(`[${TAG}] Creating Gmail inbox...`);
    const clientId = `client_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const { id: inboxId, display_email: email } = await post(
      "/api/create-gmail-inbox",
      {
        client_id: clientId,
        rotation_counter: 0,
      },
    );
    if (!inboxId || !email)
      throw new Error(`[${TAG}] No inbox returned from /create-gmail-inbox.`);
    store._trueTempMailCredential = { inboxId, clientId };
    logger.info(`[${TAG}] Email ready: ${email}`);
    return email;
  },

  ...createProviderMethods(TAG, getReader),
};
