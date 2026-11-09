/**
 * RUTV (my.rutv.vip) — 3-day account registration.
 *
 * Flow delegated to jwtVerifyBase:
 *   1. POST /api/auth/register       → create account
 *   2. Poll inbox                    → extract my.rutv.vip verify link
 *   3. GET  /api/email/verify        → confirm email
 *   4. POST /api/auth/login          → obtain JWT
 *   5. GET  /api/user/playlist-links → derive M3U URLs from eu.main.longUrl,
 *      vod.longUrl, vod.seriesUrl → http://pl.ru-tv.site/{user}/{pass}/*.m3u
 */
import { jwtVerifyService } from "./jwtVerifyBase.js";

// ── Service ───────────────────────────────────────────────────────────────────

export default jwtVerifyService({
  meta: {
    id: "rutv",
    name: "RUTV",
    description: "3 Days",
    group: "russian",
  },

  base: "https://my.rutv.vip",
  trialHours: 72, // 3 days
  filterText: ["RUTV", "noreply@rutv.vip"],
  verifyLink: /rutv\.vip\/verify-email\?token=/i,

  derive(links, { TAG, log }) {
    const tvPlaylist = links?.eu?.main?.longUrl ?? null;
    const vodPlaylist = links?.vod?.longUrl ?? null;
    const seriesPlaylist = links?.vod?.seriesUrl ?? null;

    if (!tvPlaylist)
      throw new Error(`[${TAG}] TV playlist URL not found in response.`);

    if (tvPlaylist) log(`[${TAG}] 📺 TV:     ${tvPlaylist}`);
    if (vodPlaylist) log(`[${TAG}] 🍿 VOD:    ${vodPlaylist}`);
    if (seriesPlaylist) log(`[${TAG}] 🎬 Series: ${seriesPlaylist}`);

    return {
      tvPlaylist,
      vodPlaylist: [vodPlaylist, seriesPlaylist].filter(Boolean).join("\n"),
    };
  },
});
