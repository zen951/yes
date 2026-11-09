/**
 * engine/simplePost.js
 *
 * Factory for the most common service pattern: POST a payload → poll inbox for M3U credentials.
 *
 * Exports:
 *   simplePost(config) — returns a service object { meta, execute } ready for the registry
 *
 * Config fields:
 *   meta        { id, name, description, group }
 *   url         "https://…"
 *   referer     "https://…"        optional, defaults to url
 *   origin      "https://…"        optional, defaults to url origin
 *   filterText  string | string[]  inbox filter passed to waitForEmailAndExtractPlaylists
 *   trialHours  number             fixed-hour expiry
 *   expiryDate  () => Date         dynamic expiry, called at run time (takes priority over trialHours)
 *   payload     (email) => object  builds the POST body for the given email address
 */

import { buildResult } from "../parsing/generators.js";
import { jsonPost } from "../http/cookieClient.js";

// ── Factory ───────────────────────────────────────────────────────────────────

// Returns a service object whose execute() submits a trial request and polls
// the inbox for the credentials email.
export const simplePost = ({
  meta,
  url,
  referer,
  origin,
  filterText,
  trialHours,
  expiryDate,
  payload,
}) => {
  const TAG = meta.name;

  return {
    meta,
    async execute({
      provider,
      credentialStore,
      email,
      inboxSeenIds = new Set(),
      log = () => {},
    }) {
      log(`[${TAG}] 📝 Submitting free trial request...`);

      // null = no cookie jar needed; fall back to url if no explicit referer.
      const raw = await jsonPost(url, null, payload(email), {
        referer: referer ?? url,
        origin,
      });
      log(`[${TAG}] 📡 Response: ${JSON.stringify(raw)}`);

      log(`[${TAG}] 📬 Waiting for credentials email...`);

      // Snapshot seenIds so the poller only watches for messages arriving after this point.
      const playlists = await provider.waitForEmailAndExtractPlaylists(
        credentialStore,
        { filterText, seenIds: new Set(inboxSeenIds), timeout: 120_000 },
      );

      if (playlists.allM3uLinks.length) {
        const url = playlists.tvPlaylist ?? playlists.allM3uLinks[0];
        log(`[${TAG}] 📺 ${url}`);
      } else {
        log(`[${TAG}] ⚠️ No M3U links found in credentials email.`, "warn");
      }

      // expiryDate() is called now so the timestamp reflects the actual activation time.
      return buildResult({
        playlists,
        trialHours,
        expiryDate: expiryDate?.(),
        serviceName: TAG,
      });
    },
  };
};
