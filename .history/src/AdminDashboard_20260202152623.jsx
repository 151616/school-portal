import React, { useState, useEffect } from "react";
import { ref, set, push, onValue, get } from "firebase/database";
import { db, auth } from "./firebase"; // make sure auth is imported

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);

  // Load existing users and invites
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

  // Generate student ID
  const generateStudentId = () =>
    "S" + Math.random().toString(36).slice(2, 10).toUpperCase();

  // Add a new invite
  const handleAddUser = async () => {
    if (!email) return alert("Enter email!");

    if (!auth.currentUser) return alert("Not logged in!");

    try {
      // 1️⃣ Check if email already exists in Users
      const usersSnap = await get(ref(db, "Users"));
      const usersData = usersSnap.val() || {};
      const emailLower = email.toLowerCase();
      const emailExistsInUsers = Object.values(usersData).some(
        (u) => (u.email || "").toLowerCase() === emailLower
      );
      if (emailExistsInUsers) return alert("This email already has an account!");

      // 2️⃣ Check if email already has a pending invite
      const invitesSnap = await get(ref(db, "invites"));
      const invitesData = invitesSnap.val() || {};
      const emailExistsInInvites = Object.values(invitesData).some(
        (i) => ((i.email || "").toLowerCase() === emailLower) && !i.used
      );
      if (emailExistsInInvites) return alert("An invite for this email already exists!");

      // 3️⃣ Generate student ID
      const studentId = generateStudentId();

      // 4️⃣ Push invite to Firebase including createdBy: auth.uid
      const inviteRef = push(ref(db, "invites"));
      await set(inviteRef, {
        email: email.toLowerCase(),
        role,
        studentId,
        createdAt: Date.now(),
        used: false,
        createdBy: auth.currentUser.uid,
      });

      // 5️⃣ Generate signup link
      const signupUrl = `${window.location.origin}/signup?inviteId=${inviteRef.key}`;

      alert(
        `Invite created for ${email}!\nStudent ID: ${studentId}\nSignup Link:\n${signupUrl}`
      );

      setEmail(""); // reset input

      // 6️⃣ Update local state immediately
      setInvites((prev) => [
        ...prev,
        { id: inviteRef.key, email, role, studentId, used: false, createdBy: auth.currentUser.uid }
      ]);
    } catch (error) {
      console.error("Error creating invite:", error);
      alert("Error creating invite: " + error.message);
    }
  };

  // Delete a user
  const handleDeleteUser = async (uid) => {
    if (!uid) return;
    try {
      await set(ref(db, `Users/${uid}`), null);
      alert("User deleted!");
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Error deleting user: " + error.message);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "50px auto" }}>
      <h2>Admin Dashboard</h2>

      {/* Add Invite */}
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
            <button style={{ marginLeft: 10 }} onClick={() => handleDeleteUser(u.uid)}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      {/* Pending Invites */}
      <h3>Pending Invites</h3>
      <ul>
        {invites.filter((i) => !i.used).map((i) => {
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
