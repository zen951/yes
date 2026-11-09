/**
 * Maple 4K IPTV — free trial.
 * Site: https://maple4k.ca/
 */
import { simplePost } from "../../engine/simplePost.js";
import { nextDayAt, generateUsername } from "../../parsing/generators.js";

export default simplePost({
  meta: {
    id: "maple4k",
    name: "Maple 4K IPTV",
    description: "Until 01:00 AM next day",
    group: "trex",
  },
  url: "https://iptv-trial-maple4k.medmaar.workers.dev/",
  referer: "https://maple4k.ca/",
  filterText: "help@maple4k.ca",
  expiryDate: () => nextDayAt(1),
  payload: (email) => ({
    name: generateUsername(),
    email: email.trim(),
    country: "United Arab Emirates",
    device: "PC Windows / Mac",
    whatsapp: "",
    notes: "",
  }),
});
