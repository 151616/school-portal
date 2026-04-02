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

type ActivePage = "users" | "classes" | "calendar" | "reportcards" | "diagnostics" | "messages";

interface AdminDashboardProps {
  user: User;
}

// ---- component ----

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [mySchoolId, setMySchoolId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<ActivePage>("users");

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

  const navItems: { id: ActivePage; label: string }[] = [
    { id: "users", label: "Users" },
    { id: "classes", label: "Classes" },
    { id: "calendar", label: "Academic Calendar" },
    { id: "reportcards", label: "Report Cards" },
    { id: "messages", label: "Messages" },
    { id: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <div className="app-shell" style={{ minHeight: "100vh", display: "flex", gap: 16 }}>
      <aside
        style={{
          width: 240,
          minWidth: 240,
          background: "var(--panel)",
          borderRight: "1px solid rgba(73,54,34,0.08)",
          boxShadow: "0px 0px 25px rgba(0,0,0,0.04)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 12 }}>KGrades</div>
          <div style={{ fontSize: "0.95rem", color: "var(--muted)", marginBottom: 24 }}>
            Admin ({displayName})
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                style={{
                  textAlign: "left",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 12px",
                  cursor: "pointer",
                  background: activePage === item.id ? "var(--primary)" : "transparent",
                  color: activePage === item.id ? "var(--primary-contrast)" : "var(--text)",
                  fontWeight: activePage === item.id ? 700 : 500,
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ marginTop: 20, borderTop: "1px solid rgba(73,54,34,0.12)", paddingTop: 12 }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 8,
              padding: "10px 12px",
              cursor: "pointer",
              background: "var(--danger)",
              color: "var(--primary-contrast)",
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="app-container" style={{ flex: 1, padding: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h2 style={{ margin: 0 }}>Admin Dashboard</h2>
            <button
              style={{
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                background: "var(--info)",
                color: "var(--text)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Notifications {pendingInvites > 0 ? `(${pendingInvites})` : ""}
            </button>
          </div>

          <div className="muted">Manage users and invitations. Create invites, copy links, and remove users safely.</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 16 }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Total users</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{totalUsers}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Active invites</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{pendingInvites}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Class count</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{classCount}</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              background: "var(--panel-strong)",
              border: "1px solid rgba(73,54,34,0.08)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Role distribution</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div
                style={{
                  flex: (totalStudents / Math.max(totalUsers, 1)).toFixed(2),
                  minWidth: 0,
                  height: 12,
                  background: "var(--info)",
                  borderRadius: 999,
                }}
              />
              <div
                style={{
                  flex: (totalTeachers / Math.max(totalUsers, 1)).toFixed(2),
                  minWidth: 0,
                  height: 12,
                  background: "var(--success)",
                  borderRadius: 999,
                }}
              />
              <div
                style={{
                  flex: (totalAdmins / Math.max(totalUsers, 1)).toFixed(2),
                  minWidth: 0,
                  height: 12,
                  background: "var(--primary)",
                  borderRadius: 999,
                }}
              />
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 11 }}>
              <span>Students: {totalStudents}</span>
              <span>Teachers: {totalTeachers}</span>
              <span>Admins: {totalAdmins}</span>
            </div>
          </div>

          {activePage === "users" && <AdminUsers users={users} invites={invites} classes={classes} mySchoolId={mySchoolId} />}
          {activePage === "classes" && <AdminClasses users={users} classes={classes} mySchoolId={mySchoolId} />}
          {activePage === "calendar" && <AdminCalendar mySchoolId={mySchoolId} />}
          {activePage === "reportcards" && <AdminReportCards classes={classes} mySchoolId={mySchoolId} />}
          {activePage === "messages" && (
            <div style={{ padding: 16 }}>
              <h3>Messages</h3>
              <p>No message panel is implemented yet; this will show notifications and chat threads.</p>
            </div>
          )}
          {activePage === "diagnostics" && <AdminDiagnostics mySchoolId={mySchoolId} />}
        </div>
      </main>
    </div>
  );
}
