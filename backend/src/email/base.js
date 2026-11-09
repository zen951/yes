/**
 * email/base.js
 *
 * Shared infrastructure every disposable email provider is built on.
 * Providers write credentials onto a plain store object in createEmail(),
 * then read them back here when polling starts.
 *
 * Exports:
 *   makeGetReader(pageKey, tag, buildReader)      — credential guard for polling
 *   createProviderMethods(tag, getReader, opts?)  — 3 inbox-polling methods
 *   messageIdOf(message, index)                   — stable message id from common fields
 *   joinFields(message, fields)                    — joins selected message fields into a string
 *   retryWithFreshEmail(fn, opts)                  — auto-retry with a fresh address on retryable errors
 */

import logger from "../logger.js";
import { pollApi } from "../http/poller.js";
import {
  extractLinks,
  extractPlaylists,
  EMPTY_PLAYLISTS,
  plainText,
  errSnippet,
} from "../parsing/extractors.js";

// Resolves after ms milliseconds — same helper shape as poller.js.
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Message helpers ──────────────────────────────────────────────────────────

// Stable message identifier from common id field names; falls back to index.
export const messageIdOf = (message, index) =>
  message?.id ??
  message?._id ??
  message?.message_id ??
  message?.received_at ??
  index;

// Joins a space-separated field list from a message into one string.
export const joinFields = (message, fields) =>
  fields
    .split(" ")
    .map((f) => message?.[f])
    .filter(Boolean)
    .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
    .join("\n")
    .trim();

// ── Credential helper ────────────────────────────────────────────────────────

// Returns a getReader that reads pageKey off the store; throws if createEmail wasn't called.
export const makeGetReader = (pageKey, tag, buildReader) => (store) => {
  const credential = store[pageKey];
  if (!credential)
    throw new Error(`[${tag}] No ${pageKey} — call createEmail first.`);
  return buildReader(credential);
};

// ── Retry helper ─────────────────────────────────────────────────────────────

// Retries fn(email, attempt) with a fresh throwaway address on retryable errors.
export async function retryWithFreshEmail(fn, opts) {
  let { email } = opts;
  const { provider, credentialStore, inboxSeenIds, log, tag, shouldRetry } =
    opts;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(email, attempt);
    } catch (error) {
      if (!shouldRetry(error, attempt)) throw error;
      email = await provider.createEmail(credentialStore);
      inboxSeenIds.clear();
      log(
        `[${tag}] ⚠️ Attempt ${attempt} rejected ➜ 🔄 Retrying with new email ➜ 📧 ${email}`,
      );
      await delay(1_500);
    }
  }
}

// ── Inbox polling ───────────────────────────────────────────────────────────

// Extracts the four poll options every method accepts, with shared defaults.
const pollOpts = ({
  filterText = "",
  seenIds = new Set(),
  timeout = 120_000,
  signal = null,
} = {}) => ({ filterText, seenIds, timeout, signal });

// Generates the three standard inbox-polling methods for any API-based provider.
export function createProviderMethods(tag, getReader, defaultOpts = {}) {
  const pollingDefaults = { pollDelay: 1_000, readDelay: 0, ...defaultOpts };

  // Starts the poll loop, logs the outcome, and returns the result.
  async function poll(store, startMsg, timeoutMsg, opts, onRow) {
    logger.info(`[${tag}] ${startMsg}`);
    const result = await pollApi(
      getReader(store),
      { ...pollingDefaults, ...opts },
      onRow,
    );
    if (!result) logger.warn(`[${tag}] ${timeoutMsg}`);
    return result;
  }

  // Logs success or warning for a poll row result, then returns it.
  const report = (value, ok, miss) => {
    if (value) logger.info(`[${tag}] ${ok}`);
    else logger.warn(`[${tag}] ${miss}`);
    return value;
  };

  return {
    // Polls until a 6-digit verification code arrives.
    async waitForVerificationCodeEmail(store, opts = {}) {
      const { codeRe = /\b(\d{6})\b/ } = opts;
      return poll(
        store,
        "Polling inbox for verification code...",
        "Timed out waiting for verification code.",
        pollOpts(opts),
        (content, preview) => {
          // Strip tags so codes inside <b>/<span> are visible to the regex.
          const code =
            codeRe.exec(preview)?.[1] ??
            codeRe.exec(plainText(content))?.[1] ??
            null;
          return report(
            code,
            `Code found: ${code}`,
            `No code in this email — skipping. preview: ${errSnippet(preview)}`,
          );
        },
      );
    },

    // Polls until a matching email arrives, then returns the first URL (or first match for pattern).
    async waitForEmailAndExtractLink(store, opts = {}) {
      const { pattern = null, filterText = "" } = opts;
      const label = filterText ? ` matching "${filterText}"` : "";
      return poll(
        store,
        `Waiting for link email${label}...`,
        `Timed out waiting for email${label}.`,
        pollOpts(opts),
        (content, preview) => {
          const links = extractLinks(content);
          const match =
            (pattern ? links.find((l) => pattern.test(l)) : links[0]) ?? null;
          return report(
            match,
            `Extracted link: ${match}`,
            `No usable link in email (preview: "${errSnippet(preview, 80)}") — skipping.`,
          );
        },
      );
    },

    // Polls until an email with M3U playlist links arrives. Never returns null.
    async waitForEmailAndExtractPlaylists(store, opts = {}) {
      const { filterText = "" } = opts;
      const label = filterText ? ` matching "${filterText}"` : "";
      const result = await poll(
        store,
        `Polling inbox for playlist email${label}...`,
        "Timed out waiting for playlist email.",
        pollOpts(opts),
        (content, preview) => {
          const playlists = extractPlaylists(content);
          if (!playlists) {
            logger.warn(
              `[${tag}] No M3U links in this email — skipping. preview: ${errSnippet(preview)}`,
            );
            return null;
          }
          logger.info(
            `[${tag}] TV: ${playlists.tvPlaylist}, VOD: ${playlists.vodPlaylist ?? "none"}, total: ${playlists.allM3uLinks.length}`,
          );
          if (playlists.duration)
            logger.info(
              `[${tag}] Duration: ${playlists.duration}${playlists.expiresAt ? ` · expires: ${playlists.expiresAt}` : ""}`,
            );
          return playlists;
        },
      );
      return result ?? EMPTY_PLAYLISTS;
    },
  };
}
