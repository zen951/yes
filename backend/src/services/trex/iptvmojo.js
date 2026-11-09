/**
 * IPTV Mojo — free trial.
 * Site: https://iptvmojo.com/free-trial
 */
import { simplePost } from "../../engine/simplePost.js";
import {
  nextDayAt,
  generateUsername,
  generatePhone,
} from "../../parsing/generators.js";

export default simplePost({
  meta: {
    id: "iptvmojo",
    name: "IPTV Mojo",
    description: "Until 01:00 AM next day",
    group: "trex",
  },
  url: "https://iptv-trial-iptvmojo.medmaar.workers.dev/",
  referer: "https://iptvmojo.com/free-trial",
  filterText: "support@iptvmojo.com",
  expiryDate: () => nextDayAt(1),
  payload: (email) => ({
    name: generateUsername(),
    email: email.trim(),
    country: "Canada",
    device: "Windows PC / Mac",
    whatsapp: generatePhone(),
    notes: "",
  }),
});
