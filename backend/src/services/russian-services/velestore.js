/**
 * VeleStore (velestore.su) — free IPTV trial via registration.
 *
 * Flow:
 *   1. GET  /?do=register      — solve AES-128-CBC DDoS challenge cookie.
 *   2. POST /?do=register      — dummy POST to prime POST-specific DDoS cookie.
 *   3. POST /?do=register      — real registration with reCAPTCHA token.
 *   4. GET  /index.php?do=test — activates the 3-day trial.
 *   5. GET  /user/<username>/  — scrape the M3U playlist URL.
 *
 * reCAPTCHA v2 sitekey: 6LdxN2ElAAAAADqK4-H-y-EB7bcoqFjxDtZy7RFa
 */
import { createDecipheriv } from "crypto";
import { runInNewContext } from "vm";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";
import {
  generateUsername,
  generatePassword,
  buildResult,
} from "../../parsing/generators.js";
import { extractPlaylists } from "../../parsing/extractors.js";
import {
  createJar,
  mergeCookies,
  cookieStr,
  get,
  request,
  DEFAULT_UA,
} from "../../http/cookieClient.js";
import { awaitCaptcha } from "../../engine/captcha.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE = "https://velestore.su";
const REG_URL = `${BASE}/?do=register`;
const TEST_URL = `${BASE}/index.php?do=test`;
const TAG = "VeleStore";
const TRIAL_HOURS = 72;
const SITEKEY = "6LdxN2ElAAAAADqK4-H-y-EB7bcoqFjxDtZy7RFa";

// velestore.su's Let's Encrypt cert may be expired; skip verification for this host only.
const LENIENT_DISPATCHER = new UndiciAgent({
  connect: { rejectUnauthorized: false },
});
const OPTS = { referer: REG_URL, origin: BASE, dispatcher: LENIENT_DISPATCHER };

// ── DDoS solver ───────────────────────────────────────────────────────────────

// Finds the slowAES challenge <script>, runs it in a VM sandbox, and injects
// the solved cookie into jar. Returns true if a cookie was captured.
function injectSolvedCookie(html, jar) {
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].find(
    ([, s]) => /slowAES/i.test(s),
  )?.[1];
  if (!script) return false;

  let name, value;
  try {
    runInNewContext(
      `var _o=toHex; toHex=function(a){return a&&a._isResult?a._hex:_o(a)};\n${script}`,
      {
        slowAES: {
          decrypt(c3, _mode, key, iv) {
            const d = createDecipheriv(
              "aes-128-cbc",
              Buffer.from(key.map(Number)),
              Buffer.from(iv.map(Number)),
            );
            d.setAutoPadding(false);
            const out = Buffer.concat([
              d.update(Buffer.from(c3.map(Number))),
              d.final(),
            ]);
            return { _hex: out.toString("hex"), _isResult: true };
          },
        },
        atob: (b64) => Buffer.from(b64, "base64").toString("utf8"),
        document: {
          set cookie(raw) {
            const eq = raw.indexOf("=");
            if (eq > 0) {
              name = raw.slice(0, eq).split(";")[0].trim();
              value = raw
                .slice(eq + 1)
                .split(";")[0]
                .trim();
            }
          },
        },
        location: { href: "" },
      },
      { timeout: 2000 },
    );
  } catch {
    return false;
  }

  if (!name || !value) return false;
  jar[name] = value;
  return true;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

// No-redirect POST — captures DDoS cookies that only appear on POST responses.
// (cookieClient.request follows redirects, so we need this for the dummy step.)
async function rawPost(jar, body) {
  const res = await undiciFetch(REG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DEFAULT_UA,
      Cookie: cookieStr(jar),
      Origin: BASE,
      Referer: REG_URL,
    },
    body: new URLSearchParams(body).toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(25_000),
    dispatcher: LENIENT_DISPATCHER,
  });
  mergeCookies(jar, res);
  return { text: await res.text(), status: res.status };
}

