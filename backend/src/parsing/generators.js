/**
 * generators.js
 *
 * Shared random data generators and date/duration utilities.
 * Used by services and email providers — no domain dependencies.
 *
 * Exports:
 *   generateUsername()         — 10 lowercase letters + 10 digits
 *   generatePassword()         — 6 mixed-case letters + 4 digits
 *   generatePhone()            — random 10-digit phone number (non-zero leading digit)
 *   nextDayAt(hour, minute)    — next occurrence of HH:MM as a Date
 *   computeExpiresAt(msOrDate) — formatted expiry string from a Date or ms offset
 *   parseExpiryDate(raw)       — parses "DD.MM.YYYY HH:mm" UTC string into a Date
 *   formatDuration(expiryDate) — remaining time from a Date as "N Hours M Min"
 *   buildM3u(host, user, pass) — Xtream-Codes M3U+ URL or null
 *   buildResult(fields)        — builds the standardised service result object
 */

// ── Random data ───────────────────────────────────────────────────────────────

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "23456789"; // avoids ambiguous 0/1

// Picks n random characters from charset.
const rand = (charset, n) =>
  Array.from(
    { length: n },
    () => charset[Math.floor(Math.random() * charset.length)],
  ).join("");

export const generateUsername = () => rand(LOWER, 10) + rand(DIGITS, 10);
export const generatePassword = () => rand(LOWER + UPPER, 6) + rand(DIGITS, 4);

// Non-zero leading digit followed by 9 random digits.
export const generatePhone = () =>
  String(Math.ceil(Math.random() * 9)) +
  String(Math.floor(Math.random() * 1e9)).padStart(9, "0");

// ── Date helpers ──────────────────────────────────────────────────────────────

const TZ = "Asia/Jerusalem";

const DATE_FMT = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

// Returns today at HH:MM if that time hasn't passed yet, otherwise tomorrow.
export function nextDayAt(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

// Formats a Date or ms offset as a human-readable timestamp, e.g. "Jan 1, 2026, 00:00".
export const computeExpiresAt = (msOrDate, { timeZone = TZ } = {}) =>
  (msOrDate instanceof Date
    ? msOrDate
    : new Date(Date.now() + msOrDate)
  ).toLocaleString("en-US", { ...DATE_FMT, timeZone });

// Parses a "DD.MM.YYYY HH:mm" UTC string (as returned by some IPTV APIs) into a Date.
export const parseExpiryDate = (raw) => {
  if (!raw) return null;
  const [[d, mo, y], t] = [raw.split(" ")[0].split("."), raw.split(" ")[1]];
  return new Date(`${y}-${mo}-${d}T${t}:00Z`);
};

// Returns remaining time from an expiry Date as "N Hours M Min", "N Hours", or "N Min".
export function formatDuration(expiryDate) {
  if (!expiryDate) return null;
  const total = Math.floor((expiryDate - Date.now()) / 60_000);
  const h = Math.floor(total / 60),
    m = total % 60;
  return h === 0 ? `${m} Min` : m > 0 ? `${h} Hours ${m} Min` : `${h} Hours`;
}

// ── Result builders ───────────────────────────────────────────────────────────

// Builds an Xtream-Codes M3U+ URL from server host and credentials.
// Returns null if any argument is missing.
export const buildM3u = (host, username, password) =>
  host && username && password
    ? `${host}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`
    : null;

// Builds the standardised service result object.
// duration/expiresAt priority: explicit fields → expiryDate → trialHours → playlists bag.
export function buildResult({
  username = null,
  password = null,
  serviceName,
  tvPlaylist,
  vodPlaylist,
  allM3uLinks,
  trialHours,
  expiryDate,
  duration,
  expiresAt,
  playlists,
  status = "success",
  note,
} = {}) {
  const tv = tvPlaylist ?? playlists?.tvPlaylist ?? null;
  const vod = vodPlaylist ?? playlists?.vodPlaylist ?? null;
  const links = Array.isArray(allM3uLinks)
    ? allM3uLinks
    : playlists?.allM3uLinks?.length
      ? playlists.allM3uLinks
      : [tv, vod].filter(Boolean);

  let dur = duration ?? null;
  let exp = expiresAt ?? null;

  if (!dur || !exp) {
    if (expiryDate instanceof Date && !isNaN(expiryDate)) {
      dur ??= formatDuration(expiryDate);
      exp ??= computeExpiresAt(expiryDate);
    } else if (trialHours) {
      dur ??=
        trialHours >= 48 && trialHours % 24 === 0
          ? `${trialHours / 24} Days`
          : `${trialHours} Hours`;
      exp ??= computeExpiresAt(trialHours * 3_600_000);
    } else {
      // No override — fall back to whatever the email contained.
      dur ??= playlists?.duration ?? null;
      exp ??= playlists?.expiresAt ?? null;
    }
  }

  return {
    username,
    password,
    tvPlaylist: tv,
    vodPlaylist: vod,
    allM3uLinks: links,
    duration: dur,
    expiresAt: exp,
    status,
    note:
      note ??
      (serviceName
        ? `${serviceName} trial ${links.length ? "activated successfully" : "registered — M3U link not found"}. (${dur})`
        : ""),
  };
}
