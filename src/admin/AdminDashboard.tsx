import { useState, useEffect } from "react";
import { ref, onValue } from "firebase/database";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, db } from "@/firebase";
import AdminUsers from "./AdminUsers";
import AdminClasses from "./AdminClasses";
import AdminDiagnostics from "./AdminDiagnostics";
import AdminCalendar from "./AdminCalendar";
import AdminReportCards from "./AdminReportCards";
import NotificationsMenu from "../NotificationsMenu";
import MessagingPanel from "../messaging/MessagingPanel";
import Settings from "../Settings";
import { LogoutIcon, SettingsIcon } from "@/shared/icons";
import SidebarNav from "@/shared/components/SidebarNav";

// ---- types ----

interface UserRecord {
  uid: string;
  email?: string;
  role?: string;
  studentId?: string;
  firstName?: string;
  lastInitial?: string;
  schoolId?: string;
  [key: string]: unknown;
}

interface InviteRecord {
  id: string;
  email?: string;
  role?: string;
  studentId?: string;
  used?: boolean;
  [key: string]: unknown;
}

interface ClassRecord {
  id: string;
  name?: string;
  teacherUid?: string;
  schoolId?: string;
  students?: Record<string, { uid: string; email?: string; firstName?: string; lastInitial?: string; studentId?: string }>;
  [key: string]: unknown;
}

type ActivePage = "users" | "classes" | "calendar" | "reportcards" | "diagnostics" | "messages" | "settings";

interface AdminDashboardProps {
  user: User;
}

const logo = "/logo.png";

// ---- page titles ----
const pageTitles: Record<ActivePage, string> = {
  users: "Users",
  classes: "Classes",
  calendar: "Academic Calendar",
  reportcards: "Report Cards",
  diagnostics: "Diagnostics",
  messages: "Messages",
  settings: "Settings",
};

// ---- component ----

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [mySchoolId, setMySchoolId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<ActivePage>("users");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const totalUsers = users.length;
  const totalStudents = users.filter((u) => (u.role || "").toLowerCase() === "student").length;
  const totalTeachers = users.filter((u) => (u.role || "").toLowerCase() === "teacher").length;
  const totalAdmins = users.filter((u) => (u.role || "").toLowerCase() === "admin").length;
  const pendingInvites = invites.filter((i) => !i.used).length;
  const classCount = classes.length;

  useEffect(() => {
    const usersRef = ref(db, "Users");
    const unsubUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      setUsers(Object.entries(data).map(([uid, u]) => ({ uid, ...(u as object) })));
    });

    const invitesRef = ref(db, "invites");
    const unsubInvites = onValue(invitesRef, (snapshot) => {
      const data = snapshot.val() || {};
      setInvites(Object.entries(data).map(([id, i]) => ({ id, ...(i as object) })));
    });

    const classesRef = ref(db, "classes");
    const unsubClasses = onValue(classesRef, (snapshot) => {
      const data = snapshot.val() || {};
      setClasses(Object.entries(data).map(([id, c]) => ({ id, ...(c as object) })));
    });

    return () => {
      unsubUsers();
      unsubInvites();
      unsubClasses();
    };
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    auth.currentUser.getIdTokenResult().then((result) => {
      setMySchoolId((result.claims.schoolId as string) || null);
    });
  }, [user]);

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Admin";

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const navItems: { id: string; label: string; icon?: React.ReactNode }[] = [
    { id: "users", label: "Users" },
    { id: "classes", label: "Classes" },
    { id: "calendar", label: "Academic Calendar" },
    { id: "reportcards", label: "Report Cards" },
    { id: "messages", label: "Messages" },
    { id: "diagnostics", label: "Diagnostics" },
    { id: "settings", label: "Settings", icon: <SettingsIcon className="icon" /> },
  ];

  return (
    <div className="admin-layout">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src={logo} alt="KGrades Logo" className="app-brand-logo" />
            <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>KGrades</span>
          </div>

          <SidebarNav
            items={navItems}
            activeId={activePage}
            onSelect={(id) => {
              setActivePage(id as ActivePage);
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
          />
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-user-info">
            <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Admin ({displayName})</div>
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

      {/* Main content */}
      <div className={`admin-main${sidebarOpen ? " sidebar-open" : ""}`}>
        <div className="admin-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>{pageTitles[activePage]}</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationsMenu currentUser={user} />
          </div>
        </div>

        <div className="admin-content">
          <div className="card" style={{ padding: 20 }}>
            {activePage === "users" && <AdminUsers users={users} invites={invites} classes={classes} mySchoolId={mySchoolId} />}
            {activePage === "classes" && <AdminClasses users={users} classes={classes} mySchoolId={mySchoolId} />}
            {activePage === "calendar" && <AdminCalendar mySchoolId={mySchoolId} />}
            {activePage === "reportcards" && <AdminReportCards classes={classes} mySchoolId={mySchoolId} />}
            {activePage === "messages" && (
              <MessagingPanel currentUser={user} currentRole="admin" />
            )}
            {activePage === "diagnostics" && (
              <AdminDiagnostics
                mySchoolId={mySchoolId}
                totalUsers={totalUsers}
                totalStudents={totalStudents}
                totalTeachers={totalTeachers}
                totalAdmins={totalAdmins}
                pendingInvites={pendingInvites}
                classCount={classCount}
              />
            )}
            {activePage === "settings" && <Settings />}
          </div>
        </div>
      </div>
    </div>
  );
}
