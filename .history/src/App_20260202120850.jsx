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
    setUser(currentUser);
    console.log("AUTH UID:", currentUser.uid);
console.log("AUTH EMAIL:", currentUser.email);


    if (!currentUser) {
      setRole(null);
      setLoading(false);
      return;
    }

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

    // detach DB listener when auth changes
    return () => unsubscribeDB();
  });

  return () => unsubscribeAuth();
}, []);


  // Handle logout
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
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}


  // Show dashboards based on role
  return (
    <div>
      <button onClick={handleLogout} style={{ float: "right", margin: "10px" }}>
        Logout
      </button>

      {role === "teacher" && <TeacherDashboard />}
      {role === "student" && <StudentDashboard />}
      {role === "admin" && <AdminDashboard />}
    </div>
  );
}
