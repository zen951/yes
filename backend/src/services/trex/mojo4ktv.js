/**
 * Mojo 4K TV — free trial.
 * Site: https://mojo4ktv.com/
 */
import { simplePost } from "../../engine/simplePost.js";
import {
  nextDayAt,
  generateUsername,
  generatePhone,
} from "../../parsing/generators.js";

export default simplePost({
  meta: {
    id: "mojo4ktv",
    name: "Mojo 4K TV",
    description: "Until 01:00 AM next day",
    group: "trex",
  },
  url: "https://mojo4ktv.com/api/trial",
  referer: "https://mojo4ktv.com/",
  filterText: "help@mojo4ktv.com",
  expiryDate: () => nextDayAt(1),
  payload: (email) => ({
    name: generateUsername(),
    email: email.trim(),
    country: "Canada",
    whatsapp: `+1 ${generatePhone()}`,
    device: "Windows PC / Mac",
    notes: "",
  }),
});
