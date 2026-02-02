import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { ref, onValue } from "firebase/database";
import { db } from "./firebase";

import Login from "./Login.jsx";
import TeacherDashboard from "./TeacherDashboard.jsx";
import StudentDashboard from "./StudentDashboard.jsx";
import AdminDashboard from "./AdminDashboard.jsx"; // optional for admins

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // teacher, student, or admin
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      console.log("AUTH UID:", currentUser.uid);
      console.log("AUTH EMAIL:", currentUser.email);

      const userRef = ref(db, `Users/${currentUser.uid}`);
      const unsubscribeDB = onValue(
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

      return () => unsubscribeDB();
    });

    return () => unsubscribeAuth();
  }, []);

  const handleLogout = () => {
    signOut(auth).then(() => {
      setUser(null);
      setRole(null);
      setLoading(false);
    });
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
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={handleLogout} style={{ margin: 10 }}><LogoutIcon className="icon"/> Logout</button>
      </div>

      {role === "teacher" && <TeacherDashboard user={user} />}
      {role === "student" && <StudentDashboard user={user} />}
      {role === "admin" && <AdminDashboard user={user} />}
    </div>
  );
}
