import React, { useState, useEffect } from "react";
import { ref, set, push, onValue } from "firebase/database";
import { db } from "./firebase";

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student"); // default
  const [users, setUsers] = useState([]);

  // Load all users for display
  useEffect(() => {
    const usersRef = ref(db, "Users");
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const userList = Object.entries(data).map(([uid, u]) => ({
        uid,
        ...u
      }));
      setUsers(userList);
    });
    return () => unsubscribe();
  }, []);

  // Helper: generate random student ID
  const generateStudentId = () =>
    "S" + Math.random().toString(36).slice(2, 10).toUpperCase();

  const handleAddUser = async () => {
    if (!email) return alert("Enter email!");

    const studentId = generateStudentId();

    // Create an invite in "invites"
    const inviteRef = push(ref(db, "invites"));
    await set(inviteRef, {
      email,
      role,
      studentId,
      createdAt: Date.now(),
      used: false
    });

    alert(`Invite created for ${email}!\nStudent ID: ${studentId}`);
    setEmail("");
  };

  const handleDeleteUser = (uid) => {
    if (!uid) return;
    set(ref(db, `Users/${uid}`), null);
    alert("User deleted!");
  };

  return (
    <div style={{ maxWidth: 500, margin: "50px auto" }}>
      <h2>Admin Dashboard</h2>

      <div style={{ marginBottom: 20 }}>
        <input
          type="email"
          placeholder="User Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginRight: 10 }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={handleAddUser} style={{ marginLeft: 10 }}>
          Create Invite
        </button>
      </div>

      <h3>Existing Users</h3>
      <ul>
        {users.map((u) => (
          <li key={u.uid}>
            {u.email} ({u.role}){" "}
            <button
              style={{ marginLeft: 10 }}
              onClick={() => handleDeleteUser(u.uid)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
