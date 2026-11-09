/**
 * IPTV Experten — free trial claim.
 *
 * Flow:
 *   1. GET  /sanctum/csrf-cookie  → sets XSRF-TOKEN cookie (Laravel Sanctum)
 *   2. POST /trial                → submit form with X-XSRF-TOKEN header + session cookie
 *   3. Poll inbox                 → wait for confirmation email with M3U links
 */
import {
  generateUsername,
  buildResult,
  nextDayAt,
} from "../../parsing/generators.js";
import { createJar, get, jsonPost } from "../../http/cookieClient.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://iptvexperten.com";
const CSRF_URL = `${BASE_URL}/sanctum/csrf-cookie`;
const TRIAL_URL = `${BASE_URL}/trial`;
const TAG = "IPTV Experten";
const FILTER_TEXT = ["iptvexperten", "experten", "info@iptvexperten.com"];

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "iptvexperten",
    name: TAG,
    description: "ALL [Once Each 24 Hours]",
    group: "trex",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds = new Set(),
    log = () => {},
  }) {
    const jar = createJar();

    log(`[${TAG}] 🔐 Submitting free trial request for ${email}...`);

    // Step 1: Fetch /sanctum/csrf-cookie — Laravel Sanctum sets the XSRF-TOKEN cookie.
    await get(CSRF_URL, jar);

    // The XSRF-TOKEN cookie value is URL-encoded; decode it before using it as a header.
    const xsrfToken = decodeURIComponent(jar["XSRF-TOKEN"] ?? "");
    if (!xsrfToken)
      throw new Error("XSRF-TOKEN cookie not set by /sanctum/csrf-cookie.");
    log(`[${TAG}] 🎫 CSRF token acquired via Sanctum.`);

    // Step 2: Submit the trial request as JSON with the XSRF token in the header.
    log(`[${TAG}] 📝 Submitting trial form...`);
    const parsed = await jsonPost(
      TRIAL_URL,
      jar,
      {
        name: generateUsername(),
        email: email.trim(),
        device_type: "m3u",
        bouquet_id: "5", // check 6
      },
      {
        referer: TRIAL_URL,
        origin: BASE_URL,
        extraHeaders: { "X-XSRF-TOKEN": xsrfToken },
      },
    );
    log(`[${TAG}] 📡 Trial API response — success: ${parsed.success ?? true}`);

    if (parsed.success === false)
      throw new Error(parsed.message ?? "Trial submission failed.");

    // Step 3: Poll inbox for confirmation email with M3U links.
    const playlists = await provider.waitForEmailAndExtractPlaylists(
      credentialStore,
      {
        filterText: FILTER_TEXT,
        seenIds: new Set(inboxSeenIds),
        timeout: 120_000,
      },
    );

    if (!playlists.allM3uLinks.length)
      log(`[${TAG}] No M3U links found in confirmation email.`, "warn");
    else
      log(
        `[${TAG}] ✅ M3U extracted — TV: ${playlists.tvPlaylist ?? "none"}, total: ${playlists.allM3uLinks.length}`,
      );

    return buildResult({
      playlists: { ...playlists, vodPlaylist: null },
      expiryDate: nextDayAt(1),
      serviceName: TAG,
    });
  },
};
