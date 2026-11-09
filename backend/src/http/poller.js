/**
 * poller.js
 *
 * Generic inbox poll loop for REST-API email providers.
 *
 * Accepts a reader object with two methods:
 *   fetchMessages() → [{ id, preview }]
 *   readMessage(id) → full email content string
 *
 * Exports:
 *   pollApi(reader, opts, onRow) — poll loop; calls onRow per new unseen email
 */

import logger from "../logger.js";

const DEFAULT_POLL_DELAY = 800;
const DEFAULT_READ_DELAY = 1_500;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Polls inbox until onRow returns non-null or timeout expires.
export async function pollApi(
  { fetchMessages, readMessage },
  {
    filterText = "",
    seenIds = new Set(),
    timeout = 120_000,
    pollDelay = DEFAULT_POLL_DELAY,
    readDelay = DEFAULT_READ_DELAY,
    signal = null,
  },
  onRow,
) {
  const deadline = Date.now() + timeout;
  const filters = Array.isArray(filterText)
    ? filterText
    : filterText
      ? [filterText]
      : [];
  const matches = (preview) =>
    !filters.length ||
    filters.some((f) => preview.toLowerCase().includes(f.toLowerCase()));

  while (Date.now() < deadline) {
    if (signal?.aborted) return null;

    let messages = [],
      hadError = false;
    try {
      messages = await fetchMessages();
    } catch (err) {
      hadError = true;
      logger.warn(`[poller] fetchMessages failed: ${err.message}`);
    }

    logger.info(`[poller] Inbox: ${messages.length} message(s).`);

    for (const { id, preview } of messages) {
      if (signal?.aborted) return null;
      if (seenIds.has(id) || !matches(preview)) continue;

      // Mark seen after filter — lets another filterText still claim it.
      seenIds.add(id);

      // Pause before reading to respect provider rate limits.
      if (readDelay > 0) {
        await delay(readDelay);
        if (signal?.aborted) return null;
      }

      let content = "";
      try {
        content = await readMessage(id);
      } catch (err) {
        logger.warn(`[poller] readMessage ${id} failed: ${err.message}`);
        continue;
      }

      const result = await onRow(content, preview);
      if (result != null) return result;
    }

    // Back off on errors (e.g. 429).
    await delay(hadError ? Math.max(pollDelay, 3_000) : pollDelay);
    if (signal?.aborted) return null;
  }

  return null;
}
