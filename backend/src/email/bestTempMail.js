/**
 * Best Temp Mail disposable email provider.
 *
 * API:
 *   POST /api/v3/createEmail  → { status, data: { address, id, update_tag } }
 *   POST /api/v3/getEmailList → { status, data: { emailList, update_tag } }
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

const BASE_URL = "https://best-temp-mail.com";
const TAG = "Best Temp Mail";
const api = makeApi(`${BASE_URL}/api/v3`);

const PREVIEW_FIELDS = "from_address subject text";
const CONTENT_FIELDS = "html text subject";

// ── API helper ───────────────────────────────────────────────────────────────

// Sends a POST request and returns the API data payload.
async function request(path, body) {
  const response = await api(path, { method: "POST", body });
  if (response?.status !== "success")
    throw new Error(`[${TAG}] ${path} returned an unsuccessful response.`);
  return response.data;
}

// ── Inbox reader ─────────────────────────────────────────────────────────────

function buildReader(credential) {
  // Empty refreshes omit emailList, so retain the previous list.
  let messages = [];

  return {
    async fetchMessages() {
      const data = await request("/getEmailList", {
        ...credential,
        update_tag: credential.updateTag,
      });

      credential.updateTag = data?.update_tag ?? credential.updateTag;
      if (data?.hasNewEmail) messages = data.emailList ?? [];

      return messages.map((msg, i) => ({
        id: messageIdOf(msg, i),
        preview: joinFields(msg, PREVIEW_FIELDS),
      }));
    },

    // Body ships inline in the listing — read directly from cache.
    async readMessage(id) {
      const msg = messages.find(
        (m, i) => String(messageIdOf(m, i)) === String(id),
      );
      return msg ? joinFields(msg, CONTENT_FIELDS) : "";
    },
  };
}

const getReader = makeGetReader("_bestTempMailCredential", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "best-temp-mail",
    name: TAG,
    url: BASE_URL,
    description: "@aabkmail.com",
    apiOnly: true,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Creating mailbox...`);
    const intToken = crypto.randomUUID();
    const {
      address,
      id,
      update_tag: updateTag,
    } = (await request("/createEmail", { intToken })) ?? {};

    if (!address || !id || !updateTag)
      throw new Error(`[${TAG}] Incomplete mailbox returned from API.`);

    store._bestTempMailCredential = { address, id, updateTag, intToken };
    logger.info(`[${TAG}] Email ready: ${address}`);
    return address;
  },

  // readDelay 0: body is already cached from fetchMessages, no separate read step.
  ...createProviderMethods(TAG, getReader, { readDelay: 0 }),
};
