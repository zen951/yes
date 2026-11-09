/**
 * IPTVLoad — WPForms + OTP + status-poll free trial.
 *
 * Site: https://iptvload.org/free-iptv-trial-24-hours/
 *
 * Flow:
 *   1. GET  /free-iptv-trial-24-hours/  → session cookies + WPForms tokens
 *   2. POST /wp-json/ivl/v1/send        → triggers 6-digit OTP email
 *   3. Poll inbox for OTP
 *   4. POST /wp-json/ivl/v1/verify      → returns ivl_token
 *   5. POST /wp-admin/admin-ajax.php    → WPForms submission with ivl_token
 *   6. Poll /wp-json/iptvload/v1/trial-status until state === "ready"
 *   7. Extract M3U from details.playlist
 *
 * Retries with a fresh email when the address has already been used.
 */

import { buildResult } from "../../parsing/generators.js";
import { createJar, get, post, jsonPost } from "../../http/cookieClient.js";
import { extractInputValue } from "../../parsing/extractors.js";
import { retryWithFreshEmail } from "../../email/base.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "IPTVLoad";
const BASE_URL = "https://iptvload.org";
const TRIAL_PAGE = `${BASE_URL}/free-iptv-trial-24-hours/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const SEND_URL = `${BASE_URL}/wp-json/ivl/v1/send`;
const VERIFY_URL = `${BASE_URL}/wp-json/ivl/v1/verify`;
const STATUS_URL = `${BASE_URL}/wp-json/iptvload/v1/trial-status`;
const FILTER_TEXT = ["IPTVLOAD", "iptvload"];
const TRIAL_HOURS = 24;
const POLL_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;
const EMAIL_TAKEN_KEYWORDS = [
  "already used",
  "already requested",
  "already been used",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brief = (obj) => obj?.message ?? JSON.stringify(obj).slice(0, 200);

// Builds the WPForms submission body from per-attempt dynamic values.
const buildFormBody = (name, email, timeToken, formToken, ivlToken) => ({
  "wpforms[fields][1]": name,
  "wpforms[fields][2]": email,
  "wpforms[fields][3]": "",
  "wpforms[fields][4]": "",
  "wpforms[fields][5]": "Other",
  "wpforms[fields][8]": "",
  "wpforms[fields][9]": "Iptv Smarters Pro",
  "wpforms[fields][10]": "",
  "wpforms[fields][23]": "",
  "wpforms[fields][36]": "United States",
  "wpforms[id]": "1019",
  "wpforms[post_id]": "1321",
  "wpforms[time_token]": timeToken ?? "",
  "wpforms[token]": formToken,
  "wpforms[submit]": "wpforms-submit",
  page_title: "Free IPTV Trial",
  page_url: TRIAL_PAGE,
  url_referer: "",
  page_id: "1321",
  ivl_token: ivlToken,
  action: "wpforms_submit",
});

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "iptvload",
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
    return retryWithFreshEmail(
      async (email) => {
        const jar = createJar();
        const submitEmail = email.trim();
        const name =
          submitEmail
            .split("@")[0]
            .replace(/[^a-zA-Z]/g, "")
            .slice(0, 15) || "user";

        // Step 1: Load trial page → session cookies + WPForms tokens.
        log(`[${TAG}] 🔐 Loading trial page...`);
        const { text: html, status: pageStatus } = await get(TRIAL_PAGE, jar, {
          referer: `${BASE_URL}/`,
        });
        if (pageStatus >= 400)
          throw new Error(
            `[${TAG}] Failed to load trial page — HTTP ${pageStatus}`,
          );

        const timeToken = extractInputValue(html, "wpforms[time_token]");
        const formToken = html.match(/data-token="([^"]+)"/i)?.[1];
        if (!formToken)
          throw new Error(`[${TAG}] Could not extract WPForms form token.`);

        // Step 2: Request OTP email.
        const sendRes = await jsonPost(
          SEND_URL,
          null,
          { email: submitEmail },
          { referer: TRIAL_PAGE, origin: BASE_URL, throwOnError: false },
        );

        let ivlToken;
        if (sendRes?.bypass && sendRes.token) {
          // Bypass: token returned directly without OTP.
          log(`[${TAG}] ⚡ Email bypassed — token received directly.`);
          ivlToken = sendRes.token;
        } else if (sendRes?.ok) {
          log(
            `[${TAG}] 📡 Send verification code response: ${JSON.stringify(sendRes)}`,
          );

          // Step 3: Wait for OTP.
          log(`[${TAG}] 📬 Waiting for verification code email...`);
          const otp = await provider.waitForVerificationCodeEmail(
            credentialStore,
            {
              filterText: FILTER_TEXT,
              seenIds: inboxSeenIds,
              codeRe: /Your verification code is:\s*[\r\n\s]*(\d{6})/i,
              timeout: 120_000,
            },
          );
          if (!otp)
            throw new Error(
              `[${TAG}] Verification code email did not arrive in time.`,
            );
          log(`[${TAG}] 🔑 OTP received: ${otp}`);

          // Step 4: Verify OTP → ivl_token.
          const verifyRes = await jsonPost(
            VERIFY_URL,
            null,
            { email: submitEmail, code: otp },
            { referer: TRIAL_PAGE, origin: BASE_URL, throwOnError: false },
          );
          if (!verifyRes?.ok || !verifyRes.token)
            throw new Error(
              `[${TAG}] Code verification failed: ${brief(verifyRes)}`,
            );
          ivlToken = verifyRes.token;
          log(
            `[${TAG}] ✅ Email verified successfully | 📡 Verify response: ${JSON.stringify(verifyRes)}`,
          );
        } else {
          throw new Error(
            `[${TAG}] Failed to request verification code: ${brief(sendRes)}`,
          );
        }

        // Step 5: Submit WPForms (2s anti-spam delay).
        await sleep(2_000);
        const { text: res, status: formStatus } = await post(
          AJAX_URL,
          jar,
          buildFormBody(name, submitEmail, timeToken, formToken, ivlToken),
          TRIAL_PAGE,
        );
        if (formStatus >= 400)
          throw new Error(
            `[${TAG}] Form submission failed — HTTP ${formStatus}.`,
          );
        log(
          `[${TAG}] ✅ Form submitted successfully | 📡 response: ${res.slice(0, 500)}`,
        );

        const formData = JSON.parse(res || "{}");
        if (formData.success === false) {
          const fieldMsg = Object.values(formData.data?.errors?.field ?? {})
            .join(" ")
            .trim();
          const msg =
            fieldMsg || JSON.stringify(formData.data ?? formData).slice(0, 200);
          if (msg.toLowerCase().includes("already"))
            throw new Error(`[${TAG}] Form rejected: email already used`);
          throw new Error(`[${TAG}] Form rejected: ${msg}`);
        }
        log(
          `[${TAG}] ⏳ Waiting for credentials generation... up to ${POLL_TIMEOUT_MS / 1000}s`,
        );

        // Step 6: Poll until provisioned.
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let attempt = 0;
        let statusResponse;
        while (Date.now() < deadline) {
          attempt++;
          const { text } = await get(`${STATUS_URL}?_=${Date.now()}`, jar, {
            referer: TRIAL_PAGE,
          });
          const json = JSON.parse(text || "{}");
          if (json?.state === "ready") {
            statusResponse = json;
            break;
          }
          log(
            `[${TAG}] 🔄 poll → (Status: ${json?.state ?? "unknown"}) (attempt ${attempt})`,
          );
          await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
        }
        if (!statusResponse)
          throw new Error(
            `[${TAG}] Timed out waiting for trial to become ready.`,
          );
        log(`[${TAG}] 🔄 Poll → ${JSON.stringify(statusResponse, null, 2)}`);
        log(`[${TAG}] ✅ Credentials generated after ${attempt} poll(s).`);

        // Step 7: Extract playlist.
        const details = statusResponse?.details;
        const playlist = details?.playlist ?? null;
        if (!playlist)
          throw new Error(
            `[${TAG}] Trial ready but no playlist returned: ${JSON.stringify(statusResponse).slice(0, 200)}`,
          );
        log(`[${TAG}] 📺 ${playlist}`);

        return buildResult({
          username: details.username ?? null,
          password: details.password ?? null,
          tvPlaylist: playlist,
          allM3uLinks: [playlist],
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
        shouldRetry: (err) => {
          const msg = err.message.toLowerCase();
          return EMAIL_TAKEN_KEYWORDS.some((k) => msg.includes(k));
        },
      },
    );
  },
};
