import { useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { auth } from "@/firebase";
import type { UserRole } from "@/types";
import NotificationsMenu from "./NotificationsMenu";
import SidebarNav from "@/shared/components/SidebarNav";
import { LogoutIcon, SettingsIcon } from "@/shared/icons";

const logo = "/logo.png";

interface NavItem {
  id: string;
  label: string;
}

interface AppSidebarProps {
  user: FirebaseUser;
  role: UserRole;
  navItems: NavItem[];
  activePage: string;
  onPageChange: (id: string) => void;
  children: React.ReactNode;
  pageTitle: string;
}

const roleLabels: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  admin: "Admin",
  parent: "Parent",
};

export default function AppSidebar({ user, role, navItems, activePage, onPageChange, children, pageTitle }: AppSidebarProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const displayName = user?.displayName || user?.email?.split("@")[0] || roleLabels[role] || "User";

  const allNavItems = useMemo(() => [
    ...navItems,
    { id: "settings", label: "Settings", icon: <SettingsIcon className="icon" /> },
  ], [navItems]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <div className="admin-layout">
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`admin-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src={logo} alt="KGrades Logo" className="app-brand-logo" />
            <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>KGrades</span>
          </div>

          <SidebarNav
            items={allNavItems}
            activeId={activePage}
            onSelect={(id) => {
              onPageChange(id);
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
          />
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-user-info">
            <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
              {roleLabels[role] || role} ({displayName})
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", wordBreak: "break-all" }}>
              {user?.email || ""}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-logout-btn"
            title="Logout"
          >
            <LogoutIcon className="icon" />
          </button>
        </div>
      </aside>

      {/* Sidebar toggle tab */}
      <button
        className={`sidebar-toggle-tab${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d={sidebarOpen ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className={`admin-main${sidebarOpen ? " sidebar-open" : ""}`}>
        <div className="admin-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>{pageTitle}</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationsMenu currentUser={user} />
          </div>
        </div>

        <div className="admin-content">
          {children}
        </div>
      </div>
    </div>
  );
}
