/**
 * Mojo 4K DE — free trial.
 * Site: https://mojo4k.de/kostenlos-testen
 */
import { simplePost } from "../../engine/simplePost.js";
import { nextDayAt, generateUsername } from "../../parsing/generators.js";

export default simplePost({
  meta: {
    id: "mojo4kde",
    name: "Mojo 4K DE",
    description: "Until 01:00 AM next day",
    group: "trex",
  },
  url: "https://iptv-trial-mojo4kde.medmaar.workers.dev/",
  referer: "https://mojo4k.de/kostenlos-testen",
  filterText: "kontakt@mojo4k.de",
  expiryDate: () => nextDayAt(1),
  payload: (email) => ({
    name: generateUsername(),
    email: email.trim(),
    whatsapp: "",
    country: "Andere",
    device: "PC / Mac",
    notes: "",
  }),
});
