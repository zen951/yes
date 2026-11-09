/**
 * iIPTV Canada — free trial.
 * Site: https://iiptv-canada.ca/iptv-free-trial/
 *
 * Notes:
 *   - Origin must be iiptv-canada.ca, not the API host.
 *   - ownerToken = SHA-256(email); different token for same email → 409.
 */
import { createHash } from "node:crypto";
import { simplePost } from "../../engine/simplePost.js";
import { generateUsername, generatePhone } from "../../parsing/generators.js";

// SHA-256(email) → stable ownerToken; same email = same token, retries are idempotent.
const ownerToken = (email) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export default simplePost({
  meta: {
    id: "iiptvcanada",
    name: "iIPTV Canada",
    description: "24 Hours",
    group: "best",
  },
  url: "https://deepskyblue-dotterel-951962.hostingersite.com/api/portfolio/free-trials",
  referer: "https://iiptv-canada.ca/iptv-free-trial/",
  origin: "https://iiptv-canada.ca",
  filterText: ["iiptv-canada", "tarikamg44@gmail.com"],
  trialHours: 24,
  payload: (email) => ({
    name: generateUsername(),
    email: email.trim(),
    phone: generatePhone(),
    device: "pc",
    locale: "en",
    reminderConsent: true,
    website: "",
    ownerToken: ownerToken(email),
  }),
});
