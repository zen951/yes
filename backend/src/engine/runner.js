/**
 * engine/runner.js
 *
 * Task runner — orchestrates the full lifecycle for a single automation task.
 *
 * - Resolves the email provider and services from the registry.
 * - Creates a temporary email address via the selected provider.
 * - Executes each selected service in sequence, collecting results.
 * - Supports mid-task cancellation via AbortController.
 * - Emits live SSE events (email_created, service_start, result, done) throughout.
 *
 * Exports:
 *   runTask(taskId, providerId, serviceIds) — validates inputs, creates an email address,
 *                                             then runs each selected service in sequence.
 */

import { getProvider, getService } from "./registry.js";
import logger from "../logger.js";
import { tasks } from "./taskStore.js";
import { emit, log, buildRecord } from "./events.js";

// ── Constants ─────────────────────────────────────────────────────────────────

// Provider methods that must receive the task's abort signal on every call.
const POLL_METHODS = [
  "waitForVerificationCodeEmail",
  "waitForEmailAndExtractLink",
  "waitForEmailAndExtractPlaylists",
];

const BANNER =
  "╔══════════════════════════════════════════════════════════════════════╗";
const FOOTER =
  "╚══════════════════════════════════════════════════════════════════════╝";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Formats milliseconds as a "N.Ns" string.
const fmtSecs = (ms) => `${(ms / 1000).toFixed(1)}s`;

// Aborts the task with an error status and fires the done event.
const failTask = (task, emitter, msg) => {
  log(emitter, msg, "error");
  task.status = "error";
  emitter.emit("done");
};

// Stores a result record on the task and broadcasts it to the UI.
const pushResult = (task, emitter, record) => {
  task.results.push(record);
  emit(emitter, "result", record);
};

// Wraps a provider so every inbox-polling call automatically receives the task's
// abort signal — services pass options as a plain object, so we merge { signal } in.
const makeCancelableProvider = (provider, signal) =>
  new Proxy(provider, {
    get(target, prop) {
      if (POLL_METHODS.includes(prop))
        return (store, opts = {}) => target[prop](store, { ...opts, signal });
      return typeof target[prop] === "function"
        ? target[prop].bind(target)
        : target[prop];
    },
  });

// ── Runner ────────────────────────────────────────────────────────────────────

// Runs the full task: validate inputs, create email, iterate services.
export async function runTask(taskId, providerId, serviceIds) {
  const task = tasks.get(taskId);
  if (!task) return;

  const {
    emitter,
    abortController: { signal },
  } = task;
  task.status = "running";

  // ── Validate inputs ───────────────────────────────────────────────────────

  const provider = getProvider(providerId);
  if (!provider)
    return failTask(task, emitter, `Unknown email provider: "${providerId}"`);

  // Resolve service IDs — warn and skip any that don't exist in the registry.
  const services = serviceIds.flatMap((id) => {
    const s = getService(id);
    if (!s) logger.warn(`[Engine] Unknown service id: "${id}" — skipped`);
    return s ? [s] : [];
  });

  if (!services.length)
    return failTask(task, emitter, "No valid registration services selected.");

  // ── Run ───────────────────────────────────────────────────────────────────

  try {
    if (signal.aborted) throw new DOMException("", "AbortError");

    // Plain object used as a credential store — providers write here in createEmail()
    // and read back from it in polling methods.
    const credentialStore = {};
    const cancelableProvider = makeCancelableProvider(provider, signal);

    const email = await provider.createEmail(credentialStore);
    emit(emitter, "email_created", { email, provider: provider.meta.name });
    log(emitter, `📧 Temporary email ready: ${email}`);

    const taskStart = Date.now();
    // Shared across all services so an email seen by one is never re-processed by the next.
    const inboxSeenIds = new Set();
    for (const [i, service] of services.entries()) {
      if (signal.aborted) break;

      log(emitter, `${BANNER} [${i + 1}/${services.length}]`);
      log(emitter, `🚀 Starting registration on ${service.meta.name}...`);
      emit(emitter, "service_start", {
        serviceId: service.meta.id,
        name: service.meta.name,
      });

      try {
        const serviceStart = Date.now();
        const result = await service.execute({
          provider: cancelableProvider,
          credentialStore,
          email,
          inboxSeenIds,
          taskId,
          emitter,
          log: (msg, level = "info") => log(emitter, msg, level),
        });

        const elapsed = fmtSecs(Date.now() - serviceStart);
        pushResult(task, emitter, buildRecord(service, email, result));
        // Tagged so it appears in both the All tab and the per-service tab.
        log(emitter, `[${service.meta.name}] 🎉 Success ⏱️ ${elapsed}`);
      } catch (err) {
        // Distinguish CAPTCHA failures from generic errors for the UI.
        const status = err.type === "CAPTCHA" ? "captcha" : "failed";
        pushResult(
          task,
          emitter,
          buildRecord(service, email, { status, note: err.message }),
        );
        log(
          emitter,
          `${status === "captcha" ? "�️" : "❌"} ${service.meta.name}: ${err.message}`,
          "warn",
        );
      }

      log(emitter, FOOTER);
    }

    log(
      emitter,
      signal.aborted
        ? "� Task was cancelled by user."
        : `🤖 Automation complete. ${task.results.length} service(s) processed. ⏱️ ${fmtSecs(Date.now() - taskStart)}`,
    );
    task.status = signal.aborted ? "cancelled" : "done";
  } catch (err) {
    if (err.name === "AbortError") {
      task.status = "cancelled";
      log(emitter, "🛑 Task was cancelled by user.");
    } else {
      task.status = "error";
      log(emitter, `💥 Fatal error: ${err.message}`, "error");
      emit(emitter, "error", { message: err.message });
    }
  } finally {
    emit(emitter, "done", { status: task.status, results: task.results });
    emitter.emit("done");
  }
}
