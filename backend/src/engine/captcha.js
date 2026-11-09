/**
 * engine/captcha.js
 *
 * Interactive CAPTCHA challenge helper.
 *
 * Exports:
 *   awaitCaptcha(taskId, emitter, pageUrl, sitekey, serviceName, log, provider?)
 *     — emits a captcha_challenge event and returns a Promise that resolves
 *       with the token when the frontend POSTs the solved response back.
 */

import { emit } from "./events.js";
import { setPendingCaptcha } from "./taskStore.js";

// ── Challenge ─────────────────────────────────────────────────────────────────

// Notifies the frontend of a pending CAPTCHA and waits for the user to solve it.
// Resolves with the token once the frontend POSTs it to the captcha route.
export function awaitCaptcha(
  taskId,
  emitter,
  pageUrl,
  sitekey,
  serviceName,
  log,
  provider = "recaptcha",
) {
  emit(emitter, "captcha_challenge", {
    taskId,
    sitekey,
    pageUrl,
    serviceName,
    provider,
  });
  return new Promise((resolve) => setPendingCaptcha(taskId, resolve));
}
