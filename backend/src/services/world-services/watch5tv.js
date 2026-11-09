/**
 * Watch5 TV — Supabase-based free trial.
 *
 * Site: https://watch5tv.com
 *
 * Flow:
 *   1. POST /auth/v1/signup        → sends verification email
 *   2. Poll inbox → click verify link → confirm account
 *   3. POST /auth/v1/token         → sign in, get access token
 *   4. POST w5-provision-trial     → provision the trial
 *   5. GET  /rest/v1/subscriptions → build M3U from Xtream credentials
 *
 * Trial duration: 24 hours.
 */

import { buildM3u, buildResult } from "../../parsing/generators.js";
import { makeApi } from "../../http/apiClient.js";

// ── Config ────────────────────────────────────────────────────────────────────

// Service identity
const TAG = "Watch5 TV";
const TRIAL_HOURS = 24;

// Base URLs & Supabase anon key
const SUPABASE_URL = "https://rrhjvsmabnjvdymvgved.supabase.co";
const WATCH5_URL = "https://watch5tv.com";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaGp2c21hYm5qdmR5bXZndmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTUxODAsImV4cCI6MjA5NDk3MTE4MH0.zuTpCP09sgAFX4nxfL68kPe-WWlijPseRwsmp1ZkBPo";

// API paths
const SIGNUP_PATH = "/auth/v1/signup";
const SIGNIN_PATH = "/auth/v1/token?grant_type=password";
const SUBS_PATH = "/rest/v1/subscriptions";
const PROVISION_PATH = "/.netlify/functions/w5-provision-trial";
const SIGNUP_REDIRECT =
  "https%3A%2F%2Fwatch5tv.com%2Fwatch5%2Fauth%2Fcallback%3Fnext%3D%252Fwatch5%252Fdashboard";

// Email / inbox settings
const VERIFY_PATTERN =
  /supabase\.co\/auth\/v1\/verify|watch5tv\.com.*auth.*callback/i;
const FILTER_TEXT = ["WATCH5TV", "info@watch5tv.com"];
const VERIFY_TIMEOUT = 120_000;
const FETCH_TIMEOUT = 30_000;

// ── API clients ───────────────────────────────────────────────────────────────

const errDetail = (j) => j.message ?? j.error;

// Supabase auth/REST — apikey baked in; pass `token` per-call for Bearer auth.
const sbApi = makeApi(SUPABASE_URL, {
  errorDetail: errDetail,
  extraHeaders: { apikey: ANON_KEY },
});

// Provision endpoint lives on a different host, so a separate client.
const provisionApi = makeApi(WATCH5_URL, { errorDetail: errDetail });

// ── Helpers ───────────────────────────────────────────────────────────────────

// Decode HTML entities, unwrap redirect wrappers, inject type=signup if missing.
function normaliseVerifyLink(link) {
  let url = link.replace(/&amp;/gi, "&");
  try {
    const u = new URL(url);
    // If not already on supabase.co, unwrap any inner redirect parameter.
    if (!u.hostname.includes("supabase.co")) {
      const inner =
        u.searchParams.get("verification_url") ??
        u.searchParams.get("url") ??
        u.searchParams.get("redirect_to");
      if (inner) url = decodeURIComponent(inner);
    }
    // Inject type=signup if the final URL is missing it.
    const vu = new URL(url);
    if (!vu.searchParams.has("type")) {
      vu.searchParams.set("type", "signup");
      url = vu.toString();
    }
  } catch {
    // URL parse failed — use link as-is.
  }
  return url;
}

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "watch5tv",
    name: TAG,
    description: `${TRIAL_HOURS} Hours [Limited]`,
    group: "best",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds = new Set(),
    log = () => {},
  }) {
    const username = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
    const password = `W5_${username.slice(0, 8)}!2025`;

    // Step 1: Register — server sends a verification email.
    log(`[${TAG}] 📝 Registering account...`);
    const signup = await sbApi(
      `${SIGNUP_PATH}?redirect_to=${SIGNUP_REDIRECT}`,
      {
        method: "POST",
        body: {
          email,
          password,
          data: { full_name: username },
          gotrue_meta_security: {},
          code_challenge: null,
          code_challenge_method: null,
        },
      },
    );

    // Step 2: Poll inbox for the confirmation email, then follow the verify link.
    log(`[${TAG}] 📬 Waiting for verification email...`);
    const rawLink = await provider.waitForEmailAndExtractLink(credentialStore, {
      filterText: FILTER_TEXT,
      pattern: VERIFY_PATTERN,
      seenIds: new Set(inboxSeenIds),
      timeout: VERIFY_TIMEOUT,
    });
    if (!rawLink)
      throw new Error(`[${TAG}] Verification email did not arrive in time.`);

    // Normalise verify link before clicking.
    const verifyLink = normaliseVerifyLink(rawLink);
    log(`[${TAG}] 🔗 Clicking verification link: ${verifyLink}`);
    await fetch(verifyLink, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    // Step 3: Sign in with password to get the access token.
    log(`[${TAG}] 🔑 Signing in...`);
    const signin = await sbApi(SIGNIN_PATH, {
      method: "POST",
      body: { email, password },
    });
    const token = signin.access_token;
    const userId = signin.user?.id ?? signup.user?.id;

    // Step 4: Provision the 24-hour trial.
    log(`[${TAG}] 🎁 Activating trial...`);
    const provision = await provisionApi(PROVISION_PATH, {
      method: "POST",
      token,
      body: { template_id: null, is_adult: false, domain_id: null },
    });
    log(`[${TAG}] 📡 Provision response: ${JSON.stringify(provision)}`);

    // Step 5: Fetch subscription and build an Xtream Codes M3U URL.
    const subsQuery = userId
      ? `${SUBS_PATH}?select=*&user_id=eq.${userId}&order=created_at.desc&limit=10`
      : `${SUBS_PATH}?select=*&order=created_at.desc&limit=1`;
    const subs = await sbApi(subsQuery, { token });
    log(`[${TAG}] 📡 Subscription response: ${JSON.stringify(subs)}`);

    const sub = Array.isArray(subs) ? subs[0] : subs;
    const m3uUrl = buildM3u(
      sub?.iptv_server,
      sub?.iptv_username,
      sub?.iptv_password,
    );

    if (m3uUrl) log(`[${TAG}] 📺 ${m3uUrl}`);
    else log(`[${TAG}] ⚠️ Trial provisioned but no M3U found.`, "warn");

    return buildResult({
      username: sub?.iptv_username ?? null,
      password: sub?.iptv_password ?? null,
      tvPlaylist: m3uUrl,
      allM3uLinks: m3uUrl ? [m3uUrl] : [],
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
