import React, { useState, useEffect } from "react";
import { ref, set, push, onValue, get } from "firebase/database";
import { db } from "./firebase";

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    // Load all existing users
    const usersRef = ref(db, "Users");
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      setUsers(Object.entries(data).map(([uid, u]) => ({ uid, ...u })));
    });

    // Load all invites
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

  const generateStudentId = () =>
    "S" + Math.random().toString(36).slice(2, 10).toUpperCase();

const handleAddUser = async () => {
  if (!email) return alert("Enter email!");

  // 1️ Check if this email already has an existing invite
  const invitesSnap = await get(ref(db, "invites"));
  const invitesData = invitesSnap.val() || {};
  const emailExistsInInvites = Object.values(invitesData).some(
    (i) => i.email === email && !i.used
  );
  if (emailExistsInInvites) return alert("An invite for this email already exists!");

  // 2️ Check if this email already has a Users/{uid} record
  const usersSnap = await get(ref(db, "Users"));
  const usersData = usersSnap.val() || {};
  const emailExistsInUsers = Object.values(usersData).some((u) => u.email === email);
  if (emailExistsInUsers) return alert("This email already has an account!");

  // 3️ Generate new student ID
  const studentId = generateStudentId();

  // 4️ Create invite
  const inviteRef = push(ref(db, "invites"));
  await set(inviteRef, {
    email,
    role,
    studentId,
    createdAt: Date.now(),
    used: false
  });

  const signupUrl = `${window.location.origin}/signup?inviteId=${inviteRef.key}`;

  alert(
    `Invite created for ${email}!\nStudent ID: ${studentId}\nSignup Link:\n${signupUrl}`
  );

  setEmail(""); // reset input

  // Add to Pending Invites UI immediately
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
};



  const handleDeleteUser = (uid) => {
    if (!uid) return;
    set(ref(db, `Users/${uid}`), null);
    alert("User deleted!");
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
              onClick={() => handleDeleteUser(u.uid)}
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
            // Generate a clickable link for the signup page
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
