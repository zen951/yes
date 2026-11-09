/**
 * TempGmailer disposable email provider.
 *
 * Generates @gmail.com addresses via the TempGmailer web API.
 * Requires a CSRF token extracted from the homepage.
 *
 * API:
 *   POST /get-gmail  { refresh: 1, adblock: 0 }  → { data: { email } }
 *   POST /get-inbox  { email, adblock: 0 }        → { data: { emails|messages|inbox } }
 */

import logger from "../logger.js";
import { createJar, get, jsonPost } from "../http/cookieClient.js";
import {
  makeGetReader,
  createProviderMethods,
  messageIdOf,
  joinFields,
} from "./base.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://tempgmailer.com";
const TAG = "TempGmailer";

const PREVIEW_FIELDS = "from senderName senderEmail subject preview";
const CONTENT_FIELDS = "subject text body html htmlBody textBody message";

// ── CSRF session ──────────────────────────────────────────────────────────────

// Module-level session; refreshed automatically on CSRF errors (HTTP 419).
let session = null;

async function getSession(force = false) {
  if (session && !force) return session;
  const jar = createJar();
  const { text, status } = await get(BASE_URL, jar);
  if (status < 200 || status >= 300)
    throw new Error(`[${TAG}] Failed to load CSRF session: HTTP ${status}.`);
  // Pull the token from <meta name="csrf-token" content="…">.
  const csrfToken = text
    .match(/<meta\b(?=[^>]*\bname=["']csrf-token["'])[^>]*>/i)?.[0]
    ?.match(/\bcontent=["']([^"']+)["']/i)?.[1];
  if (!csrfToken) throw new Error(`[${TAG}] CSRF token not found.`);
  return (session = { jar, csrfToken });
}

// ── API ───────────────────────────────────────────────────────────────────────

// Retries once with a fresh session when the server rejects the CSRF token.
async function api(path, body) {
  const call = (s) =>
    jsonPost(`${BASE_URL}${path}`, s.jar, body, {
      referer: BASE_URL,
      origin: BASE_URL,
      extraHeaders: { "X-CSRF-TOKEN": s.csrfToken },
    });
  try {
    return await call(await getSession());
  } catch (err) {
    if (!/\b419\b|csrf token mismatch|token mismatch/i.test(err.message))
      throw err;
    return call(await getSession(true)); // force-refresh and retry once
  }
}

// ── Inbox reader ──────────────────────────────────────────────────────────────

function buildReader({ email }) {
  let messages = [];
  return {
    async fetchMessages() {
      const res = await api("/get-inbox", { email, adblock: 0 });
      if (res?.success === false || res?.error === true)
        throw new Error(`[${TAG}] /get-inbox failed.`);
      // The inbox array may be nested differently across API versions — try each.
      messages = [
        res?.data?.emails,
        res?.data?.messages,
        res?.data?.inbox,
        res?.emails,
        res?.messages,
        res?.inbox,
        res?.data,
        res,
      ].find(Array.isArray);
      if (!messages) throw new Error(`[${TAG}] Unexpected /get-inbox shape.`);
      return messages.map((m, i) => ({
        id: messageIdOf(m, i),
        preview: joinFields(m, PREVIEW_FIELDS),
      }));
    },

    async readMessage(id) {
      const msg = messages.find(
        (m, i) => String(messageIdOf(m, i)) === String(id),
      );
      return joinFields(msg, CONTENT_FIELDS);
    },
  };
}

const getReader = makeGetReader("_tempgmailerEmail", TAG, buildReader);

// ── Provider ──────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "tempgmailer",
    name: TAG,
    url: BASE_URL,
    description: "dot Gmail",
    apiOnly: true,
  },

  async createEmail(store) {
    logger.info(`[${TAG}] Generating Gmail address...`);
    const res = await api("/get-gmail", { refresh: 1, adblock: 0 });
    if (res?.success === false || res?.error === true)
      throw new Error(`[${TAG}] /get-gmail failed.`);
    const email = res?.data?.email;
    if (!email) throw new Error(`[${TAG}] No email returned from /get-gmail.`);
    store._tempgmailerEmail = { email };
    logger.info(`[${TAG}] Email ready: ${email}`);
    return email;
  },

  ...createProviderMethods(TAG, getReader),
};
