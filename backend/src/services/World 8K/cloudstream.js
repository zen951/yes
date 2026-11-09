/**
 * CloudStream — free 24-hour IPTV trial.
 *
 * Site: https://cloudstream.us/trial/
 *
 * Flow:
 *   1. GET  /trial/                      → session cookies + inline nonce
 *   2. GET  /wp-admin/admin-ajax.php
 *            ?action=cstrial_nonce       → fresh nonce (JSON)
 *   3. POST /wp-admin/admin-ajax.php
 *            action=cstrial_create       → { task_id, account_id }
 *   4. GET  /wp-admin/admin-ajax.php
 *            ?action=cstrial_status
 *            &task_id=…&account_id=…     → poll until status "ready"
 *   5. Poll inbox                        → credentials email with M3U link
 *
 * Source: https://cloudstream.us/wp-content/litespeed/js/44bdd2c38a73e2eaf7e55189e9d00987.js
 */

import { buildResult, generatePhone } from "../../parsing/generators.js";
import { createJar, get, multipartPost } from "../../http/cookieClient.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "CloudStream";
const BASE = "https://cloudstream.us";
const TRIAL_PAGE = `${BASE}/trial/`;
const AJAX_URL = `${BASE}/wp-admin/admin-ajax.php`;
const FILTER = ["cloudstream.us", "cloudstream", "noreply@cloudstream.us"];
const TRIAL_HOURS = 24;
const POLL_INTERVAL = 2_000;
const POLL_TIMEOUT = 120_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Extracts the inline nonce baked into the trial page JS.
const extractNonce = (html) =>
  /var nonce='([a-f0-9]+)'/.exec(html)?.[1] ?? null;

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "cloudstream",
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
    const jar = createJar();

    // Step 1: Load trial page — establish session cookies + grab inline nonce.
    log(`[${TAG}] 🔐 Fetching trial page...`);
    const { text: pageHtml } = await get(TRIAL_PAGE, jar);
    let nonce = extractNonce(pageHtml);

    // Step 2: Refresh the nonce via the dedicated AJAX action (matches browser behaviour).
    log(`[${TAG}] 🔐 Refreshing nonce...`);
    const { text: nonceText } = await get(
      `${AJAX_URL}?action=cstrial_nonce`,
      jar,
      { referer: TRIAL_PAGE, extraHeaders: { Accept: "application/json" } },
    );
    try {
      const j = JSON.parse(nonceText);
      if (j?.success && j?.data?.nonce) nonce = j.data.nonce;
    } catch {
      /* keep inline nonce */
    }

    if (!nonce) throw new Error(`[${TAG}] Failed to extract nonce.`);
    log(`[${TAG}] ✅ Nonce ready.`);

    // Step 3: Submit the trial creation request.
    log(`[${TAG}] 📝 Submitting trial for ${email}...`);
    const { text: createText } = await multipartPost(
      AJAX_URL,
      jar,
      {
        action: "cstrial_create",
        _nonce: nonce,
        email: email.trim(),
        name: "",
        phone: `+1 ${generatePhone()}`,
        bouquet: "all",
        ref_code: "",
        website_url: "", // honeypot — must be empty
      },
      TRIAL_PAGE,
    );

    let createRes;
    try {
      createRes = JSON.parse(createText);
    } catch {
      throw new Error(
        `[${TAG}] Unexpected response: ${createText.slice(0, 80)}`,
      );
    }

    if (!createRes?.success) {
      const msg =
        createRes?.data?.message ??
        createRes?.data ??
        "Trial request rejected.";
      throw new Error(`[${TAG}] ${msg}`);
    }

    const { task_id: taskId, account_id: accountId } = createRes.data ?? {};
    if (!taskId) throw new Error(`[${TAG}] No task_id in response.`);
    log(`[${TAG}] ✅ Trial queued — task: ${taskId}`);

    // Step 4: Poll provisioning status until "ready" / "active" or timeout.
    log(
      `[${TAG}] ⏳ Waiting for credentials generation... up to ${POLL_TIMEOUT / 1000}s`,
    );
    const statusUrl = `${AJAX_URL}?action=cstrial_status&task_id=${encodeURIComponent(taskId)}&account_id=${encodeURIComponent(accountId)}`;
    const deadline = Date.now() + POLL_TIMEOUT;
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt++;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const { text } = await get(statusUrl, jar, { referer: TRIAL_PAGE });

      let data;
      try {
        data = JSON.parse(text)?.data ?? {};
      } catch {
        data = {};
      }

      const s = data.status;
      log(
        `[${TAG}] 🔄 poll → (Status: → ${s ?? "pending"}) (attempt ${attempt})`,
      );

      if (s === "ready" || s === "active") {
        log(`[${TAG}] ✅ Credentials generated after ${attempt} poll(s).`);
        break;
      }
      if (s === "failed" || s === "error")
        throw new Error(`[${TAG}] Trial creation failed: ${data.message ?? s}`);
      if (Date.now() >= deadline)
        throw new Error(`[${TAG}] Timed out waiting for trial provisioning.`);
    }

    // Step 5: Poll inbox for the credentials email.
    log(`[${TAG}] 📬 Waiting for credentials email...`);
    const playlists = await provider.waitForEmailAndExtractPlaylists(
      credentialStore,
      { filterText: FILTER, seenIds: new Set(inboxSeenIds), timeout: 120_000 },
    );

    if (!playlists.allM3uLinks.length)
      log(`[${TAG}] ⚠️ No M3U links found.`, "warn");
    else
      log(`[${TAG}] ✅ 📺 ${playlists.tvPlaylist ?? playlists.allM3uLinks[0]}`);

    return buildResult({
      playlists,
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
