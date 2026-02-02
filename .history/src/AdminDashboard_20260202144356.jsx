import React, { useState, useEffect } from "react";
import { ref, set, push, onValue, get } from "firebase/database";
import { db } from "./firebase";

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);

  // Load users and invites from Firebase
  useEffect(() => {
    const usersRef = ref(db, "Users");
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      setUsers(Object.entries(data).map(([uid, u]) => ({ uid, ...u })));
    });

    const invitesRef = ref(db, "invites");
    const unsubscribeInvites = onValue(invitesRef, (snapshot) => {
      const data = snapshot.val() || {};
      setInvites(Object.entries(data).map(([id, i]) => ({ id, ...i })));
    });

    return () => {
      unsubscribeUsers();
      unsubscribeInvites();
    };
  }, []);

  // Generate unique student ID
  const generateStudentId = () =>
    "S" + Math.random().toString(36).slice(2, 10).toUpperCase();

  // Sanitize email to use as a Firebase key
  const sanitizeEmail = (email) => email.replace(/\./g, ",");

  // Add a new user invite
  const handleAddUser = async () => {
    if (!email) return alert("Enter email!");

    try {
      const emailKey = sanitizeEmail(email);

      // 1️⃣ Check if email already exists in Users
      const emailSnap = await get(ref(db, `emails/${emailKey}`));
      if (emailSnap.exists()) return alert("This email already has an account!");

      // 2️⃣ Check if email already has a pending invite
      const invitesSnap = await get(ref(db, "invites"));
      const invitesData = invitesSnap.val() || {};
      const emailExistsInInvites = Object.values(invitesData).some(
        (i) => i.email === email && !i.used
      );
      if (emailExistsInInvites)
        return alert("An invite for this email already exists!");

      // 3️⃣ Generate student ID
      const studentId = generateStudentId();

      // 4️⃣ Push invite to Firebase
      const inviteRef = push(ref(db, "invites"));
      await set(inviteRef, {
        email,
        role,
        studentId,
        createdAt: Date.now(),
        used: false
      });

      // 5️⃣ Generate signup link
      const signupUrl = `${window.location.origin}/signup?inviteId=${inviteRef.key}`;

      // 6️⃣ Show alert with link and student ID
      alert(
        `Invite created for ${email}!\nStudent ID: ${studentId}\nSignup Link:\n${signupUrl}`
      );

      setEmail(""); // reset input

      // 7️⃣ Update pending invites UI immediately
      setInvites((prev) => [
        ...prev,
        {
          id: inviteRef.key,
          email,
          role,
          studentId,
          used: false
        }
      ]);
    } catch (error) {
      console.error("Error creating invite:", error);
      alert("Error creating invite: " + error.message);
    }
  };

  // Delete a user
  const handleDeleteUser = async (uid, userEmail) => {
    if (!uid) return;
    try {
      await set(ref(db, `Users/${uid}`), null);
      // Also remove email mapping
      const emailKey = sanitizeEmail(userEmail);
      await set(ref(db, `emails/${emailKey}`), null);

      alert("User deleted!");
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Error deleting user: " + error.message);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "50px auto" }}>
      <h2>Admin Dashboard</h2>

      {/* Add User / Invite */}
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

      {/* Existing Users */}
      <h3>Existing Users</h3>
      <ul>
        {users.map((u) => (
          <li key={u.uid}>
            {u.email} ({u.role}){" "}
            <button
              style={{ marginLeft: 10 }}
              onClick={() => handleDeleteUser(u.uid, u.email)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {/* Pending Invites */}
      <h3>Pending Invites</h3>
      <ul>
        {invites
          .filter((i) => !i.used)
          .map((i) => {
            const signupUrl = `${window.location.origin}/signup?inviteId=${i.id}`;
            return (
              <li key={i.id}>
                {i.email} ({i.role}) - Student ID: {i.studentId}{" "}
                <a href={signupUrl} target="_blank" rel="noreferrer">
                  Signup Link
                </a>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
