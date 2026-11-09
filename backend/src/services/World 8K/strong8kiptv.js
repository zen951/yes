/**
 * Strong8K IPTV — free 24-hour trial.
 *
 * Site: https://strong8kiptv.co
 *
 * Flow:
 *   1. POST /trial  → submit email + package (Sec-Fetch-* headers required)
 *   2. Poll result page → wait for M3U links to appear in the HTML
 */
import { buildResult } from "../../parsing/generators.js";
import { extractPlaylists, stripHtml } from "../../parsing/extractors.js";
import { createJar, post, get } from "../../http/cookieClient.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "Strong8K IPTV";
const TRIAL_URL = "https://strong8kiptv.co/trial";
const TRIAL_HOURS = 24;

const POLL_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;

const BROWSER_HEADERS = {
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-User": "?1",
  "Sec-Fetch-Dest": "document",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Polls the result page until M3U links appear or timeout elapses. */
async function pollForPlaylists(url, log) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    const { text: html } = await get(url, createJar(), {
      extraHeaders: BROWSER_HEADERS,
    });
    const playlists = extractPlaylists(html);
    if (playlists?.allM3uLinks?.length) {
      log(`[${TAG}] ✅ Credentials generated after ${attempt} poll(s).`);
      return playlists;
    }

    log(`[${TAG}] 🔄 poll → (Status: pending) (attempt ${attempt})`);

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) =>
      setTimeout(r, Math.min(POLL_INTERVAL_MS, remaining)),
    );
  }

  return null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "strong8kiptv",
    name: TAG,
    description: `${TRIAL_HOURS} Hours`,
    group: "World 8K",
  },

  async execute({ email, log = () => {} }) {
    log(`[${TAG}] 📝 Submitting trial request for ${email}...`);

    // Step 1: Submit the trial form.
    const { status, text, finalUrl } = await post(
      TRIAL_URL,
      createJar(),
      { format: "m3u", mac: "", package: "83106", email: email.trim() },
      TRIAL_URL,
      { extraHeaders: BROWSER_HEADERS },
    );

    log(`[${TAG}] ✅ Trial submitted! 🔗 Result link: ${finalUrl}`);

    if (status >= 400)
      throw new Error(
        `[${TAG}] Trial request rejected — ${stripHtml(text).slice(0, 120) || `HTTP ${status}`}`,
      );

    // Step 2: Poll result page for M3U links.
    log(
      `[${TAG}] ⏳ Waiting for credentials generation... up to ${POLL_TIMEOUT_MS / 1000}s`,
    );
    const playlists = await pollForPlaylists(finalUrl, log);

    if (playlists) {
      log(`[${TAG}] 🔗 Result link: ${finalUrl}`);
      log(
        `[${TAG}] 📺 ${playlists.tvPlaylist ?? "none"} | 🎬 Total links: ${playlists.allM3uLinks.length}`,
      );
    } else {
      log(`[${TAG}] ⚠️ No M3U links found after polling.`, "warn");
    }

    return buildResult({
      playlists: playlists ?? {},
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
