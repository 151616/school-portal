import React from "react";
import { Link, useLocation } from "react-router-dom";
import MessagingPanel from "./MessagingPanel";
import NotificationsMenu from "./NotificationsMenu";
import { LogoutIcon, SettingsIcon } from "./icons";

const roleLabels = {
  student: "Student Portal",
  teacher: "Teacher Workspace",
  admin: "Admin Console",
};

export default function AppHeader({ currentUser, currentRole, onLogout }) {
  const location = useLocation();
  const isSettings = location.pathname === "/settings";

  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <div className="app-brand-block">
          <Link className="app-brand" to="/">
            KGrades
          </Link>
          <span className="app-role-chip">{roleLabels[currentRole] || "School Portal"}</span>
        </div>

        <div className="app-actions">
          <span className="app-user-email" title={currentUser?.email || ""}>
            {currentUser?.email || ""}
          </span>
          <NotificationsMenu currentUser={currentUser} />
          <MessagingPanel currentUser={currentUser} currentRole={currentRole} />
          <Link
            className={`header-menu-button icon-only${isSettings ? " is-active" : ""}`}
            to="/settings"
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon className="icon" />
          </Link>
          <button className="header-menu-button" type="button" onClick={onLogout}>
            <LogoutIcon className="icon" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
