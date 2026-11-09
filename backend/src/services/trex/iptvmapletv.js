/**
 * IPTV Maple TV — free trial.
 * Site: https://iptvmapletv.com/try-iptv-canada/
 */
import { simplePost } from "../../engine/simplePost.js";
import {
  nextDayAt,
  generatePhone,
  generateUsername,
} from "../../parsing/generators.js";

export default simplePost({
  meta: {
    id: "iptvmapletv",
    name: "IPTV Maple TV",
    description: "Until 01:00 AM next day",
    group: "trex",
  },
  url: "https://iptv-trial-iptvmapletv.medmaar.workers.dev/",
  referer: "https://iptvmapletv.com/try-iptv-canada/",
  filterText: "iptvmapletv",
  expiryDate: () => nextDayAt(1),
  payload: (email) => ({
    name: generateUsername(),
    email: email.trim(),
    whatsapp: generatePhone(),
    country: "Canada",
    website: "",
    page: "/try-iptv-canada/",
  }),
});
