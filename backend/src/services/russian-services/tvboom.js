/**
 * TVBoom (tvboom.vip) — free 24-hour IPTV trial.
 *
 * Flow:
 *   1. Emit event → user fills iframe + clicks Done.
 *   2. Poll inbox → extract DLE validation link → follow verification link.
 *   3. GET /main → GET /index.php?do=test (activate trial) → GET /main.
 *   4. Parse M3U URL from the page → return result.
 */
import {
  generateUsername,
  generatePassword,
  buildResult,
} from "../../parsing/generators.js";
import { extractPlaylists } from "../../parsing/extractors.js";
import { createJar, get } from "../../http/cookieClient.js";
import { emit } from "../../engine/events.js";
import { setPendingManualDone } from "../../engine/taskStore.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE = "https://tvboom.vip";
const TAG = "TVBoom";
const TRIAL_HOURS = 24;

// ── Helpers ───────────────────────────────────────────────────────────────────

// GETs the validation link then scrapes and follows the DLE verification link.
async function confirmEmail(jar, link, log) {
  const { text } = await get(link, jar);
  const m = /href=["']([^"']*do=register[^"']*step=2[^"']*)/i.exec(text);
  if (!m) {
    log(
      `[${TAG}] ⚠️ Verification link not found — may already be confirmed.`,
      "warn",
    );
    return;
  }
  const confirmUrl = m[1].startsWith("http")
    ? m[1]
    : new URL(m[1].replace(/&amp;/gi, "&"), BASE).href;
  log(`[${TAG}] 🔐 Verifying email: ${confirmUrl}`);
  await get(confirmUrl, jar);
}

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "tvboom",
    name: "TVBoom",
    description: `${TRIAL_HOURS} Hours`,
    group: "russian",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds = new Set(),
    taskId,
    emitter,
    log = () => {},
  }) {
    const username = generateUsername();
    const password = generatePassword();
    const jar = createJar();

    // Step 1: Pause until the user completes the embedded iframe registration.
    emit(emitter, "tvboom_register", { taskId, username, password, email });
    await new Promise((res, rej) => setPendingManualDone(taskId, res, rej));
    log(
      `[${TAG}] ✅ Registration confirmed ➜ 📩 Polling inbox for verification email…`,
    );
    const link = await provider.waitForEmailAndExtractLink(credentialStore, {
      filterText: ["tvboom", "noreply@tvboom.vip"],
      pattern: /tvboom\.vip.*doaction=validating/i,
      seenIds: new Set(inboxSeenIds),
      timeout: 120_000,
    });
    if (!link) throw new Error(`[${TAG}] Verification email not received.`);
    await confirmEmail(jar, link, log);

    // Step 3: Enter the dashboard and activate the 24-hour trial.
    await get(`${BASE}/main`, jar);
    await get(`${BASE}/index.php?do=test`, jar, { referer: `${BASE}/main` });
    log(`[${TAG}] 🎁 Activating trial...`);

    // Step 4: Fetch /main and extract the M3U URL.
    const { text } = await get(`${BASE}/main`, jar);
    const tvPlaylist =
      extractPlaylists(text)?.tvPlaylist?.replace(/%type/gi, "hls") ?? null;

    if (tvPlaylist) log(`[${TAG}] 📺 ${tvPlaylist}`);
    return buildResult({
      username,
      password,
      tvPlaylist,
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
