/**
 * WebestIPTV — WordPress OTP-based free trial.
 *
 * Site: https://webestiptv.com/portal/register/
 *
 * Flow:
 *   1. GET  /portal/register/                 → session cookies + _wpnonce
 *   2. POST /portal/register/                 → register; redirects to verify page
 *   3. GET  verify page                       → verify-step _wpnonce
 *   4. Poll inbox                             → 6-digit OTP
 *   5. POST /portal/register/?step=verify&…  → submit OTP
 *   6. GET  /portal/subscribe/                → trial-claim _wpnonce
 *   7. POST /portal/wp-admin/admin-post.php   → claim trial
 *   8. Poll inbox                             → confirmation email with M3U link
 */

import { generatePhone, buildResult } from "../../parsing/generators.js";
import { createJar, get, post } from "../../http/cookieClient.js";
import { extractInputValue } from "../../parsing/extractors.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "WebestIPTV";
const HOURS = 24;
const PASSWORD = "123456789ghd";
const FILTER = ["WEBESTIPTV", "webestiptv"];

const BASE = "https://webestiptv.com/portal";
const REG_URL = `${BASE}/register/`;
const SUB_URL = `${BASE}/subscribe/`;
const TRIAL_URL = `${BASE}/wp-admin/admin-post.php`;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Extracts _wpnonce from a hidden input or an inline JS object literal.
const getNonce = (html) =>
  extractInputValue(html, "_wpnonce") ??
  html.match(/["']_wpnonce["']\s*:\s*["']([a-f0-9]+)["']/i)?.[1] ??
  null;

// Extracts the verify-step redirect URL from a meta-refresh or inline JS assignment.
const getVerifyUrl = (html) =>
  html.match(
    /http-equiv=["']refresh["'][^>]*content=["'][^;]*;\s*url=([^"']+)/i,
  )?.[1] ??
  html.match(
    /window\.location(?:\.href)?\s*=\s*["']([^"']+step=verify[^"']+)["']/i,
  )?.[1] ??
  null;

// Derives a safe display name from the local part of an email address.
const nameFromEmail = (email) =>
  email
    .split("@")[0]
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 10) || "user";

// ── Steps ─────────────────────────────────────────────────────────────────────
// Each step receives the shared context object (ctx) so argument lists stay short.
// ctx = { jar, provider, credentialStore, email, inboxSeenIds, log }

async function register(ctx) {
  const { jar, email, log } = ctx;

  log(`[${TAG}] 🔐 Loading registration page...`);
  const { text: pageHtml } = await get(REG_URL, jar);
  const nonce = getNonce(pageHtml);
  if (!nonce) throw new Error(`[${TAG}] Failed to extract registration nonce.`);

  log(`[${TAG}] 📝 Submitting registration for ${email}...`);
  const name = nameFromEmail(email);
  const { text, finalUrl } = await post(
    REG_URL,
    jar,
    {
      _wpnonce: nonce,
      _wp_http_referer: new URL(REG_URL).pathname,
      webestiptv_auth_action: "register",
      ref: "",
      first_name: name,
      last_name: name,
      phone: generatePhone(),
      email: email.trim(),
      password: PASSWORD,
    },
    REG_URL,
  );

  const verifyUrl = finalUrl?.includes("step=verify")
    ? finalUrl
    : (getVerifyUrl(text) ?? finalUrl);
  if (!verifyUrl?.includes("step=verify"))
    throw new Error(`[${TAG}] Registration did not redirect to verify page.`);

  return verifyUrl;
}

async function getVerifyNonce(ctx, verifyUrl) {
  ctx.log(`[${TAG}] 🔐 Loading OTP verification page...`);
  const { text } = await get(verifyUrl, ctx.jar, { referer: REG_URL });
  const nonce = getNonce(text);
  if (!nonce) throw new Error(`[${TAG}] Failed to extract verify-step nonce.`);
  return nonce;
}

async function waitForOtp(ctx) {
  const { provider, credentialStore, inboxSeenIds, log } = ctx;
  log(`[${TAG}] 📬 Waiting for OTP email...`);
  const otp = await provider.waitForVerificationCodeEmail(credentialStore, {
    filterText: FILTER,
    seenIds: inboxSeenIds,
    codeRe: /\b(\d{6})\b/,
    timeout: 120_000,
  });
  if (!otp) throw new Error(`[${TAG}] OTP email did not arrive in time.`);
  log(`[${TAG}] 🔑 OTP received: ${otp}`);
  return otp;
}

async function submitOtp(ctx, verifyUrl, nonce, token, auth, otp) {
  ctx.log(`[${TAG}] ✅ Submitting OTP...`);
  const { status } = await post(
    verifyUrl,
    ctx.jar,
    {
      _wpnonce: nonce,
      _wp_http_referer: `/portal/register/?step=verify&token=${token}&auth=${auth}`,
      webestiptv_auth_action: "register_verify",
      token,
      otp_code: otp,
    },
    verifyUrl,
  );
  if (status >= 400)
    throw new Error(`[${TAG}] OTP verification failed (HTTP ${status}).`);
}

async function claimTrial(ctx) {
  const { jar, log } = ctx;
  log(`[${TAG}] 🎁 Claiming free trial...`);

  const { text } = await get(SUB_URL, jar, { referer: `${BASE}/dashboard/` });
  const nonce = getNonce(text);
  if (!nonce) throw new Error(`[${TAG}] Failed to extract trial claim nonce.`);

  const { status } = await post(
    TRIAL_URL,
    jar,
    {
      _wpnonce: nonce,
      _wp_http_referer: new URL(SUB_URL).pathname,
      action: "webestiptv_request_trial",
    },
    SUB_URL,
  );
  if (status >= 400)
    throw new Error(`[${TAG}] Trial claim failed (HTTP ${status}).`);
}

async function waitForConfirmation(ctx) {
  const { provider, credentialStore, inboxSeenIds, log } = ctx;
  log(`[${TAG}] 📬 Waiting for confirmation email...`);
  return provider.waitForEmailAndExtractPlaylists(credentialStore, {
    filterText: FILTER,
    seenIds: inboxSeenIds,
    timeout: 120_000,
  });
}

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "webestiptv",
    name: TAG,
    description: `${HOURS} Hours`,
    group: "best",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds = new Set(),
    log = () => {},
  }) {
    const ctx = {
      jar: createJar(),
      provider,
      credentialStore,
      email,
      inboxSeenIds,
      log,
    };

    const verifyUrl = await register(ctx);
    const { searchParams } = new URL(verifyUrl);
    const token = searchParams.get("token");
    const auth = searchParams.get("auth") ?? "otp_sent";
    if (!token)
      throw new Error(`[${TAG}] Verify token not found in redirect URL.`);

    const verifyNonce = await getVerifyNonce(ctx, verifyUrl);
    const otp = await waitForOtp(ctx);

    await submitOtp(ctx, verifyUrl, verifyNonce, token, auth, otp);
    await claimTrial(ctx);

    const playlists = await waitForConfirmation(ctx);
    const m3u = playlists.tvPlaylist ?? playlists.allM3uLinks[0];

    if (!playlists.allM3uLinks.length)
      log(`[${TAG}] ⚠️ No M3U links found in confirmation email.`, "warn");
    else {
      log(`[${TAG}] ✅ 🎁 Trial activated.`);
      log(`[${TAG}] 📺 ${m3u}`);
    }

    return buildResult({ playlists, trialHours: HOURS, serviceName: TAG });
  },
};
