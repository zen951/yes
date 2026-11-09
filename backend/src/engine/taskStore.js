/**
 * engine/taskStore.js
 *
 * In-memory task store.
 *
 * Exports:
 *   tasks                                          — the underlying Map (used by runner.js)
 *   createTask()                                   — registers a new task, returns { taskId, emitter }
 *   getTask(taskId)                                — retrieves a task by id, or null
 *   cancelTask(taskId)                             — aborts a running/pending task
 *   setPendingCaptcha(taskId, resolve)             — registers a waiting captcha resolver
 *   resolvePendingCaptcha(taskId, token)           — fulfils the waiting captcha promise
 *   setPendingManualDone(taskId, resolve, reject)  — registers a waiting manual-registration resolver
 *   resolvePendingManualDone(taskId)               — signals that the user completed registration
 *   rejectPendingManualDone(taskId, name?)         — signals that the user cancelled registration
 *
 *   Legacy aliases (kept for backwards-compat):
 *   setPendingTvboomDone, resolvePendingTvboomDone, rejectPendingTvboomDone
 */

import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";

export const tasks = new Map();

// ── Internal helper ───────────────────────────────────────────────────────────

// Pops an entry from a pending map, calls fn(entry), and returns true. Returns false if nothing was waiting.
const popPending = (map, taskId, fn) => {
  const entry = map.get(taskId);
  if (!entry) return false;
  map.delete(taskId);
  fn(entry);
  return true;
};

// ── Captcha ───────────────────────────────────────────────────────────────────

const pendingCaptchas = new Map();

// Stores a resolve callback so the captcha route can unblock the waiting service.
export const setPendingCaptcha = (taskId, resolve) =>
  pendingCaptchas.set(taskId, resolve);

// Fulfils the pending captcha promise with the given token. Returns false if no captcha is waiting.
export const resolvePendingCaptcha = (taskId, token) =>
  popPending(pendingCaptchas, taskId, (resolve) => resolve(token));

// ── Task lifecycle ────────────────────────────────────────────────────────────

// Creates a new task entry and returns its id and emitter.
export function createTask() {
  const taskId = uuidv4();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(20);

  const task = {
    emitter,
    events: [],
    abortController: new AbortController(),
    status: "pending",
    results: [],
  };
  emitter.on("event", (e) => task.events.push(e));
  tasks.set(taskId, task);

  return { taskId, emitter };
}

// Returns the task for taskId, or null if not found.
export const getTask = (taskId) => tasks.get(taskId) ?? null;

// Signals the task's AbortController and marks the task as cancelling.
export function cancelTask(taskId) {
  const task = tasks.get(taskId);
  if (!task || !["running", "pending"].includes(task.status)) return;
  task.abortController.abort();
  task.status = "cancelling";
}

// ── Manual registration pause/resume ─────────────────────────────────────────

const pendingManual = new Map();

// Stores resolve/reject callbacks so the manual-registration route can unblock the service.
export const setPendingManualDone = (taskId, resolve, reject) =>
  pendingManual.set(taskId, { resolve, reject });

// Signals that the user completed registration. Returns false if no registration is pending.
export const resolvePendingManualDone = (taskId) =>
  popPending(pendingManual, taskId, (e) => e.resolve());

// Signals that the user cancelled registration. Returns false if no registration is pending.
export const rejectPendingManualDone = (taskId, name = "Registration") =>
  popPending(pendingManual, taskId, (e) =>
    e.reject(new Error(`[${name}] Registration cancelled by user.`)),
  );

// ── Legacy aliases ────────────────────────────────────────────────────────────

// Backwards-compatible aliases kept so existing TVBoom service modules stay compatible.
export const setPendingTvboomDone = setPendingManualDone;
export const resolvePendingTvboomDone = resolvePendingManualDone;
export const rejectPendingTvboomDone = (taskId) =>
  rejectPendingManualDone(taskId, "TVBoom");
