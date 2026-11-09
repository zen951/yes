/**
 * russian-services/jwt-verify/jwtVerifyBase.js
 *
 * Factory for the "register → verify-by-email-link → JWT login → playlist-links"
 * trial pattern shared by RUTV and USPEH (only).
 *
 * Flow:
 *   1. POST /auth/register        → create account (plain JSON, no encryption)
 *   2. Poll inbox                 → extract the email-verification link
 *   3. GET  /email/verify         → confirm email (called on the link's own origin)
 *   4. POST /auth/login           → obtain JWT
 *   5. GET  /user/playlist-links  → hand the response to `derive()` to build playlists
 *
 * /auth/register and /auth/login are exempt from the SPA's AES body encryption,
 * so plain JSON works. No captcha or device fingerprint required.
 * Retries with a fresh email on any of the `emailTaken` markers (default "userExists").
 *
 * Exports:
 *   jwtVerifyService(config) — returns a service object { meta, execute } for the registry
 *
 * Config fields:
 *   meta              { id, name, description, group }
 *   base              "https://…"               SPA/API origin
 *   language          "ru"                       register body `language` field (default "ru")
 *   trialHours        number                     fixed-hour expiry
 *   verifyTimeout     ms                         inbox poll timeout (default 120_000)
 *   filterText        string | string[]          inbox filter passed to waitForEmailAndExtractLink
 *   verifyLink        RegExp                     link pattern that identifies the verify email
 *   emailTaken        string[]                   retryable error markers (default ["userExists"])
 *   registerPath      "/auth/register"          (default shown)
 *   loginPath         "/auth/login"             (default shown)
 *   playlistLinksPath "/user/playlist-links"    (default shown)
 *   verifyPath        "/email/verify"            (default shown)
 *   derive(links, ctx) => object                 maps the playlist-links response onto the
 *                                                buildResult() fields (tvPlaylist, vodPlaylist, note, …)
 */

import {
  buildResult,
  generateUsername,
  generatePassword,
} from "../../../parsing/generators.js";
import { makeApi } from "../../../http/apiClient.js";
import { retryWithFreshEmail } from "../../../email/base.js";

// ── Factory ───────────────────────────────────────────────────────────────────

export function jwtVerifyService(config) {
  const {
    meta,
    base,
    language = "ru",
    trialHours,
    verifyTimeout = 120_000,
    filterText,
    verifyLink,
    emailTaken = ["userExists"],
    registerPath = "/auth/register",
    loginPath = "/auth/login",
    playlistLinksPath = "/user/playlist-links",
    verifyPath = "/email/verify",
    derive,
  } = config;

  if (typeof derive !== "function")
    throw new Error(`[${meta?.name}] jwtVerifyService requires a derive()`);

  const TAG = meta.name;

  // Pre-bound API helper for the service origin; Origin/Referer match the SPA.
  const api = makeApi(`${base}/api`, {
    extraHeaders: { Origin: base, Referer: `${base}/register` },
    errorDetail: (j) => j?.error ?? j?.message,
  });

  return {
    meta,

    async execute({
      provider,
      credentialStore,
      email,
      inboxSeenIds = new Set(),
      log = () => {},
    }) {
      return retryWithFreshEmail(
        async (email) => {
          const username = generateUsername();
          const password = generatePassword();

          // Step 1: Register a new account with the disposable email.
          log(`[${TAG}] 📝 Registering account...`);
          await api(registerPath, {
            method: "POST",
            body: { username, email, password, language },
          });

          // Step 2: Poll inbox for the verification email and extract the link.
          log(
            `[${TAG}] ✅ Registration confirmed ➜ 📩 Polling inbox for verification email…`,
          );
          const link = await provider.waitForEmailAndExtractLink(
            credentialStore,
            {
              filterText,
              pattern: verifyLink,
              seenIds: new Set(inboxSeenIds),
              timeout: verifyTimeout,
            },
          );
          if (!link)
            throw new Error(`[${TAG}] Verification email not received.`);

          // Step 3: Confirm the email — the verify call goes to the link's own origin.
          const verifyToken = new URL(link).searchParams.get("token");
          const linkOrigin = new URL(link).origin;
          log(`[${TAG}] 🔐 Verifying email: ${link}`);
          await makeApi(`${linkOrigin}/api`, {
            extraHeaders: { Origin: linkOrigin, Referer: link },
            errorDetail: (j) => j?.error ?? j?.message,
          })(`${verifyPath}?token=${encodeURIComponent(verifyToken)}`);

          // Step 4: Log in to obtain a JWT for authenticated requests.
          log(
            `[${TAG}] 🔑 Logging in — username: ${username} | password: ${password}`,
          );
          const { token: jwt } = await api(loginPath, {
            method: "POST",
            body: { username, password },
          });

          // Step 5: Fetch playlist links and let the service derive its playlists.
          log(`[${TAG}] 📋 Fetching playlist links…`);
          const links = await api(playlistLinksPath, { token: jwt });

          return buildResult({
            username,
            password,
            trialHours,
            serviceName: TAG,
            ...derive(links, { username, password, log, TAG }),
          });
        },
        {
          provider,
          credentialStore,
          email,
          inboxSeenIds,
          log,
          tag: TAG,
          shouldRetry: (err) => emailTaken.some((k) => err.message.includes(k)),
        },
      );
    },
  };
}
