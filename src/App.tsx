import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, Route, Routes, useOutletContext } from "react-router-dom";
import { onAuthStateChanged, sendEmailVerification, signOut } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { onValue, ref } from "firebase/database";
import { auth, db } from "@/firebase";
import type { UserRole } from "@/types";

import AppHeader from "./AppHeader";
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

function RouteFallback() {
  return <div className="app-container">Loading...</div>;
}

function RoleDashboardRoute() {
  const { user, role } = useOutletContext<{ user: FirebaseUser; role: UserRole }>();

  if (role === "teacher") return <TeacherDashboard user={user} />;
  if (role === "student") return <StudentDashboard user={user} />;
  if (role === "admin") return <AdminDashboard user={user} />;
  if (role === "parent") return <ParentDashboard user={user} />;

  return null;
}

function AuthenticatedLayout() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [emailVerified, setEmailVerified] = useState<boolean>(true);

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
      setEmailVerified(!!currentUser.emailVerified);

      const userRef = ref(db, `Users/${currentUser.uid}`);
      unsubscribeDB = onValue(
        userRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            console.error("No user data found in DB");
            setRole(null);
          } else {
            const data = snapshot.val();
            setRole((data.role as UserRole) || null);
          }
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

  const resendVerification = async (): Promise<void> => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      addToast("info", "Verification email sent.");
    } catch (error) {
      console.error("Verification email error:", error);
      addToast("error", "Unable to send a verification email.");
    }
  };

  const refreshVerification = async (): Promise<void> => {
    if (!auth.currentUser) return;

    try {
      await auth.currentUser.reload();
      const verified = !!auth.currentUser.emailVerified;
      setEmailVerified(verified);

      if (!verified) {
        await sendEmailVerification(auth.currentUser);
        addToast("info", "Verification not detected yet. We resent the email.");
      }
    } catch (error) {
      console.error("Verification refresh error:", error);
      addToast("error", "Unable to refresh verification. Try again.");
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
    <div className="app-shell">
      <Toasts />
      <AppHeader currentUser={user} currentRole={role} onLogout={handleLogout} />

      <main className="app-main">
        {!emailVerified && (
          <div className="app-container">
            <div className="card app-banner-card">
              <div className="small">
                Your email is not verified. Please check your inbox for a verification link.
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={resendVerification}>
                  Resend Email
                </button>
                <button className="btn btn-ghost" onClick={refreshVerification}>
                  I Verified
                </button>
              </div>
            </div>
          </div>
        )}

        <Outlet context={{ user, role }} />
      </main>
    </div>
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
