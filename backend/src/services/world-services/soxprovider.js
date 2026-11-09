/**
 * SoxProvider — free trial via WPForms AJAX submission.
 *
 * Site: https://soxprovider.com/free-trial/
 *
 * Flow:
 *   1. GET /free-trial/              → session cookies + live WPForms tokens
 *   2. Wait 5 s                      → satisfy WPForms min-time anti-spam check
 *   3. POST /wp-admin/admin-ajax.php → submit the trial form
 *   4. Poll inbox                    → extract M3U links from credentials email
 */
import { buildResult } from "../../parsing/generators.js";
import { createJar, get, post } from "../../http/cookieClient.js";
import { extractInputValue, plainText } from "../../parsing/extractors.js";

const TAG = "SoxProvider";
const BASE_URL = "https://soxprovider.com";
const TRIAL_PAGE = `${BASE_URL}/free-trial/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const FILTER_TEXT = ["soxprovider", "Sox Provider", "Contact@soxprovider.com"];
const TRIAL_HOURS = 6;

export default {
  meta: {
    id: "soxprovider",
    name: TAG,
    description: `${TRIAL_HOURS} Hours`,
    group: "other",
  },

  async execute({
    provider,
    credentialStore,
    email,
    inboxSeenIds = new Set(),
    log = () => {},
  }) {
    const jar = createJar();

    // Step 1: fetch trial page — extract live WPForms tokens.
    log(`[${TAG}] 🔐 Loading trial page...`);
    const { text: html, status } = await get(TRIAL_PAGE, jar, {
      referer: `${BASE_URL}/iptv-free-trial/`,
    });
    if (status >= 400)
      throw new Error(`[${TAG}] Failed to load trial page — HTTP ${status}`);

    const timeToken = extractInputValue(html, "wpforms[time_token]");
    const formToken = html.match(/data-token="([^"]+)"/i)?.[1];
    if (!formToken)
      throw new Error(`[${TAG}] Could not extract WPForms token.`);

    // Step 2: wait for WPForms min-time anti-spam check.
    log(`[${TAG}] ⏳ Waiting before submitting...`);
    await new Promise((r) => setTimeout(r, 1_000));

    // Step 3: submit the form.
    const name = email.split("@")[0];
    log(`[${TAG}] 📝 Submitting trial form for ${email}...`);
    const { text: res } = await post(
      AJAX_URL,
      jar,
      {
        "wpforms[fields][1][first]": name,
        "wpforms[fields][1][last]": name,
        "wpforms[fields][8]": email.trim(),
        "wpforms[fields][4]": "No",
        "wpforms[fields][6]": "Laptop",
        "wpforms[id]": "1310",
        "wpforms[post_id]": "16",
        "wpforms[time_token]": timeToken ?? "",
        "wpforms[token]": formToken,
        "wpforms[submit]": "wpforms-submit",
        page_title: "Free Trial",
        page_url: TRIAL_PAGE,
        url_referer: `${BASE_URL}/iptv-free-trial/`,
        page_id: "16",
        action: "wpforms_submit",
      },
      TRIAL_PAGE,
    );

    const data = JSON.parse(res || "{}");
    if (data.success === false) {
      const err = data?.data?.errors?.general;
      throw new Error(
        `[${TAG}] ${plainText(err?.header ?? err?.footer ?? JSON.stringify(err)).slice(0, 200)}`,
      );
    }

    // Step 4: poll inbox for credentials email.
    log(`[${TAG}] ✅ Form accepted. 📬 Waiting for credentials email...`);
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
      playlists: { ...playlists, vodPlaylist: null },
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
