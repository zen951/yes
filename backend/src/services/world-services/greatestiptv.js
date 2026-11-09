/**
 * Greatest / Strimo IPTV — free trial.
 * Site: https://www.strimoiptv.com/free-trial/
 */
import { simplePost } from "../../engine/simplePost.js";

export default simplePost({
  meta: {
    id: "strimoiptv",
    name: "Greatest/Strimo IPTV",
    description: "36 Hours",
    group: "other",
  },
  url: "https://www.strimoiptv.com/api/orders", // "https://www.greatestiptv.com"
  referer: "https://www.strimoiptv.com/free-trial/?trial=true", // "https://www.greatestiptv.com"
  filterText: [
    "strimoiptv",
    "no-reply@strimoiptv.com",
    "greatestiptv",
    "noreply@greatestiptv.com",
  ],
  trialHours: 36,
  payload: (email) => ({
    planId: "trial",
    email: email.trim(),
    planType: "standard",
    hasAdultContent: false,
  }),
});
