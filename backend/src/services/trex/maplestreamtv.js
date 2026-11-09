/**
 * Maple Stream TV — free trial.
 * Site: https://maplestreamtv.ca/
 */
import { simplePost } from "../../engine/simplePost.js";
import { nextDayAt, generateUsername } from "../../parsing/generators.js";

export default simplePost({
  meta: {
    id: "maplestreamtv",
    name: "Maple Stream TV",
    description: "Until 01:00 AM next day",
    group: "trex",
  },
  url: "https://iptv-trial-maplestreamtv.medmaar.workers.dev/",
  referer: "https://maplestreamtv.ca/en",
  filterText: "help@maplestreamtv.ca",
  expiryDate: () => nextDayAt(1),
  payload: (email) => ({
    name: generateUsername(),
    email: email.trim(),
    device: "Windows PC",
    whatsapp: "",
    notes: "",
    country: "Canada",
  }),
});
