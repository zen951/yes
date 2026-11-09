/**
 * TvOnNet — API-based 12-hour free trial.
 *
 * Site: https://www.tvonnet.live
 *
 * Flow:
 *   POST /api/iptv/provision → response contains M3U links + magicLink directly.
 *
 * Trial duration: until 01:00 AM next day.
 *
 * Note: TvOnNet rejects Gmail dot-alias addresses (Emailnator) with a 400.
 * Gmail ignores dots in the local part, so we strip them before submitting.
 */
import { buildResult, nextDayAt } from "../../parsing/generators.js";
import { jsonPost } from "../../http/cookieClient.js";
import { extractM3uLinks } from "../../parsing/extractors.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.tvonnet.live";
const TAG = "TvOnNet";

// Strips dots from the local part of Gmail addresses so dot-aliases (Emailnator)
// aren't rejected. Gmail ignores dots, so it's the same inbox. Non-Gmail untouched.
const stripGmailDots = (email) =>
  email.replace(
    /^([^@]+)@(gmail\.com|googlemail\.com)$/i,
    (_, l, d) => `${l.replace(/\./g, "")}@${d}`,
  );

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "tvonnet",
    name: TAG,
    description: "Until 01:00 AM next day",
    group: "trex",
  },

  async execute({ email, log = () => {} }) {
    const submitEmail = stripGmailDots(email.trim());
    if (submitEmail !== email.trim())
      log(`[${TAG}] 🔧 Normalised email for submission: ${submitEmail}`);

    log(`[${TAG}] 📝 Submitting trial request...`);
    const data = await jsonPost(
      `${BASE_URL}/api/iptv/provision`,
      null,
      {
        panel: "both", // Server 1 OR Server 2
        duration: "12h",
        connections: 1,
        fullName: "VIP Guest",
        email: submitEmail,
        device: "Windows PC / Mac",
        paymentMethod: "Email Only Pass Delivery",
        includeAdult: false,
      },
      { referer: BASE_URL, origin: BASE_URL, throwOnError: true },
    );

    log(`[${TAG}] 📡 Response: ${JSON.stringify(data)}`);

    // Extract M3U links + magicLink, then order: server2 first, magicLink last.
    const allM3uLinks = extractM3uLinks(data);
    const magicLink = data?.magicLink ?? null;

    if (!allM3uLinks.length)
      log(`[${TAG}] ⚠️ No M3U links found in response.`, "warn");
    else
      log(
        `[${TAG}] ✅ ${allM3uLinks.length} M3U link(s) received:\n${[...allM3uLinks].reverse().join("\n")}`,
      );

    if (magicLink) log(`[${TAG}] 🔗 Magic Link: ${magicLink}`);

    const orderedLinks = [...allM3uLinks].reverse();
    if (magicLink) orderedLinks.push(magicLink);

    return buildResult({
      allM3uLinks,
      tvPlaylist: orderedLinks.length ? orderedLinks.join("\n") : null,
      vodPlaylist: null,
      expiryDate: nextDayAt(1),
      serviceName: TAG,
    });
  },
};
