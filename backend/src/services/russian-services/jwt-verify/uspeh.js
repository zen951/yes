/**
 * USPEH TV (billing.uspeh.my) — 30-day account registration.
 *
 * Flow delegated to jwtVerifyBase:
 *   1. POST /api/auth/register        → create account
 *   2. Poll inbox                     → extract billing.usp11.com verify link
 *   3. GET  /api/email/verify         → confirm email (called on the link's origin)
 *   4. POST /api/auth/login           → obtain JWT
 *   5. GET  /api/user/playlist-links  → extract playlist token from longUrl
 *      → build https://m3u.usp11.com/hls/token=<token>&type=ott
 */
import { jwtVerifyService } from "./jwtVerifyBase.js";

// ── Config ────────────────────────────────────────────────────────────────────

const PLAYER_URL = "https://player.uspeh.my/welcome";
const M3U_BASE = "https://m3u.usp11.com/hls";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Mirrors the SPA's D() helper: extracts the playlist token from a longUrl.
const extractToken = (longUrl = "") =>
  longUrl.match(/token=([^&/\s]+)/)?.[1] ?? null;

// ── Service ───────────────────────────────────────────────────────────────────

export default jwtVerifyService({
  meta: {
    id: "uspeh",
    name: "USPEH TV",
    description: "30 Days",
    group: "russian",
  },

  base: "https://billing.uspeh.my",
  trialHours: 720, // 30 days
  filterText: ["USPEH TV", "noreply@uspeh.tv"],
  verifyLink: /usp11\.com\/verify-email\?token=/i,

  derive(links, { TAG, log }) {
    const playlistToken = extractToken(links?.eu?.main?.longUrl);
    if (!playlistToken)
      throw new Error(`[${TAG}] Playlist token not found in response.`);

    const tvPlaylist = `${M3U_BASE}/token=${playlistToken}&type=ott`;
    log(
      `[${TAG}] 🎬 Open player → ${PLAYER_URL} → paste 🎟️ token: ${playlistToken}`,
    );
    log(`[${TAG}] 📺 ${tvPlaylist}`);

    return {
      tvPlaylist,
      note: `Playlist token: ${playlistToken} | Player: ${PLAYER_URL} (paste token)`,
    };
  },
});
