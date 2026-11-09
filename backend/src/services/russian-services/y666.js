/**
 * Y666 (my.y666.tv) — free IPTV trial via email-verified registration.
 *
 * Flow:
 *   1. POST /api/auth/register  → submit username + email + password
 *   2. Poll inbox               → wait for verification email link
 *   3. GET  /api/email/verify   → confirm email via token from the link
 *   4. Build M3U playlist URLs from username + password
 *
 * Retries with a fresh email when the address is already registered (userExists).
 */
import {
  buildResult,
  generatePassword,
  generateUsername,
} from "../../parsing/generators.js";
import { makeApi } from "../../http/apiClient.js";
import { retryWithFreshEmail } from "../../email/base.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://my.y666.tv";
const TAG = "Y666";
const TRIAL_HOURS = 72;
const PLAYLIST_BASE = "http://pl.y6tv.me";
const FILTER_TEXT = ["Y6TV ", "noreply@y6tv.tv", "Y666", "my.y666.tv"];
const EMAIL_TAKEN = ["userExists"];

const api = makeApi(`${BASE_URL}/api`, {
  extraHeaders: { Origin: BASE_URL, Referer: `${BASE_URL}/` },
  errorDetail: (j) => j?.error ?? j?.message,
});

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "y666",
    name: "Y666",
    description: `${TRIAL_HOURS / 24} Days`,
    group: "russian",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds = new Set(),
    log = () => {},
  }) {
    return retryWithFreshEmail(
      async (email) => {
        const username = generateUsername();
        const password = generatePassword();

        // Step 1: Register a new account with the disposable email.
        log(`[${TAG}] 📝 Registering account ...`);
        await api("/auth/register", {
          method: "POST",
          body: { username, email, password, language: "en" },
        });

        // Step 2: Poll inbox for the verification email and extract the link.
        log(
          `[${TAG}] ✅ Registration confirmed ➜ 📩 Polling inbox for verification email…`,
        );
        const link = await provider.waitForEmailAndExtractLink(
          credentialStore,
          {
            filterText: FILTER_TEXT,
            pattern: /my\.y666\.tv\/verify-email\?token=/i,
            seenIds: new Set(inboxSeenIds),
            timeout: 120_000,
          },
        );
        if (!link) throw new Error(`[${TAG}] Verification email not received.`);

        // Step 3: Extract the token and confirm the email address.
        const token = new URL(link).searchParams.get("token");
        if (!token)
          throw new Error(
            `[${TAG}] Could not extract token from verification link.`,
          );
        log(`[${TAG}] 🔐 Verifying email: ${link}`);
        const res = await api(
          `/email/verify?token=${encodeURIComponent(token)}`,
        );
        if (res?.success === false)
          throw new Error(`[${TAG}] Email verification was rejected.`);

        // Step 4: Build and return the M3U playlist URLs.
        const base = `${PLAYLIST_BASE}/${username}/${password}`;
        const tvPlaylist = `${base}/tv.m3u`;
        const vodPlaylist = `${base}/vod.m3u`;
        const seriesPlaylist = `${base}/series.m3u`;
        log(`[${TAG}] 📺 TV: ${tvPlaylist}`);
        log(`[${TAG}] 🍿 VOD: ${vodPlaylist}`);
        log(`[${TAG}] 🎬 Series: ${seriesPlaylist}`);

        return buildResult({
          username,
          password,
          tvPlaylist,
          vodPlaylist: `${vodPlaylist}\n${seriesPlaylist}`,
          trialHours: TRIAL_HOURS,
          serviceName: TAG,
        });
      },
      {
        provider,
        credentialStore,
        email,
        inboxSeenIds,
        log,
        tag: TAG,
        shouldRetry: (err) => EMAIL_TAKEN.some((k) => err.message.includes(k)),
      },
    );
  },
};
