import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchInfo,
  startAutomation,
  stopAutomation,
  subscribeToTask,
} from "../services/api.js";

export function useAutomation() {
  const [providers, setProviders] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [email, setEmail] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [backendError, setBackendError] = useState(null);
  // captchaChallenge: null | { taskId, sitekey, pageUrl }
  const [captchaChallenge, setCaptchaChallenge] = useState(null);
  // tvboomRegisterChallenge: null | { taskId, registrationUrl, username, password, email }
  const [tvboomRegisterChallenge, setTvboomRegisterChallenge] = useState(null);

  const unsubRef = useRef(null);

  // ── Load providers and services from backend ──────────────────────────────
  useEffect(() => {
    fetchInfo()
      .then((info) => {
        setProviders(info.providers || []);
        setServices(info.services || []);
        if (info.providers?.length) setSelectedProvider(info.providers[0].id);
      })
      .catch((err) => setBackendError(`Cannot reach backend: ${err.message}`));
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const pushLog = useCallback((message, level = "info", time) => {
    setLogs((prev) => [
      ...prev,
      {
        message,
        level,
        time: time
          ? new Date(time).toLocaleTimeString()
          : new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  const toggleService = useCallback((id) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }, []);

  // ── Captcha handlers ──────────────────────────────────────────────────────

  // Called by CaptchaModal after the token was successfully POSTed to the backend.
  const onCaptchaSolved = useCallback(
    (solvedTaskId) => {
      setCaptchaChallenge(null);
    },
    [pushLog],
  );

  // Called when the user clicks "Cancel Task" inside the captcha modal.
  const onCaptchaDismiss = useCallback(() => {
    setCaptchaChallenge(null);
    if (taskId) stopAutomation(taskId).catch(console.error);
    setStatus("cancelled");
    pushLog("Task cancelled by user (CAPTCHA dismissed).", "warn");
  }, [taskId, pushLog]);

  // ── Registration modal handlers (TVBoom) ───────────────────────────────

  // Called by registration modal after the backend confirmed "done".
  const onTvboomRegisterDone = useCallback((challenge) => {
    setTvboomRegisterChallenge(null);
  }, []);

  // Called when the user clicks "Cancel Task" inside the registration modal.
  const onTvboomRegisterDismiss = useCallback(
    (challenge) => {
      const sName = challenge?.serviceName || "Service";
      setTvboomRegisterChallenge(null);
      if (taskId) stopAutomation(taskId).catch(console.error);
      setStatus("cancelled");
      pushLog(
        `Task cancelled by user (${sName} registration dismissed).`,
        "warn",
      );
    },
    [taskId, pushLog],
  );

  // ── Start automation ──────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!selectedProvider || !selectedServices.length) return;

    // Reset state
    setStatus("running");
    setLogs([]);
    setResults([]);
    setEmail(null);
    setTaskId(null);
    setCaptchaChallenge(null);
    setTvboomRegisterChallenge(null);
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    let data;
    try {
      data = await startAutomation(selectedProvider, selectedServices);
    } catch (err) {
      pushLog(`Failed to start: ${err.message}`, "error");
      setStatus("error");
      return;
    }

    if (data.error) {
      pushLog(data.error, "error");
      setStatus("error");
      return;
    }

    setTaskId(data.taskId);
    pushLog(
      `🔌 Connecting to backend | 🆔 Task ${data.taskId.slice(0, 8)}… started`,
    );
    unsubRef.current = subscribeToTask(data.taskId, {
      onLog: (d, ts) => pushLog(d.message, d.level || "info", ts),
      onEmail: (d) => setEmail(d.email),
      onResult: (d) => setResults((prev) => [...prev, d]),
      onError: (d) => pushLog(d.message, "error"),
      // captcha_challenge: pause the task and show the captcha modal
      onCaptcha: (d) => {
        setCaptchaChallenge(d); // { taskId, sitekey, pageUrl }
      },
      // tvboom_register: open the real registration page in a popup
      onTvboomRegister: (d) => {
        pushLog(
          "[TVBoom] 📋 Manual registration required — fill in the popup…",
          "warn",
        );
        setTvboomRegisterChallenge({
          serviceId: "tvboom",
          serviceName: "TVBoom",
          icon: "📺",
          ...d,
        });
      },
      onDone: () => setStatus((prev) => (prev === "running" ? "done" : prev)),
    });
  }, [selectedProvider, selectedServices, pushLog]);

  // ── Stop automation ───────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!taskId) return;
    unsubRef.current?.();
    unsubRef.current = null;
    setCaptchaChallenge(null);
    setTvboomRegisterChallenge(null);
    await stopAutomation(taskId).catch(console.error);
    setStatus("cancelled");
    pushLog("Automation stopped by user.", "warn");
  }, [taskId, pushLog]);

  // Cleanup on unmount
  useEffect(() => () => unsubRef.current?.(), []);

  return {
    // Data
    providers,
    services,
    // Selections
    selectedProvider,
    setSelectedProvider,
    selectedServices,
    toggleService,
    // Runtime state
    status,
    logs,
    results,
    email,
    taskId,
    // Error
    backendError,
    // Captcha
    captchaChallenge,
    onCaptchaSolved,
    onCaptchaDismiss,
    // TVBoom manual registration
    tvboomRegisterChallenge,
    onTvboomRegisterDone,
    onTvboomRegisterDismiss,
    // Actions
    start,
    stop,
  };
}
