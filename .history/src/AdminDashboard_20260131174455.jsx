import React, { useState } from "react";
import { ref, set } from "firebase/database";
import { db } from "./firebase";

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student"); // default

  const handleAddStudent = () => {
    if (!email) return alert("Enter email!");
    
    // Generate a random UID (for testing)
    const uid = "uid_" + Date.now();
    
    set(ref(db, `users/${uid}`), {
      email,
      role
    });
    
    alert("User added!");
    setEmail("");
  };

  return (
    <div style={{ maxWidth: 400, margin: "50px auto" }}>
      <h2>Admin Dashboard</h2>
      <input
        type="email"
        placeholder="Student Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="student">Student</option>
        <option value="teacher">Teacher</option>
      </select>
      <button onClick={handleAddStudent}>Add User</button>
    </div>
  );
}
const handleDeleteStudent = (uid) => {
  if (!uid) return;
  set(ref(db, `users/${uid}`), null); // deleting a node
  alert("User deleted!");
};

