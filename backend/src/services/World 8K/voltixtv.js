/**
 * VoltixTV — free 24-hour IPTV trial.
 *
 * Site: https://voltixtv.com/trial/
 *
 * Flow:
 *   1. GET  /api/trial  → { open, ticket, bits }
 *   2. Solve PoW: find n where zeroBits(sha256(ticket + ":" + n)) >= bits
 *   3. POST /api/trial  → { email, adult, website, ticket, nonce, utm, bc }
 *   4. Poll inbox for confirmation email with M3U link
 *
 * Source: https://voltixtv.com/assets/trial.js?v=5
 */

import { randomBytes, createHash } from "crypto";
import { buildResult } from "../../parsing/generators.js";
import { get, jsonPost } from "../../http/cookieClient.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "VoltixTV";
const BASE = "https://voltixtv.com";
const TRIAL_URL = `${BASE}/api/trial`;
const FILTER = ["KANWA IPTV", "login@kanwatv.cc"];
const TRIAL_HOURS = 24;
const MIN_WAIT = 3_200; // ms — server enforces minWait between ticket issue and POST
const EMAIL_TIMEOUT = 120_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Counts leading zero bits in a byte array (matches trial.js zeroBits).
function zeroBits(d) {
  let n = 0;
  for (const byte of d) {
    if (byte === 0) {
      n += 8;
      continue;
    }
    for (let b = 7; b >= 0; b--) {
      if (byte & (1 << b)) return n;
      n++;
    }
  }
  return n;
}

// Finds smallest n such that sha256(ticket + ":" + n) has >= bits leading zero bits.
function solvePoW(ticket, bits) {
  const prefix = Buffer.from(`${ticket}:`, "ascii");
  for (let n = 0; ; n++) {
    const digest = createHash("sha256")
      .update(prefix)
      .update(String(n))
      .digest();
    if (zeroBits(digest) >= bits) return String(n);
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "voltixtv",
    name: TAG,
    description: `${TRIAL_HOURS} Hours`,
    group: "World 8K",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds = new Set(),
    log = () => {},
  }) {
    // Step 1: Fetch a server-signed ticket.
    log(`[${TAG}] 🎟️ Fetching trial ticket...`);
    const { text } = await get(TRIAL_URL, null, {
      extraHeaders: { Accept: "application/json" },
    });
    const { open, ticket = "", bits = 16, message } = JSON.parse(text);
    if (!open)
      throw new Error(`[${TAG}] Trials not open: ${message ?? "no slots"}`);
    const issued = Date.now();

    // Step 2: Solve the Proof-of-Work challenge.
    log(`[${TAG}] ⚙️  Solving PoW (bits=${bits})...`);
    const nonce = solvePoW(ticket, bits);
    log(`[${TAG}] ✅ PoW solved — nonce: ${nonce}`);

    // Step 3: Respect server minWait, then submit the trial.
    const wait = MIN_WAIT - (Date.now() - issued);
    if (wait > 0) await sleep(wait);

    log(`[${TAG}] 📝 Submitting trial for ${email}...`);
    const res = await jsonPost(
      TRIAL_URL,
      null,
      {
        email: email.trim(),
        adult: false,
        website: "",
        ticket,
        nonce,
        utm: "",
        bc: randomBytes(16).toString("hex"),
      },
      { referer: `${BASE}/trial/`, origin: BASE, throwOnError: false },
    );
    log(`[${TAG}] 📡 Response: ${JSON.stringify(res)}`);
    if (res?.error) throw new Error(`[${TAG}] ${res.error}`);

    // Step 4: Poll inbox for M3U credentials.
    log(`[${TAG}] 📬 Waiting for credentials email...`);
    const playlists = await provider.waitForEmailAndExtractPlaylists(
      credentialStore,
      {
        filterText: FILTER,
        seenIds: new Set(inboxSeenIds),
        timeout: EMAIL_TIMEOUT,
      },
    );

    if (!playlists.allM3uLinks.length)
      log(`[${TAG}] ⚠️ No M3U links found.`, "warn");
    else
      log(`[${TAG}] ✅ 📺 ${playlists.tvPlaylist ?? playlists.allM3uLinks[0]}`);

    return buildResult({
      playlists: { ...playlists, vodPlaylist: null },
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
