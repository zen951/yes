import { useState, useEffect, useRef, useMemo } from "react";
import "./LogPanel.css";

function TerminalIcon() {
  return (
    <svg
      className="log-terminal-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function LogEntryRow({ entry }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (_) {}
  };

  return (
    <div
      className={`log-item-row${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title="Click to copy this line"
    >
      <span className="log-timestamp">{entry.time}</span>
      <span className="log-prompt-char">›</span>
      <span className={`log-message ${entry.level || "info"}`}>
        {entry.message}
      </span>
      <span className="log-copy-indicator">{copied ? "✓ Copied" : "⎘"}</span>
    </div>
  );
}

/** Extract service name from a log message like "[Y666] ..." → "Y666" */
function extractServiceTag(message) {
  const match = message.match(/^\[([^\]]+)\]/);
  return match ? match[1] : null;
}

export default function LogPanel({ logs }) {
  const bottomRef = useRef(null);
  const [activeTab, setActiveTab] = useState("all");

  // Collect ordered unique service names from logs
  const serviceTabs = useMemo(() => {
    const seen = new Set();
    const order = [];
    for (const entry of logs) {
      const tag = extractServiceTag(entry.message);
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        order.push(tag);
      }
    }
    return order;
  }, [logs]);

  // Show tabs only when more than one service appears
  const showTabs = serviceTabs.length > 1;

  // If the active tab no longer exists (e.g. after reset), go back to "all"
  useEffect(() => {
    if (activeTab !== "all" && !serviceTabs.includes(activeTab)) {
      setActiveTab("all");
    }
  }, [serviceTabs, activeTab]);

  // Auto-scroll to bottom on new logs for the active tab
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, activeTab]);

  const visibleLogs =
    activeTab === "all"
      ? logs
      : logs.filter((e) => extractServiceTag(e.message) === activeTab);

  return (
    <div className="log-panel-wrapper">
      <div className="log-panel-header">
        <div className="log-panel-left">
          <div className="terminal-dots">
            <span className="dot-circle dot-red" />
            <span className="dot-circle dot-yellow" />
            <span className="dot-circle dot-green" />
          </div>
          <div className="log-panel-title">
            <TerminalIcon />
            <span>Execution Terminal</span>
          </div>
          <span className="log-count-tag">{logs.length} events</span>
        </div>
      </div>

      {showTabs && (
        <div className="log-tabs">
          <button
            className={`log-tab${activeTab === "all" ? " active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All
            <span className="log-tab-count">{logs.length}</span>
          </button>
          {serviceTabs.map((tag) => {
            const count = logs.filter(
              (e) => extractServiceTag(e.message) === tag,
            ).length;
            return (
              <button
                key={tag}
                className={`log-tab${activeTab === tag ? " active" : ""}`}
                onClick={() => setActiveTab(tag)}
              >
                {tag}
                <span className="log-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="log-scroll-area">
        {visibleLogs.length === 0 ? (
          <div className="log-empty-state">
            <span className="log-empty-icon">📟</span>
            <span>
              Live automation stream will appear here when task starts…
            </span>
          </div>
        ) : (
          visibleLogs.map((entry, i) => <LogEntryRow key={i} entry={entry} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
