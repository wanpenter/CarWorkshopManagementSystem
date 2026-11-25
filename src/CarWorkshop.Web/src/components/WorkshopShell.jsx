import { useEffect, useRef, useState } from "react";
import { ConnectionStatus } from "./Shared.jsx";
import WorkshopIcon from "./WorkshopIcon.jsx";
import torqueProLogo from "../assets/torquepro-logo-light.png";

const workshopSections = [
  ["dashboard", "Dashboard"], ["appointments", "Appointments"], ["customers", "Customers"],
  ["vehicles", "Vehicles"], ["services", "Services"], ["parts", "Parts"], ["mechanics", "Mechanics"]
];

export default function WorkshopShell({ user, onLogout, signingOut = false, activeTab, counts, status, mutating, onNavigate, onOpenSettings, children }) {
  const sections = [
    ...workshopSections,
    ...(user?.role === "Admin" ? [["users", "User accounts"], ["audit", "Audit log"]] : []),
    ["account", "My account"]
  ];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    document.getElementById(`${activeTab}-nav`)?.focus();
    const close = (event) => {
      if (event.key === "Escape") { setMenuOpen(false); menuRef.current?.focus(); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen, activeTab]);
  function navigate(target) {
    onNavigate(target);
    setMenuOpen(false);
    window.requestAnimationFrame(() => document.getElementById(`${target}-title`)?.focus());
  }
  const title = sections.find(([id]) => id === activeTab)?.[1] ?? "Dashboard";

  return (
    <div className="workshop-shell is-staff-shell">
      <a className="skip-link" href="#main-content">Skip to workshop records</a>

      <header className="app-header">
        <div className="header-location">
          <button
            ref={menuRef}
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-controls="workshop-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <WorkshopIcon name={menuOpen ? "close" : "menu"} />
          </button>
          <a
            className="app-header-brand"
            href="#dashboard"
            onClick={(event) => { event.preventDefault(); navigate("dashboard"); }}
            aria-label="TorquePro dashboard"
          >
            <span className="app-header-wordmark">
              Torque<span className="app-header-accent">Pro</span>
            </span>
            <span className="app-header-divider" aria-hidden="true" />
            <img
              src={torqueProLogo}
              alt=""
              aria-hidden="true"
              className="app-header-logo"
            />
          </a>
        </div>

        <div className="header-tools">
          <ConnectionStatus status={status} />
          <button
            className="header-settings"
            type="button"
            onClick={onOpenSettings}
            disabled={mutating}
            title={mutating ? "Wait for the current change to finish" : undefined}
          >
            <WorkshopIcon name="settings" />
            <span>API settings</span>
          </button>
          <button
            className="header-settings"
            type="button"
            disabled={mutating}
            title={mutating ? "Wait for the current change to finish" : undefined}
            onClick={onLogout}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`} id="workshop-sidebar">
        <div className="sidebar-caption">Workshop management</div>
        <nav className="section-nav" aria-label="Workshop records">
          {sections.map(([id, label]) => (
            <button
              key={id}
              id={`${id}-nav`}
              className="section-tab"
              type="button"
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <WorkshopIcon name={id} />
              <span>{label}</span>
              {counts[id] !== undefined && <span className="tab-count">{counts[id]}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-footer-dot" />
          <div>
            <strong>{user?.fullName}</strong>
            <span>{user?.role} account</span>
          </div>
        </div>
      </aside>

      <div className="app-surface">
        <div className="workspace-context">
          <div className="context-breadcrumb">
            <span>Workshop</span>
            <span className="breadcrumb-divider" aria-hidden="true">/</span>
            <strong>{title}</strong>
          </div>
          <time dateTime={new Date().toISOString()}>
            {new Intl.DateTimeFormat("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date())}{" "}
            <span className="date-zone">MYT</span>
          </time>
        </div>
        {children}
        <footer className="app-footer">
          <span>TorquePro</span>
          <span>Car Workshop Management System V2</span>
        </footer>
      </div>
    </div>
  );
}
