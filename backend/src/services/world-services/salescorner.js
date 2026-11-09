/**
 * SalesCorner — free 24-hour IPTV trial.
 *
 * Site: https://salescorner.top
 *
 * Flow:
 *   1. POST /pay/api/request-trial  → { ok, account: { xtream_host, xtream_user, xtream_pass, m3u, … } }
 *   2. Build M3U+ URL from Xtream credentials (type=m3u_plus&output=ts)
 */
import { buildResult, buildM3u } from "../../parsing/generators.js";
import { jsonPost } from "../../http/cookieClient.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "SalesCorner";
const BASE_URL = "https://salescorner.top";
const TRIAL_URL = `${BASE_URL}/pay/api/request-trial`;
const TRIAL_HOURS = 24;

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "salescorner",
    name: TAG,
    description: `${TRIAL_HOURS} Hours`,
    group: "other",
  },

  async execute({ email, log = () => {} }) {
    // Step 1: Request trial — credentials are returned immediately, no email poll needed.
    log(`[${TAG}] 📝 Requesting trial for ${email}...`);
    const res = await jsonPost(
      TRIAL_URL,
      null,
      {
        channel: "email",
        contact: email.trim(),
        phone: email.trim(),
        email: email.trim(),
        telegram: email.trim(),
        device: "Samsung / LG Smart TV (M3U & Xtream API)",
        mode: "app_code",
        lang: "es",
      },
      { referer: BASE_URL, origin: BASE_URL, throwOnError: false },
    );
    log(`[${TAG}] 📡 Response: ${JSON.stringify(res)}`);

    // Step 2: Extract credentials; API nests them under account.
    const account = res?.account ?? res;
    const m3u =
      buildM3u(
        account?.xtream_host,
        account?.xtream_user,
        account?.xtream_pass,
      ) ??
      account?.m3u ??
      null;
    if (!m3u)
      throw new Error(
        `[${TAG}] No M3U link in response: ${JSON.stringify(res).slice(0, 200)}`,
      );
    log(`[${TAG}] 📺 ${m3u}`);

    return buildResult({
      username: account.xtream_user ?? null,
      password: account.xtream_pass ?? null,
      tvPlaylist: m3u,
      allM3uLinks: [m3u],
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