// Redirect-following fetch that auto-solves any DDoS challenge on each hop.
async function fetch$(method, url, jar, body) {
  for (let i = 0; i < 4; i++) {
    const { text, status } = await request(method, url, jar, { body, ...OPTS });
    if (!injectSolvedCookie(text, jar)) return { text, status };
  }
  throw new Error(`[${TAG}] DDoS challenge unresolved after 4 attempts.`);
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const DUMMY_BODY = {
  name: "x",
  password1: "x",
  password2: "x",
  email: "x@x.x",
  submit_reg: "submit_reg",
  do: "register",
  "g-recaptcha-response": "dummy",
};

// Primes GET and POST DDoS cookies before the real registration POST.
async function primeDDosCookies(jar, log) {
  log(`[${TAG}] 🔒 Priming DDoS cookies...`);
  await fetch$("GET", REG_URL, jar, null).catch((err) => {
    throw new Error(
      `[${TAG}] Network error reaching ${BASE}: ${err.cause?.message ?? err.message}`,
    );
  });

  const { text, status } = await rawPost(jar, DUMMY_BODY);
  if (status >= 300 && status < 400) {
    log(`[${TAG}] ✅ POST challenge already satisfied.`);
  } else if (injectSolvedCookie(text, jar)) {
    log(`[${TAG}] ✅ POST DDoS solved — confirming...`);
    await rawPost(jar, DUMMY_BODY);
  }

  log(`[${TAG}] ✅ 🔑 Cookies ready: ${Object.keys(jar).join(", ")}`);
}

// Submits the registration form; throws on DLE CMS errors or duplicate account.
async function register(jar, { username, password, email }, captchaToken) {
  const { text } = await fetch$("POST", REG_URL, jar, {
    name: username,
    password1: password,
    password2: password,
    email,
    submit_reg: "submit_reg",
    do: "register",
    "g-recaptcha-response": captchaToken,
  });

  const err = /class="inform-1">([\s\S]{0,400}?)<\/span>/i
    .exec(text)?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (err && !/успешно|success/i.test(err))
    throw new Error(`[${TAG}] Registration error: ${err}`);
  if (/уже (зарег|существует)|already (exist|reg)/i.test(text))
    throw new Error(`[${TAG}] Username or email already registered.`);
}

// Activates the trial and scrapes the M3U URL from the user profile page.
async function activateAndGetM3u(jar, username, log) {
  log(`[${TAG}] 🎁 Activating trial...`);
  await get(TEST_URL, jar, OPTS);

  const { text, status } = await fetch$(
    "GET",
    `${BASE}/user/${encodeURIComponent(username)}/`,
    jar,
    null,
  );

  if (!/Привет[,\s]/i.test(text) && !/playlist\.m3u/i.test(text)) {
    log(
      `[${TAG}] ⚠️ Not authenticated. Jar: ${Object.keys(jar).join(", ")}`,
      "warn",
    );
    return null;
  }

  return (
    /https?:\/\/[^\s"'<>]+\/(?:play(?:18)?|no)\/[^\s"'<>]+\.m3u8?/i.exec(
      text,
    )?.[0] ??
    extractPlaylists(text)?.tvPlaylist ??
    null
  );
}

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "velestore",
    name: "VeleStore",
    description: `${TRIAL_HOURS / 24} Days`,
    group: "russian",
  },

  async execute({ email, taskId, emitter, log = () => {} }) {
    const username = generateUsername();
    const password = generatePassword();
    const jar = createJar();

    await primeDDosCookies(jar, log);

    const captchaToken = await awaitCaptcha(
      taskId,
      emitter,
      REG_URL,
      SITEKEY,
      TAG,
      log,
    );

    await register(jar, { username, password, email }, captchaToken);

    // DLE CMS sets PHPSESSID / dle_user_id / dle_password or similar on success.
    const session = Object.keys(jar).find((k) =>
      /phpsessid|dle_user|user_hash|sess|sid|auth/i.test(k),
    );
    if (!session)
      throw new Error(
        `[${TAG}] No session cookie — captcha may have been rejected.`,
      );
    log(`[${TAG}] ✅ Registered. Session: ${session}.`);

    const tvPlaylist = await activateAndGetM3u(jar, username, log);
    if (tvPlaylist) log(`[${TAG}] 📺 ${tvPlaylist}`);

    return buildResult({
      username,
      password,
      tvPlaylist,
      trialHours: TRIAL_HOURS,
      serviceName: "VeleStore",
    });
  },
};
