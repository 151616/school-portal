import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, Route, Routes, useOutletContext } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { onValue, ref, update } from "firebase/database";
import { auth, db } from "@/firebase";
import type { UserRole } from "@/types";

import AppSidebar from "./AppSidebar";
import Toasts from "@/shared/components/Toasts";
import { LogoutIcon } from "@/shared/icons";
import { addToast } from "@/shared/toastService";

const Login = lazy(() => import("@/auth/Login"));
const Signup = lazy(() => import("@/auth/Signup"));
const TeacherDashboard = lazy(() => import("./teacher/TeacherDashboard"));
const StudentDashboard = lazy(() => import("./student/StudentDashboard"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard"));
const Settings = lazy(() => import("./Settings"));
const PrivacyPolicy = lazy(() => import("./PrivacyPolicy"));
const ParentSignup = lazy(() => import("@/auth/ParentSignup"));
const ParentDashboard = lazy(() => import("./parent/ParentDashboard"));
const MessagingPanel = lazy(() => import("./messaging/MessagingPanel"));

function RouteFallback() {
  return <div className="app-container">Loading...</div>;
}

const roleNavItems: Record<string, { id: string; label: string }[]> = {
  teacher: [
    { id: "dashboard", label: "Dashboard" },
    { id: "messages", label: "Messages" },
  ],
  student: [
    { id: "dashboard", label: "Dashboard" },
    { id: "messages", label: "Messages" },
  ],
  parent: [
    { id: "dashboard", label: "Dashboard" },
    { id: "messages", label: "Messages" },
  ],
};

const rolePageTitles: Record<string, Record<string, string>> = {
  teacher: { dashboard: "Teacher Workspace", messages: "Messages", settings: "Settings" },
  student: { dashboard: "Student Portal", messages: "Messages", settings: "Settings" },
  parent: { dashboard: "Parent Portal", messages: "Messages", settings: "Settings" },
};

function SidebarDashboard({ user, role }: { user: FirebaseUser; role: UserRole }) {
  const [activePage, setActivePage] = useState("dashboard");

  const navItems = roleNavItems[role] || [{ id: "dashboard", label: "Dashboard" }];
  const titles = rolePageTitles[role] || { dashboard: "Dashboard" };

  return (
    <AppSidebar
      user={user}
      role={role}
      navItems={navItems}
      activePage={activePage}
      onPageChange={setActivePage}
      pageTitle={titles[activePage] || "Dashboard"}
    >
      <div className="card" style={{ padding: 20 }}>
        {activePage === "dashboard" && (
          <>
            {role === "teacher" && <TeacherDashboard user={user} />}
            {role === "student" && <StudentDashboard user={user} />}
            {role === "parent" && <ParentDashboard user={user} />}
          </>
        )}
        {activePage === "messages" && <MessagingPanel currentUser={user} currentRole={role} />}
        {activePage === "settings" && <Settings />}
      </div>
    </AppSidebar>
  );
}

function RoleDashboardRoute() {
  const { user, role } = useOutletContext<{ user: FirebaseUser; role: UserRole }>();

  if (role === "admin") return <AdminDashboard user={user} />;

  return <SidebarDashboard user={user} role={role} />;
}

function AuthenticatedLayout() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let unsubscribeDB: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser: FirebaseUser | null) => {
      if (unsubscribeDB) {
        unsubscribeDB();
        unsubscribeDB = null;
      }

      if (!currentUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      console.log("Logged in user UID:", currentUser.uid);

      const userRef = ref(db, `Users/${currentUser.uid}`);
      unsubscribeDB = onValue(
        userRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            console.warn("No user data found in DB; falling back to auth custom claims");
            (async () => {
              try {
                const tokenResult = await currentUser.getIdTokenResult(true);
                const roleClaimRaw =
                  tokenResult.claims.role ||
                  (tokenResult.claims.admin ? "admin" : undefined) ||
                  (tokenResult.claims.teacher ? "teacher" : undefined) ||
                  (tokenResult.claims.student ? "student" : undefined) ||
                  (tokenResult.claims.parent ? "parent" : undefined);
                const roleClaim =
                  typeof roleClaimRaw === "string"
                    ? (roleClaimRaw.trim().toLowerCase() as UserRole)
                    : null;

                if (roleClaim && ["admin", "teacher", "student", "parent"].includes(roleClaim)) {
                  setRole(roleClaim);
                  await update(ref(db, `Users/${currentUser.uid}`), {
                    email: currentUser.email || "",
                    role: roleClaim,
                  });
                  console.log("Updated DB role from custom claims:", roleClaim);
                } else {
                  setRole(null);
                }
              } catch (authErr) {
                console.warn("Failed to read auth custom claims:", authErr);
                setRole(null);
              } finally {
                setLoading(false);
              }
            })();
            return;
          }

          const data = snapshot.val();
          setRole((data.role as UserRole) || null);
          console.log("User data from DB:", data);
          setLoading(false);
        },
        (error) => {
          console.error("DB error:", error);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeDB) unsubscribeDB();
      unsubscribeAuth();
    };
  }, []);

  const handleLogout = async (): Promise<void> => {
    try {
      await signOut(auth);
      setUser(null);
      setRole(null);
      setLoading(false);
    } catch (error) {
      console.error("Logout error:", error);
      addToast("error", "Unable to log out right now.");
    }
  };

  if (!user) return <Login />;

  if (loading) {
    return (
      <div className="app-container">
        <div className="card">Loading your workspace...</div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="app-container">
        <div className="card">
          <h2>No role assigned</h2>
          <p>Contact an administrator.</p>
          <button
            className="btn btn-ghost"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              const button = e.currentTarget;
              button.classList.add("pulse");
              setTimeout(() => button.classList.remove("pulse"), 260);
              handleLogout();
            }}
          >
            <LogoutIcon className="icon" />
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toasts />
      <Outlet context={{ user, role }} />
    </>
  );
}

export default function App() {
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "system";
    const apply = (value: string): void => {
      if (value === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", value);
      }
    };

    apply(saved);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (): void => {
      const current = localStorage.getItem("theme") || "system";
      if (current === "system") apply("system");
    };

    mq.addEventListener?.("change", handleChange);
    return () => mq.removeEventListener?.("change", handleChange);
  }, []);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/parent-signup" element={<ParentSignup />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route element={<AuthenticatedLayout />}>
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<RoleDashboardRoute />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
