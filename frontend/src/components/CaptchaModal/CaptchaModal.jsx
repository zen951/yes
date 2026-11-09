/**
 * CaptchaModal
 *
 * Top-level captcha dispatcher. Routes each challenge to the correct
 * dedicated modal based on challenge.provider:
 *
 *   "hcaptcha"  → HCaptchaModal   (hCaptcha)
 *   "recaptcha" → reCAPTCHA v2 inline (default)
 *
 * Props:
 *   challenge  { taskId, sitekey, pageUrl, serviceName, provider } | null
 *   onSolved   (taskId, token) => void   — called after solve + POST
 *   onDismiss  () => void                — "Cancel" button
 */
import { useEffect, useRef, useState } from "react";
import { submitCaptchaToken } from "../../services/api.js";
import HCaptchaModal from "./HCaptchaModal.jsx";
import "./CaptchaModal.css";

// ── reCAPTCHA widget ID (global so it survives re-renders) ─────────────────
let rcWidgetId = null;

export default function CaptchaModal({ challenge, onSolved, onDismiss }) {
  const containerRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Determine whether this instance should handle reCAPTCHA.
  // hCaptcha is delegated to its own component below,
  // but hooks must always run unconditionally — so we gate the side-effects
  // with a boolean rather than returning early before the hooks.
  const isRecaptcha = !challenge || challenge.provider !== "hcaptcha";

  // ── reCAPTCHA script injection (once, idempotent) ─────────────────────────
  useEffect(() => {
    if (!document.getElementById("recaptcha-sdk")) {
      const s = document.createElement("script");
      s.id = "recaptcha-sdk";
      s.src =
        "https://www.google.com/recaptcha/api.js?render=explicit&onload=__rcLoaded";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, []);

  // ── reCAPTCHA widget mount / remount on each new challenge ────────────────
  useEffect(() => {
    // Only active when this component owns the challenge (i.e. reCAPTCHA).
    if (!challenge || !isRecaptcha) return;

    setSubmitting(false);
    setError(null);

    const handleToken = async (token) => {
      setSubmitting(true);
      setError(null);
      try {
        await submitCaptchaToken(challenge.taskId, token);
        onSolved?.(challenge.taskId, token);
      } catch (err) {
        setError(`Failed to submit token: ${err.message}`);
        setSubmitting(false);
        if (rcWidgetId !== null) window.grecaptcha?.reset(rcWidgetId);
      }
    };

    const mountRecaptcha = () => {
      if (!containerRef.current || !window.grecaptcha?.render) return;

      if (rcWidgetId !== null) {
        try {
          window.grecaptcha.reset(rcWidgetId);
        } catch (_) {}
        rcWidgetId = null;
      }
      containerRef.current.innerHTML = "";

      rcWidgetId = window.grecaptcha.render(containerRef.current, {
        sitekey: challenge.sitekey,
        theme: "dark",
        callback: handleToken,
        "expired-callback": () => {
          setError("Token expired — please solve the captcha again.");
          setSubmitting(false);
        },
        "error-callback": () => {
          setError("reCAPTCHA error — check your connection and try again.");
          setSubmitting(false);
        },
      });
    };

    if (window.grecaptcha?.render) {
      mountRecaptcha();
    } else {
      window.__rcLoaded = mountRecaptcha;
    }
  }, [challenge]);

  // ── Delegate to dedicated modals ─────────────────────────────────────────
  // These returns happen AFTER all hooks have been called above.
  if (challenge?.provider === "hcaptcha") {
    return (
      <HCaptchaModal
        challenge={challenge}
        onSolved={onSolved}
        onDismiss={onDismiss}
      />
    );
  }

  if (!challenge) return null;

  return (
    <div
      className="captcha-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Solve CAPTCHA"
    >
      <div className="captcha-modal">
        {/* Header */}
        <div className="captcha-modal-header">
          <div className="captcha-modal-icon">🛡️</div>
          <div>
            <h2 className="captcha-modal-title">Human Verification Required</h2>
            <p className="captcha-modal-sub">
              {challenge.serviceName ?? "This service"} requires a CAPTCHA
              before registering. Solve it below — the automation will resume
              automatically once you're done.
            </p>
          </div>
        </div>

        <div className="captcha-modal-divider" />

        {/* Widget area */}
        <div className="captcha-widget-area">
          <div ref={containerRef} className="captcha-widget-container" />
        </div>

        {/* State feedback */}
        {submitting && (
          <div className="captcha-status submitting">
            <div className="spinner" />
            <span>Submitting token to backend…</span>
          </div>
        )}
        {error && (
          <div className="captcha-status error">
            <span>⚠️ {error}</span>
          </div>
        )}

        <div className="captcha-modal-divider" />

        {/* Footer */}
        <div className="captcha-modal-footer">
          <p className="captcha-footer-note">
            Task ID:{" "}
            <span className="captcha-task-id">
              {challenge.taskId.slice(0, 8)}…
            </span>
          </p>
          <button
            className="captcha-cancel-btn"
            onClick={onDismiss}
            disabled={submitting}
          >
            Cancel Task
          </button>
        </div>
      </div>
    </div>
  );
}
