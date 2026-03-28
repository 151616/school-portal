import { useState, useEffect } from "react";
import { ref, onValue } from "firebase/database";
import type { User } from "firebase/auth";
import { auth, db } from "./firebase";
import AdminUsers from "./admin/AdminUsers";
import AdminClasses from "./admin/AdminClasses";
import AdminSettings from "./admin/AdminSettings";
import AdminDiagnostics from "./admin/AdminDiagnostics";

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

type ActivePage = "users" | "classes" | "settings" | "diagnostics";

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

  // Load shared data from Firebase
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

  // Load admin's schoolId from token claims
  useEffect(() => {
    if (!auth.currentUser) return;
    auth.currentUser.getIdTokenResult().then((result) => {
      setMySchoolId((result.claims.schoolId as string) || null);
    });
  }, [user]);

  return (
    <div className="app-container">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Admin Dashboard</h2>
            <div className="muted">
              Manage users and invitations. Create invites, copy links, and remove users safely.
            </div>
          </div>
          {mySchoolId && <span className="app-role-chip">{mySchoolId}</span>}
        </div>

        {/* Tab navigation */}
        <div className="section">
          <div className="form-row">
            <button
              className={`btn ${activePage === "users" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActivePage("users")}
            >
              Users
            </button>
            <button
              className={`btn ${activePage === "classes" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActivePage("classes")}
            >
              Classes &amp; Scheduling
            </button>
            <button
              className={`btn ${activePage === "settings" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActivePage("settings")}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Active sub-component */}
        {activePage === "users" && (
          <AdminUsers
            users={users}
            invites={invites}
            classes={classes}
            mySchoolId={mySchoolId}
          />
        )}

        {activePage === "classes" && (
          <AdminClasses
            users={users}
            classes={classes}
            mySchoolId={mySchoolId}
          />
        )}

        {activePage === "settings" && <AdminSettings />}

        {/* Diagnostics panel + trigger button (always mounted so diagnostics button is always visible) */}
        <AdminDiagnostics mySchoolId={mySchoolId} />
      </div>
    </div>
  );
}
