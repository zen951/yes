/**
 * Strevio — API-based 24-hour free trial.
 *
 * Site: https://strevio.net/free-trial/
 *
 * Flow:
 *   1. GET /free-trial/ to harvest session cookies and the anti-spam nonce.
 *   2. POST to /wp-admin/admin-ajax.php (action: 'iptv_free_test').
 *   3. Poll the inbox for the confirmation email containing M3U links.
 *
 * Trial duration: 24 hours.
 */
import { generatePhone, buildResult } from "../../parsing/generators.js";
import { createJar, get, post } from "../../http/cookieClient.js";

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = "https://strevio.net";
const TRIAL_URL = `${BASE_URL}/free-trial/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const TAG = "Strevio";
const FILTER_TEXT = ["Strevio", "support@strevio.net"];
const TRIAL_HOURS = 24;

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "strevio",
    name: TAG,
    description: `${TRIAL_HOURS} Hours`,
    group: "best",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds,
    log = () => {},
  }) {
    // Strevio anti-bot protection requires the hc_js_gate session cookie
    const jar = createJar();
    jar.hc_js_gate = "1";

    // Step 1: Harvest nonce from the trial page
    log(`[${TAG}] 🔐 Fetching trial page and extracting security nonce...`);
    const { text: html } = await get(TRIAL_URL, jar);
    const nonce = /nonce['"],\s*['"]([a-f0-9]+)['"]/i.exec(html)?.[1];
    if (!nonce) throw new Error(`[${TAG}] Failed to extract trial nonce.`);

    // Step 2: Submit the trial request via AJAX endpoint
    log(`[${TAG}] 📝 Submitting free-trial request via API...`);
    const { text } = await post(
      AJAX_URL,
      jar,
      {
        action: "iptv_free_test",
        nonce,
        email: email.trim(),
        whatsapp: `+44${generatePhone()}`,
        device: "M3U",
        country: "UK",
        adult: "without",
        _t: String(Math.floor(Date.now() / 1000) - 5),
      },
      TRIAL_URL,
    );

    let res;
    try {
      res = JSON.parse(text);
    } catch {
      throw new Error(`[${TAG}] Unexpected response: ${text.slice(0, 80)}`);
    }

    if (!res.success)
      throw new Error(`[${TAG}] ${res.data ?? "Trial request rejected."}`);

    // Step 3: Poll inbox for confirmation email with M3U links
    log(`[${TAG}] 📬 Waiting for confirmation email with trial credentials...`);
    const playlists = await provider.waitForEmailAndExtractPlaylists(
      credentialStore,
      { filterText: FILTER_TEXT, seenIds: inboxSeenIds, timeout: 120_000 },
    );

    if (!playlists.allM3uLinks.length)
      log(`[${TAG}] ⚠️ No M3U links found in confirmation email.`, "warn");
    else
      log(
        `[${TAG}] ✅ M3U extracted — TV: ${playlists.tvPlaylist ?? "none"}, total: ${playlists.allM3uLinks.length}`,
      );

    return buildResult({
      playlists,
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
