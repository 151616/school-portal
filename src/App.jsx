import React, { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import { onAuthStateChanged, signOut, sendEmailVerification } from "firebase/auth";
import { auth } from "./firebase";
import { ref, onValue } from "firebase/database";
import { db } from "./firebase";

import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import TeacherDashboard from "./TeacherDashboard.jsx";
import StudentDashboard from "./StudentDashboard.jsx";
import AdminDashboard from "./AdminDashboard.jsx"; // optional for admins
import Settings from "./Settings.jsx";
import PrivacyPolicy from "./PrivacyPolicy.jsx";
import { LogoutIcon } from "./icons";
import { addToast } from "./toastService";

function AppShell() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // teacher, student, or admin
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(true);

  useEffect(() => {
    let unsubscribeDB = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
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
      console.log("AUTH UID:", currentUser.uid);
      console.log("AUTH EMAIL:", currentUser.email);
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
            setRole(data.role || null);
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

  const handleLogout = () => {
    signOut(auth).then(() => {
      setUser(null);
      setRole(null);
      setLoading(false);
    });
  };

  const resendVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (error) {
      console.error("Verification email error:", error);
    }
  };

  const refreshVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await auth.currentUser.reload();
      const verified = !!auth.currentUser.emailVerified;
      setEmailVerified(verified);
      if (!verified) {
        await sendEmailVerification(auth.currentUser);
        addToast("info", "Verification not detected yet. Resent the email.");
      }
    } catch (error) {
      console.error("Verification refresh error:", error);
      addToast("error", "Unable to refresh verification. Try again.");
    }
  };

  if (!user) return <Login />;

  if (loading) return <div>Loading... (user: {user?.email})</div>;
  if (!role) {
    return (
      <div style={{ padding: 40 }}>
        <h2>No role assigned</h2>
        <p>Contact an administrator.</p>
        <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); handleLogout(); }}><LogoutIcon className="icon"/> Logout</button>
      </div>
    );
  }

  // Pass `user` as prop to AdminDashboard (and others if needed)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Link className="btn btn-ghost" to="/settings" style={{ margin: 10 }}>Settings</Link>
        <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); handleLogout(); }} style={{ margin: 10 }}><LogoutIcon className="icon"/> Logout</button>
      </div>

      {!emailVerified && (
        <div className="app-container" style={{ marginBottom: 16 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="small">
              Your email is not verified. Please check your inbox for a verification link.
            </div>
            <div className="form-row" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={resendVerification}>Resend Email</button>
              <button className="btn btn-ghost" onClick={refreshVerification}>I Verified</button>
            </div>
          </div>
        </div>
      )}

      {role === "teacher" && <TeacherDashboard user={user} />}
      {role === "student" && <StudentDashboard user={user} />}
      {role === "admin" && <AdminDashboard user={user} />}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "system";
    const apply = (value) => {
      if (value === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", value);
      }
    };
    apply(saved);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const current = localStorage.getItem("theme") || "system";
      if (current === "system") apply("system");
    };
    mq.addEventListener?.("change", handleChange);
    return () => mq.removeEventListener?.("change", handleChange);
  }, []);

  return (
    <Routes>
      <Route path="/signup" element={<Signup />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}
