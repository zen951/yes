/**
 * engine/events.js
 *
 * Shared event/log helpers and result normalisation for the task runner.
 *
 * Exports:
 *   emit(emitter, type, data)        — fires a typed SSE event
 *   log(emitter, message, level)     — SSE log + server-side logger
 *   buildRecord(service, email, src) — normalises a service result into the UI record shape
 */

import logger from "../logger.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Fires a typed event on the emitter with an ISO timestamp.
export const emit = (emitter, type, data = {}) =>
  emitter.emit("event", { type, data, timestamp: new Date().toISOString() });

// Emits a log event via SSE and also writes to the server-side logger.
export function log(emitter, message, level = "info") {
  emit(emitter, "log", { message, level });
  (logger[level] ?? logger.info).call(logger, message);
}

// ── Result normalisation ──────────────────────────────────────────────────────

// Picks a field from src, returning null if absent.
const pick = (src, key) => src[key] ?? null;

// Wraps a raw service result with task-level metadata (serviceId, name, email,
// timestamp) to produce the shape stored in task.results and sent to the UI.
export const buildRecord = (service, email, src) => ({
  serviceId: service.meta.id,
  service: service.meta.name,
  email,
  username: pick(src, "username"),
  password: pick(src, "password"),
  tvPlaylist: pick(src, "tvPlaylist"),
  vodPlaylist: pick(src, "vodPlaylist"),
  duration: pick(src, "duration"),
  expiresAt: pick(src, "expiresAt"),
  allM3uLinks: src.allM3uLinks ?? (src.tvPlaylist ? [src.tvPlaylist] : []),
  status: src.status ?? "success",
  note: pick(src, "note"),
  timestamp: new Date().toISOString(),
});
