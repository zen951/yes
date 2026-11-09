/**
 * PongoIPTV — free 24-hour trial (hCaptcha-protected form).
 *
 * Site: https://pongoiptv.co/testa-iptv/
 *
 * Flow:
 *   1. Prompt user to solve hCaptcha → resolve token.
 *   2. POST /testa-iptv/ → submit email + trial_service + captcha tokens.
 *   3. On HTTP 200 with an alert div → translate + surface as warning, stop.
 *   4. Otherwise → poll inbox for credentials email, extract M3U links.
 *
 * Notes:
 *   - The form sends both `g-recaptcha-response` and `h-captcha-response`
 *     with the same hCaptcha token (WordPress hCaptcha plugin dual-field compat).
 *   - Credentials are delivered by email, not returned in the POST response.
 */
import { buildResult } from "../../parsing/generators.js";
import { createJar, post } from "../../http/cookieClient.js";
import { plainText } from "../../parsing/extractors.js";
import { awaitCaptcha } from "../../engine/captcha.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "PongoIPTV";
const TRIAL_URL = "https://pongoiptv.co/testa-iptv/";
const SITEKEY = "f3f227a4-5c8a-4cc4-aa1c-136661029cc6";
const TRIAL_HOURS = 24;
const FILTER_TEXT = ["pongoiptv", "info@pongoiptv.co"];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Translates text to English via the free Google Translate endpoint.
// Falls back to the original on any failure.
async function toEnglish(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return text;
    const json = await res.json();
    return (
      json?.[0]
        ?.map((s) => s?.[0])
        .filter(Boolean)
        .join("") || text
    );
  } catch {
    return text;
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "pongoiptv",
    name: TAG,
    description: `${TRIAL_HOURS} Hours`,
    group: "other",
  },

  async execute({
    provider,
    credentialStore,
    email,
    taskId,
    emitter,
    inboxSeenIds = new Set(),
    log = () => {},
  }) {
    // Step 1: Wait for the user to solve the hCaptcha challenge.
    const captchaToken = await awaitCaptcha(
      taskId,
      emitter,
      TRIAL_URL,
      SITEKEY,
      TAG,
      log,
      "hcaptcha",
    );
    log(
      `[${TAG}] ✅ 🤖 hCaptcha solved — submitting trial form for ${email}...`,
    );

    // Step 2: POST the trial form — both captcha fields required by the WordPress hCaptcha plugin.
    const { status, text, finalUrl } = await post(
      TRIAL_URL,
      createJar(),
      {
        trial_service: "nxt",
        email: email.trim(),
        "g-recaptcha-response": captchaToken,
        "h-captcha-response": captchaToken,
      },
      TRIAL_URL,
    );

    // Extract inline alert div (e.g. daily-limit warning returned as HTTP 200).
    const alertRaw = text?.match(
      /<div[^>]*class="[^"]*iptv-alert[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    )?.[1];
    const alertText = alertRaw ? plainText(alertRaw) : null;

    if (status >= 400) {
      const reason = alertText ?? plainText(text ?? "").slice(0, 120);
      log(`[${TAG}] ❌ HTTP ${status} | ${finalUrl} | ${reason}`, "warn");
      throw new Error(
        `[${TAG}] Trial form rejected — HTTP ${status}: ${reason}`,
      );
    }

    // A warning div means the site rejected the request silently (e.g. daily trial limit).
    // Some alert divs are success confirmations — detect them by key phrases and continue to
    // inbox polling instead of returning early.
    if (alertText) {
      const isSuccess =
        /created|account has been|sent your login|login details|credentials/i.test(
          alertText,
        ) || alertText.includes("🎉");

      if (isSuccess) {
        // Success confirmation — fall through to inbox polling below.
        log(`[${TAG}] ✅ ${alertText.slice(0, 120)}`);
      } else {
        const en = await toEnglish(alertText);
        const note = en !== alertText ? `${en} (${alertText})` : alertText;
        log(`[${TAG}] ⚠️ ${note}`, "warn");
        return buildResult({
          status: "warning",
          note,
          trialHours: TRIAL_HOURS,
          serviceName: TAG,
        });
      }
    }

    // Step 3: Poll inbox for the credentials email and extract M3U links.
    log(`[${TAG}] ✅ Trial form accepted. 📬 Waiting for credentials email...`);
    const playlists = await provider.waitForEmailAndExtractPlaylists(
      credentialStore,
      {
        filterText: FILTER_TEXT,
        seenIds: new Set(inboxSeenIds),
        timeout: 120_000,
      },
    );

    if (!playlists.allM3uLinks.length)
      log(`[${TAG}] ⚠️ No M3U links found.`, "warn");
    else
      log(
        `[${TAG}] ✅ TV: ${playlists.tvPlaylist ?? "none"}, total: ${playlists.allM3uLinks.length}`,
      );

    return buildResult({
      playlists,
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
