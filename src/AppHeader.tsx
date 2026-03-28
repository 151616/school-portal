import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
const logo = "/logo.png";
import MessagingPanel from "./MessagingPanel";
import NotificationsMenu from "./NotificationsMenu";
import { LogoutIcon, SettingsIcon } from "./icons";

const roleLabels = {
  student: "Student Portal",
  teacher: "Teacher Workspace",
  admin: "Admin Console",
  parent: "Parent Portal",
};

export default function AppHeader({ currentUser, currentRole, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isSettings = location.pathname === "/settings";

  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <div className="app-brand-block">
          <Link className="app-brand" to="/">
            <img src={logo} alt="KGrades Logo" className="app-brand-logo" />
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
          <button
            className={`header-menu-button icon-only${isSettings ? " is-active" : ""}`}
            type="button"
            onClick={() => navigate(isSettings ? "/" : "/settings")}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon className="icon" />
          </button>
          <button className="header-menu-button" type="button" onClick={onLogout}>
            <LogoutIcon className="icon" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
