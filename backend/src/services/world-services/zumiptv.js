/**
 * ZumIPTV (zumiptv.net) — free trial via form POST.
 *
 * Flow:
 *   1. POST https://trial.zumiptv.net/generate.php — submit trial request.
 *   2. Poll inbox — parse Host / Username / Password from credentials email.
 *   3. Build Xtream-Codes M3U URL from extracted credentials.
 */

import { buildResult, buildM3u } from "../../parsing/generators.js";
import { post } from "../../http/cookieClient.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "ZumIPTV";
const TRIAL_URL = "https://trial.zumiptv.net/generate.php";
const ORIGIN = "https://zumiptv.net";
const FILTER_TEXT = ["Zum IPTV", "zumiptv", "zumhd"];
const TRIAL_HOURS = 24;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Duck-typed codeRe — parses Host / Username / Password from the credentials email.
const credExtractor = {
  exec: (text) => {
    const p = text.replace(/<[^>]*>/g, " ");
    const host = /Host[:\s]+(https?:\/\/\S+)/i.exec(p)?.[1];
    const username = /Username[:\s]+(\S+)/i.exec(p)?.[1];
    const password = /Password[:\s]+(\S+)/i.exec(p)?.[1];
    return host && username && password
      ? [null, { host, username, password }]
      : null;
  },
};

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "zumiptv",
    name: TAG,
    description: `${TRIAL_HOURS} Hours`,
    group: "best",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds = new Set(),
    log = () => {},
  }) {
    // Step 1: Submit the trial request
    log(`[${TAG}] 📝 Submitting free trial request...`);
    const { text } = await post(
      TRIAL_URL,
      null,
      { action: "submit_trial", email: email.trim(), page_origin: ORIGIN },
      ORIGIN,
    );
    log(`[${TAG}] 📡 Response: ${text}`);

    try {
      if (JSON.parse(text).success === false)
        return buildResult({
          status: "failed",
          note: "Trial generation failed.",
        });
    } catch {}

    // Step 2: Poll inbox — email contains plain-text Host / Username / Password
    log(`[${TAG}] 📬 Waiting for credentials email...`);
    const creds = await provider.waitForVerificationCodeEmail(credentialStore, {
      filterText: FILTER_TEXT,
      seenIds: new Set(inboxSeenIds),
      codeRe: credExtractor,
      timeout: 120_000,
    });
    if (!creds) {
      log(`[${TAG}] ⚠️ No credentials found in email.`, "warn");
      return buildResult({ trialHours: TRIAL_HOURS, serviceName: TAG });
    }

    // Step 3: Build M3U URL from extracted credentials
    const { host, username, password } = creds;
    const tvPlaylist = buildM3u(host, username, password);
    log(`[${TAG}] 📺 ${tvPlaylist}`);

    return buildResult({
      username,
      password,
      tvPlaylist,
      allM3uLinks: [tvPlaylist],
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
