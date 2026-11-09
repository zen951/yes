import { useState, useMemo } from "react";
import "./ServiceList.css";

function RadioTowerIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronDownIcon({ isCollapsed }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`service-group-chevron${isCollapsed ? " collapsed" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// Known groups with fixed display names and icons.
// Any group id not listed here gets a generated name and a cycling color.
const KNOWN_GROUPS = {
  russian: { name: "Russian Services", icon: FlagIcon },
  trex: { name: "Trex Services", icon: LeafIcon },
  other: { name: "Other Services", icon: GlobeIcon },
};

// Color palette cycled for unknown groups (CSS variable sets).
const DYNAMIC_COLORS = [
  {
    color: "#a78bfa",
    light: "#c4b5fd",
    glow: "rgba(167,139,250,0.28)",
    bg: "rgba(167,139,250,0.08)",
    badgeBg: "rgba(167,139,250,0.14)",
    border: "rgba(167,139,250,0.35)",
    hover: "rgba(167,139,250,0.04)",
  },
  {
    color: "#34d399",
    light: "#6ee7b7",
    glow: "rgba(52,211,153,0.28)",
    bg: "rgba(52,211,153,0.08)",
    badgeBg: "rgba(52,211,153,0.14)",
    border: "rgba(52,211,153,0.35)",
    hover: "rgba(52,211,153,0.04)",
  },
  {
    color: "#fb923c",
    light: "#fdba74",
    glow: "rgba(251,146,60,0.28)",
    bg: "rgba(251,146,60,0.08)",
    badgeBg: "rgba(251,146,60,0.14)",
    border: "rgba(251,146,60,0.35)",
    hover: "rgba(251,146,60,0.04)",
  },
  {
    color: "#38bdf8",
    light: "#7dd3fc",
    glow: "rgba(56,189,248,0.28)",
    bg: "rgba(56,189,248,0.08)",
    badgeBg: "rgba(56,189,248,0.14)",
    border: "rgba(56,189,248,0.35)",
    hover: "rgba(56,189,248,0.04)",
  },
  {
    color: "#f472b6",
    light: "#f9a8d4",
    glow: "rgba(244,114,182,0.28)",
    bg: "rgba(244,114,182,0.08)",
    badgeBg: "rgba(244,114,182,0.14)",
    border: "rgba(244,114,182,0.35)",
    hover: "rgba(244,114,182,0.04)",
  },
];

// Converts a group id like "my-group" → "My Group Services"
function groupIdToName(id) {
  return (
    id
      .split(/[-_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") + " Services"
  );
}

export default function ServiceList({
  services,
  selected,
  onToggle,
  disabled,
}) {
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const groupedServices = useMemo(() => {
    // Collect items into buckets keyed by group id, preserving insertion order.
    const buckets = new Map();
    services.forEach((svc) => {
      const key = svc.group ?? "other";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(svc);
    });

    // Build the final group list. Known groups use fixed config; unknown ones
    // get a generated name, a GlobeIcon fallback, and a cycling color palette.
    let dynamicColorIndex = 0;
    return [...buckets.entries()].map(([id, items]) => {
      const known = KNOWN_GROUPS[id];
      const colorVars = known
        ? null
        : DYNAMIC_COLORS[dynamicColorIndex++ % DYNAMIC_COLORS.length];
      return {
        id,
        name: known?.name ?? groupIdToName(id),
        icon: known?.icon ?? GlobeIcon,
        colorVars,
        items,
      };
    });
  }, [services]);

  const toggleGroup = (groupId) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const allCollapsed =
    groupedServices.length > 0 &&
    groupedServices.every((g) => !!collapsedGroups[g.id]);

  const toggleCollapseAll = () => {
    if (allCollapsed) {
      setCollapsedGroups({});
    } else {
      const next = {};
      groupedServices.forEach((g) => {
        next[g.id] = true;
      });
      setCollapsedGroups(next);
    }
  };

  const handleSelectAll = () => {
    services.forEach((s) => {
      if (!selected.includes(s.id)) onToggle(s.id);
    });
  };

  const handleClearAll = () => {
    selected.forEach((id) => onToggle(id));
  };

  return (
    <div className="service-card">
      <div className="service-card-header">
        <div className="service-header-top-row">
          <div className="service-label-title">
            <span className="service-icon-badge">
              <RadioTowerIcon />
            </span>
            <span>Target Services</span>
          </div>

          <span
            className={`service-count-chip${selected.length === 0 ? " empty" : ""}`}
            title={`${selected.length} of ${services.length} selected`}
          >
            {selected.length}/{services.length}
          </span>
        </div>

        {services.length > 0 && (
          <div className="service-header-actions-row">
            <div className="service-quick-btn-group">
              <button
                className="service-quick-btn"
                onClick={handleSelectAll}
                disabled={disabled || selected.length === services.length}
                title="Select all services"
              >
                All
              </button>
              <button
                className="service-quick-btn"
                onClick={handleClearAll}
                disabled={disabled || selected.length === 0}
                title="Deselect all"
              >
                None
              </button>
            </div>

            <button
              className="service-quick-btn service-collapse-all-btn"
              onClick={toggleCollapseAll}
              title={allCollapsed ? "Expand all groups" : "Collapse all groups"}
            >
              {allCollapsed ? "Expand All" : "Collapse All"}
            </button>
          </div>
        )}
      </div>

      {services.length === 0 ? (
        <div className="service-loading-state">
          <div className="spinner" />
          <span>Discovering registered services…</span>
        </div>
      ) : (
        <>
          <div className="service-list-box">
            {groupedServices.map((group) => {
              const isCollapsed = !!collapsedGroups[group.id];
              const IconComponent = group.icon;
              const groupSelectedCount = group.items.filter((item) =>
                selected.includes(item.id),
              ).length;

              return (
                <div
                  key={group.id}
                  className={`service-group-section group-${group.id}`}
                  style={
                    group.colorVars
                      ? {
                          "--grp-color": group.colorVars.color,
                          "--grp-color-light": group.colorVars.light,
                          "--grp-color-glow": group.colorVars.glow,
                          "--grp-color-bg": group.colorVars.bg,
                          "--grp-color-badge-bg": group.colorVars.badgeBg,
                          "--grp-color-border": group.colorVars.border,
                          "--grp-color-hover": group.colorVars.hover,
                          borderLeft: `3px solid ${group.colorVars.color}`,
                        }
                      : undefined
                  }
                >
                  <div
                    className={`service-group-header${isCollapsed ? " collapsed" : ""}`}
                    onClick={() => toggleGroup(group.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleGroup(group.id);
                      }
                    }}
                  >
                    <div className="service-group-title">
                      <ChevronDownIcon isCollapsed={isCollapsed} />
                      <span className="service-group-icon">
                        <IconComponent />
                      </span>
                      <span className="service-group-name">{group.name}</span>
                    </div>

                    <div className="service-group-badge-wrap">
                      <span
                        className={`service-group-count${groupSelectedCount > 0 ? " active" : ""}`}
                      >
                        {groupSelectedCount}/{group.items.length}
                      </span>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="service-group-items">
                      {group.items.map((svc) => {
                        const isSelected = selected.includes(svc.id);
                        return (
                          <label
                            key={svc.id}
                            className={`service-item-row${isSelected ? " selected" : ""}${disabled ? " disabled" : ""}`}
                          >
                            <input
                              type="checkbox"
                              id={`service-${svc.id}`}
                              className="service-checkbox-input"
                              checked={isSelected}
                              disabled={disabled}
                              onChange={() => onToggle(svc.id)}
                            />
                            <div className="service-checkbox-visual">
                              {isSelected && <CheckIcon />}
                            </div>
                            <div className="service-meta-group">
                              <div className="service-name-text">
                                {svc.name}
                              </div>
                              {svc.url && (
                                <div className="service-url-subtext">
                                  {svc.url.replace(/^https?:\/\//, "")}
                                </div>
                              )}
                            </div>
                            <span className="service-type-badge">
                              {svc.description ?? "IPTV"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selected.length === 0 && (
            <div className="service-empty-warning">
              <span>⚠️ Select at least 1 service to begin</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
