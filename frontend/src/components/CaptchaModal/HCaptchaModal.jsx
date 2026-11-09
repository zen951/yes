/**
 * HCaptchaModal
 *
 * Dedicated modal for hCaptcha challenges.
 *
 * Separated from CaptchaModal intentionally — hCaptcha fires error-callback
 * transiently on the first interaction while the challenge iframe is still
 * initialising. Handling this here lets us silently absorb that first error
 * and auto-retry without showing the user a scary message or blocking the flow.
 *
 * Props:
 *   challenge  { taskId, sitekey, pageUrl, serviceName, provider } | null
 *   onSolved   (taskId, token) => void
 *   onDismiss  () => void
 */
import { useEffect, useRef, useState } from "react";
import { submitCaptchaToken } from "../../services/api.js";
import "./CaptchaModal.css";

let hcWidgetId = null;

export default function HCaptchaModal({ challenge, onSolved, onDismiss }) {
  const containerRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Track how many error-callback fires have happened for this widget mount.
  // hCaptcha reliably fires it once on first interaction before the challenge
  // iframe is ready. We absorb that first hit silently and reset; only
  // subsequent errors are shown to the user.
  const errorCountRef = useRef(0);

  // ── Script injection (once) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById("hcaptcha-sdk")) {
      const s = document.createElement("script");
      s.id = "hcaptcha-sdk";
      s.src =
        "https://js.hcaptcha.com/1/api.js?render=explicit&onload=__hcLoaded";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, []);

  // ── Widget mount / remount on each new challenge ────────────────────────────
  useEffect(() => {
    if (!challenge) return;

    setSubmitting(false);
    setError(null);
    errorCountRef.current = 0;

    const handleToken = async (token) => {
      setSubmitting(true);
      setError(null);
      try {
        await submitCaptchaToken(challenge.taskId, token);
        onSolved?.(challenge.taskId, token);
      } catch (err) {
        setError(`Failed to submit token: ${err.message}`);
        setSubmitting(false);
        if (hcWidgetId !== null) {
          try {
            window.hcaptcha?.reset(hcWidgetId);
          } catch (_) {}
        }
      }
    };

    const handleExpired = () => {
      setError("Token expired — please solve the captcha again.");
      setSubmitting(false);
    };

    const handleError = () => {
      // Absorb the first error silently — hCaptcha fires this transiently
      // on first interaction while the challenge iframe initialises.
      // Reset the widget and let the user click again without seeing an error.
      if (errorCountRef.current === 0) {
        errorCountRef.current += 1;
        if (hcWidgetId !== null) {
          try {
            window.hcaptcha?.reset(hcWidgetId);
          } catch (_) {}
        }
        return;
      }
      // Any subsequent errors are real — show them.
      errorCountRef.current += 1;
      setError("hCaptcha error — please try again.");
      setSubmitting(false);
    };

    const mount = () => {
      if (!containerRef.current || !window.hcaptcha?.render) return;

      if (hcWidgetId !== null) {
        try {
          window.hcaptcha.reset(hcWidgetId);
        } catch (_) {}
        hcWidgetId = null;
      }
      containerRef.current.innerHTML = "";
      errorCountRef.current = 0;

      hcWidgetId = window.hcaptcha.render(containerRef.current, {
        sitekey: challenge.sitekey,
        theme: "dark",
        callback: handleToken,
        "expired-callback": handleExpired,
        "error-callback": handleError,
      });
    };

    if (window.hcaptcha?.render) mount();
    else window.__hcLoaded = mount;
  }, [challenge]);

  if (!challenge) return null;

  return (
    <div
      className="captcha-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Solve hCaptcha"
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
