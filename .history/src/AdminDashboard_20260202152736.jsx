import React, { useState, useEffect } from "react";
import { ref, set, push, onValue, get } from "firebase/database";
import { db, auth } from "./firebase"; // make sure auth is imported

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null); // { type: 'success'|'error'|'info', message }
  const [deleting, setDeleting] = useState(null);

  const showNotification = (type, message, timeout = 4000) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), timeout);
  };

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const generateStudentId = () =>
    "S" + Math.random().toString(36).slice(2, 10).toUpperCase();

  const generateUniqueStudentId = (usersData, invitesData, maxAttempts = 10) => {
    for (let i = 0; i < maxAttempts; i++) {
      const id = generateStudentId();
      const existsInUsers = Object.values(usersData).some((u) => (u.studentId || "") === id);
      const existsInInvites = Object.values(invitesData).some((inv) => (inv.studentId || "") === id);
      if (!existsInUsers && !existsInInvites) return id;
    }
    throw new Error("Unable to generate unique studentId — try again");
  }; 

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



  // Add a new invite
  const handleAddUser = async () => {
    if (!email) {
      showNotification('error', 'Enter email!');
      return;
    }

    if (!isValidEmail(email)) {
      showNotification('error', 'Invalid email format');
      return;
    }

    if (!auth.currentUser) {
      showNotification('error', 'Not logged in!');
      return;
    }

    setLoading(true);
    try {
      // 1️⃣ Fetch current Users and invites
      const usersSnap = await get(ref(db, "Users"));
      const usersData = usersSnap.val() || {};

      const invitesSnap = await get(ref(db, "invites"));
      const invitesData = invitesSnap.val() || {};

      const emailLower = email.toLowerCase();

      const emailExistsInUsers = Object.values(usersData).some(
        (u) => (u.email || "").toLowerCase() === emailLower
      );
      if (emailExistsInUsers) {
        showNotification('error', 'This email already has an account!');
        setLoading(false);
        return;
      }

      const emailExistsInInvites = Object.values(invitesData).some(
        (i) => ((i.email || "").toLowerCase() === emailLower) && !i.used
      );
      if (emailExistsInInvites) {
        showNotification('error', 'An invite for this email already exists!');
        setLoading(false);
        return;
      }

      // 3️⃣ Generate a unique student ID
      const studentId = generateUniqueStudentId(usersData, invitesData);

      // 4️⃣ Push invite to Firebase including createdBy
      const inviteRef = push(ref(db, "invites"));
      await set(inviteRef, {
        email: emailLower,
        role,
        studentId,
        createdAt: Date.now(),
        used: false,
        createdBy: auth.currentUser.uid,
      });

      // 5️⃣ Generate signup link (logged for admin convenience)
      const signupUrl = `${window.location.origin}/signup?inviteId=${inviteRef.key}`;
      console.log('Signup link:', signupUrl);

      showNotification('success', `Invite created for ${emailLower}! Student ID: ${studentId}`);

      setEmail(""); // reset input

      // 6️⃣ Update local state immediately
      setInvites((prev) => [
        ...prev,
        { id: inviteRef.key, email: emailLower, role, studentId, used: false, createdBy: auth.currentUser.uid }
      ]);
    } catch (error) {
      console.error("Error creating invite:", error);
      showNotification('error', 'Error creating invite: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  }; 

  // Delete a user (with confirmation)
  const handleDeleteUser = async (uid) => {
    if (!uid) return;
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    setDeleting(uid);
    try {
      await set(ref(db, `Users/${uid}`), null);
      showNotification('success', 'User deleted!');
    } catch (error) {
      console.error("Error deleting user:", error);
      showNotification('error', 'Error deleting user: ' + (error.message || error));
    } finally {
      setDeleting(null);
    }
  }; 

  return (
    <div style={{ maxWidth: 600, margin: "50px auto" }}>
      <h2>Admin Dashboard</h2>

      {notification && (
        <div
          style={{
            padding: 10,
            marginBottom: 10,
            borderRadius: 4,
            backgroundColor: notification.type === 'success' ? '#d4edda' : notification.type === 'error' ? '#f8d7da' : '#cce5ff',
            color: notification.type === 'success' ? '#155724' : notification.type === 'error' ? '#721c24' : '#004085',
            border: '1px solid rgba(0,0,0,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>{notification.message}</div>
          <button onClick={() => setNotification(null)} style={{ marginLeft: 10 }}>
            Dismiss
          </button>
        </div>
      )}


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
        <button onClick={handleAddUser} style={{ marginLeft: 10 }} disabled={loading}>
          {loading ? 'Creating...' : 'Create Invite'}
        </button> 
      </div>

      {/* Existing Users */}
      <h3>Existing Users</h3>
      <ul>
        {users.map((u) => (
          <li key={u.uid}>
            {u.email} ({u.role}){" "}
            <button style={{ marginLeft: 10 }} onClick={() => handleDeleteUser(u.uid)} disabled={deleting === u.uid}>
              {deleting === u.uid ? 'Deleting...' : 'Delete'}
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
