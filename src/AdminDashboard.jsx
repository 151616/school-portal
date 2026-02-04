import React, { useState, useEffect } from "react";
import { ref, set, push, onValue, get } from "firebase/database";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase"; // make sure auth is imported
import Toasts from "./Toasts";
import { addToast } from "./toastService";
import ConfirmModal from "./ConfirmModal";
import { CopyIcon, DeleteIcon, LinkIcon, PlusIcon, AlertIcon } from "./icons";
import { firebaseConfig } from "./firebase"; // exported for diagnostics

// Diagnostics helper: logs auth, token claims, DB config, and attempts read/write tests
const runDiagnosticsHelper = async (auth, db, addToast) => {
  console.groupCollapsed('Diagnostics — Admin Dashboard');
  try {
    console.log('Firebase config:', firebaseConfig);
    console.log('DB URL:', firebaseConfig.databaseURL);

    if (!auth || !auth.currentUser) {
      console.warn('Not authenticated: auth.currentUser is null');
      addToast('error', 'Not authenticated — sign in and retry diagnostics');
      console.groupEnd();
      return;
    }

    console.log('Auth currentUser:', { uid: auth.currentUser.uid, email: auth.currentUser.email });

    try {
      const idRes = await auth.currentUser.getIdTokenResult(true);
      console.log('ID token claims:', idRes.claims);
    } catch (err) {
      console.error('Failed to getIdTokenResult:', err);
    }

    // Test read of /Users
    try {
      const usersSnap = await get(ref(db, 'Users'));
      console.log('/Users read: exists=', usersSnap.exists(), 'val=', usersSnap.exists() ? usersSnap.val() : null);
    } catch (err) {
      console.error('Error reading /Users:', err);
    }

    // Test write to a user-scoped diagnostics path (safer — obeys Users write rules)
    try {
      const userDiagRef = ref(db, `Users/${uid}/_diagnostics_test`);
      await set(userDiagRef, { ts: Date.now(), by: uid });
      console.log(`Write to Users/${uid}/_diagnostics_test succeeded. Cleaning up...`);
      await set(userDiagRef, null);
      console.log('User diagnostics write cleanup successful.');
    } catch (err) {
      console.error('Write to Users/<uid>/_diagnostics_test failed:', err);
    }

    // Test write to invites to see if rules block it (cleanup immediately if succeeds)
    try {
      const testRef = push(ref(db, 'invites'));
      const payload = { email: 'diag@local.test', role: 'student', studentId: 'SDEBUG', createdAt: Date.now(), used: false, createdBy: auth.currentUser.uid };
      await set(testRef, payload);
      console.log('Write to invites succeeded (unexpected for non-admin). Cleaning up...');
      await set(testRef, null);
      console.log('Invite cleanup successful.');
    } catch (err) {
      console.error('Write to invites failed (expected if not admin):', err);
    }

    addToast('info', 'Diagnostics complete — check console logs for details');
  } catch (err) {
    console.error('Diagnostics helper error:', err);
    addToast('error', 'Diagnostics encountered an error — check console.');
  } finally {
    console.groupEnd();
  }
};

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [className, setClassName] = useState("");
  const [classTeacherUid, setClassTeacherUid] = useState("");
  const [enrollClassId, setEnrollClassId] = useState("");
  const [enrollStudentId, setEnrollStudentId] = useState("");
  const [activePage, setActivePage] = useState("users");
  const [bulkStudentId, setBulkStudentId] = useState("");
  const [bulkSelectedClasses, setBulkSelectedClasses] = useState({});

  // Diagnostics UI state
  const [diagnostics, setDiagnostics] = useState({
    loading: false,
    authUser: null,
    claims: null,
    usersRead: null,
    usersReadError: null,
    diagWriteError: null,
    inviteWriteError: null,
    note: ''
  });

  // Run a set of diagnostics and update UI state so problems are visible in-page
  const runDiagnostics = async () => {
    setDiagnostics((s) => ({ ...s, loading: true, note: '' }));

    if (!auth || !auth.currentUser) {
      setDiagnostics({ loading: false, note: 'Not authenticated', authUser: null });
      addToast('error', 'Not authenticated — sign in and retry diagnostics');
      return;
    }

    const uid = auth.currentUser.uid;
    const email = auth.currentUser.email;

    let claims = null;
    try {
      const idRes = await auth.currentUser.getIdTokenResult(true);
      claims = idRes.claims || {};
    } catch (err) {
      console.error('Failed to getIdTokenResult:', err);
    }

    // Try reading /Users
    let usersRead = null;
    let usersReadError = null;
    try {
      const usersSnap = await get(ref(db, 'Users'));
      usersRead = usersSnap.exists() ? usersSnap.val() : null;
    } catch (err) {
      usersReadError = err.message || String(err);
      console.error('Error reading /Users:', err);
    }

    // Test write to diagnostics (user-scoped path allowed by rules)
    let diagWriteErr = null;
    try {
      const diagRef = ref(db, `Users/${uid}/_diagnostics_test`);
      await set(diagRef, { ts: Date.now(), by: uid });
      await set(diagRef, null);
    } catch (err) {
      diagWriteErr = err.message || String(err);
      console.error('Write to diagnostics/testWrite failed:', err);
    }

    // Test write to invites
    let inviteWriteErr = null;
    try {
      const testRef = push(ref(db, 'invites'));
      const payload = { email: 'diag@local.test', role: 'student', studentId: 'SDEBUG', createdAt: Date.now(), used: false, createdBy: uid };
      await set(testRef, payload);
      await set(testRef, null);
    } catch (err) {
      inviteWriteErr = err.message || String(err);
      console.error('Write to invites failed (expected if not admin):', err);
    }

    setDiagnostics({
      loading: false,
      authUser: { uid, email },
      claims,
      usersRead,
      usersReadError,
      diagWriteError: diagWriteErr,
      inviteWriteError: inviteWriteErr,
      deployedRules: null,
      deployedRulesError: null,
      note: 'Diagnostics complete'
    });

    addToast('info', 'Diagnostics complete — see the panel below');
  };

  // Refresh ID token (force refresh) and re-run diagnostics
  const refreshTokenAndRun = async () => {
    if (!auth || !auth.currentUser) {
      addToast('error', 'Not signed in');
      return;
    }
    try {
      addToast('info', 'Refreshing token...');
      await auth.currentUser.getIdTokenResult(true);
      addToast('info', 'Token refreshed');
      await runDiagnostics();
    } catch (err) {
      console.error('Error refreshing token:', err);
      addToast('error', 'Token refresh failed');
    }
  };

  // Try to fetch deployed rules (best-effort; may be blocked by permissions)
  const checkDeployedRules = async () => {
    setDiagnostics((s) => ({ ...s, note: 'Checking deployed rules...' }));
    try {
      const dbUrl = firebaseConfig.databaseURL.replace(/\/$/, '');
      const url = `${dbUrl}/.settings/rules.json`;
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = await res.json();
      setDiagnostics((s) => ({ ...s, deployedRules: json, deployedRulesError: null, note: 'Deployed rules fetched' }));
      addToast('success', 'Deployed rules fetched (see panel)');
    } catch (err) {
      console.error('Error fetching deployed rules:', err);
      setDiagnostics((s) => ({ ...s, deployedRules: null, deployedRulesError: err.message || String(err), note: 'Error fetching deployed rules' }));
      addToast('error', 'Unable to fetch deployed rules — check Console or deploy rules');
    }
  };

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const generateStudentId = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  const generateUniqueStudentId = (usersData, invitesData, maxAttempts = 10) => {
    for (let i = 0; i < maxAttempts; i++) {
      const id = generateStudentId();
      const existsInUsers = Object.values(usersData).some((u) => (u.studentId || "") === id);
      const existsInInvites = Object.values(invitesData).some((inv) => (inv.studentId || "") === id);
      if (!existsInUsers && !existsInInvites) return id;
    }
    throw new Error("Unable to generate unique studentId — try again");
  }; 

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesQuery = (value) =>
    !normalizedQuery || String(value || "").toLowerCase().includes(normalizedQuery);

  const filteredUsers = users.filter((u) =>
    matchesQuery(u.email) ||
    matchesQuery(u.role) ||
    matchesQuery(u.studentId) ||
    matchesQuery(u.uid)
  );

  const filteredInvites = invites.filter((i) =>
    matchesQuery(i.email) ||
    matchesQuery(i.role) ||
    matchesQuery(i.studentId) ||
    matchesQuery(i.id)
  );

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

    const classesRef = ref(db, "classes");
    const unsubscribeClasses = onValue(classesRef, (snapshot) => {
      const data = snapshot.val() || {};
      setClasses(Object.entries(data).map(([id, c]) => ({ id, ...c })));
    });

    return () => {
      unsubscribeUsers();
      unsubscribeInvites();
      unsubscribeClasses();
    };
  }, []);



  // Add a new invite
  const handleAddUser = async () => {
    if (!email) {
      addToast('error', 'Enter email!');
      return;
    }

    if (!isValidEmail(email)) {
      addToast('error', 'Invalid email format');
      return;
    }

    if (!auth.currentUser) {
      addToast('error', 'Not logged in!');
      return;
    }

    // Require admin claim to create invites (client-side friendly check)
    try {
      const token = await auth.currentUser.getIdTokenResult();
      if (!token.claims || !token.claims.admin) {
        addToast('error', 'You need admin privileges to create invites.');
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error('Error checking admin claim:', err);
      addToast('error', 'Unable to verify admin privileges');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      //Fetch current Users and invites
      const usersSnap = await get(ref(db, "Users"));
      const usersData = usersSnap.val() || {};

      const invitesSnap = await get(ref(db, "invites"));
      const invitesData = invitesSnap.val() || {};

      const emailLower = email.toLowerCase();

      const emailExistsInUsers = Object.values(usersData).some(
        (u) => (u.email || "").toLowerCase() === emailLower
      );
      if (emailExistsInUsers) {
        addToast('error', 'This email already has an account!');
        setLoading(false);
        return;
      }

      const emailExistsInInvites = Object.values(invitesData).some(
        (i) => ((i.email || "").toLowerCase() === emailLower) && !i.used
      );
      if (emailExistsInInvites) {
        addToast('error', 'An invite for this email already exists!');
        setLoading(false);
        return;
      }

      //Generate a unique student ID
      const studentId = generateUniqueStudentId(usersData, invitesData);

      //Push invite to Firebase including createdBy
      const inviteRef = push(ref(db, "invites"));
      await set(inviteRef, {
        email: emailLower,
        role,
        studentId,
        createdAt: Date.now(),
        used: false,
        createdBy: auth.currentUser.uid,
      });

      //Generate signup link (logged for admin convenience)
      const signupUrl = `${window.location.origin}/signup?inviteId=${inviteRef.key}`;
      console.log('Signup link:', signupUrl);

      addToast('success', `Invite created for ${emailLower}! Student ID: ${studentId}`);

      setEmail(""); // reset input

    } catch (error) {
      console.error("Error creating invite:", error);
      addToast('error', 'Error creating invite: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  }; 

  const handleCreateClass = async () => {
    if (!classId.trim()) {
      addToast("error", "Enter a class ID");
      return;
    }
    if (!className.trim()) {
      addToast("error", "Enter a class name");
      return;
    }
    if (!classTeacherUid) {
      addToast("error", "Select a teacher");
      return;
    }

    const id = classId.trim();
    try {
      const classRef = ref(db, `classes/${id}`);
      const existing = await get(classRef);
      if (existing.exists()) {
        addToast("error", "Class ID already exists");
        return;
      }

      await set(classRef, {
        name: className.trim(),
        teacherUid: classTeacherUid,
        createdAt: Date.now(),
      });

      await set(ref(db, `teachers/${classTeacherUid}/classes/${id}`), true);

      addToast("success", "Class created");
      setClassId("");
      setClassName("");
      setClassTeacherUid("");
    } catch (err) {
      console.error("Error creating class:", err);
      addToast("error", "Error creating class: " + (err.message || err));
    }
  };

  const handleEnrollStudent = async () => {
    if (!enrollClassId) {
      addToast("error", "Select a class");
      return;
    }
    if (!enrollStudentId.trim()) {
      addToast("error", "Enter a student ID");
      return;
    }

    const student = users.find(
      (u) =>
        (u.role || "").toLowerCase() === "student" &&
        String(u.studentId || "").trim() === enrollStudentId.trim()
    );

    if (!student) {
      addToast("error", "Student ID not found");
      return;
    }

    try {
      const studentRef = ref(db, `classes/${enrollClassId}/students/${student.uid}`);
      await set(studentRef, {
        uid: student.uid,
        email: student.email || "",
        firstName: student.firstName || "",
        lastInitial: student.lastInitial || "",
        studentId: student.studentId || "",
      });
      addToast("success", "Student enrolled");
      setEnrollStudentId("");
    } catch (err) {
      console.error("Error enrolling student:", err);
      addToast("error", "Error enrolling student: " + (err.message || err));
    }
  };

  const handleBulkEnroll = async () => {
    if (!bulkStudentId.trim()) {
      addToast("error", "Enter a student ID");
      return;
    }

    const student = users.find(
      (u) =>
        (u.role || "").toLowerCase() === "student" &&
        String(u.studentId || "").trim() === bulkStudentId.trim()
    );

    if (!student) {
      addToast("error", "Student ID not found");
      return;
    }

    const classIds = Object.entries(bulkSelectedClasses)
      .filter(([, selected]) => selected)
      .map(([id]) => id);

    if (classIds.length === 0) {
      addToast("error", "Select at least one class");
      return;
    }

    try {
      await Promise.all(
        classIds.map((id) =>
          set(ref(db, `classes/${id}/students/${student.uid}`), {
            uid: student.uid,
            email: student.email || "",
            firstName: student.firstName || "",
            lastInitial: student.lastInitial || "",
            studentId: student.studentId || "",
          })
        )
      );
      addToast("success", "Student enrolled in selected classes");
      setBulkStudentId("");
      setBulkSelectedClasses({});
    } catch (err) {
      console.error("Error bulk enrolling:", err);
      addToast("error", "Error bulk enrolling: " + (err.message || err));
    }
  };

  // Delete flow using modal confirmation
  const [confirm, setConfirm] = useState({ open: false, uid: null, email: "" });

  const openDeleteConfirm = (uid, email) => setConfirm({ open: true, uid, email });
  const closeConfirm = () => setConfirm({ open: false, uid: null, email: "" });

  const performDeleteUser = async (uid) => {
    if (!uid) return;
    // close modal immediately for a responsive feel
    closeConfirm();
    setDeleting(uid);
    try {
      const functions = getFunctions();
      const deleteUser = httpsCallable(functions, "deleteUserByAdmin");
      await deleteUser({ uid });
      addToast('success', 'User deleted from Auth and DB!');
    } catch (error) {
      console.error("Error deleting user:", error);
      addToast('error', 'Error deleting user: ' + (error.message || error));
    } finally {
      setDeleting(null);
    }
  };  

  return (
    <div className="app-container">
      <div className="card">
        <div className="card-header">
          <h2>Admin Dashboard</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="muted">Manage users and invitations. Create invites, copy links, and remove users safely.</div>
            <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); runDiagnostics(); }} style={{ marginLeft: 10 }}><AlertIcon className="icon"/> Run Diagnostics</button>
          </div>

          {diagnostics && diagnostics.note && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--accent-2, #fff7e6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Diagnostics</strong>
                <div className="small">{diagnostics.loading ? 'Running...' : diagnostics.note}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div><strong>Auth:</strong> {diagnostics.authUser ? `${diagnostics.authUser.email} (${diagnostics.authUser.uid})` : 'Not signed in'}</div>
                  <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); refreshTokenAndRun(); }} style={{ marginLeft: 8 }}>Refresh Token & Re-run</button>
                </div>

                <div><strong>Admin claim:</strong> {diagnostics.claims && diagnostics.claims.admin ? 'Yes' : 'No'}</div>
                <div><strong>/Users read:</strong> {diagnostics.usersReadError ? `Error: ${diagnostics.usersReadError}` : (diagnostics.usersRead ? 'OK' : 'Empty')}</div>
                <div><strong>Diagnostics write:</strong> {diagnostics.diagWriteError ? `Error: ${diagnostics.diagWriteError}` : 'OK'}</div>
                <div><strong>Invites write:</strong> {diagnostics.inviteWriteError ? `Error: ${diagnostics.inviteWriteError}` : 'OK (admin allowed)'}</div>

                <div style={{ marginTop: 10 }}>
                  <strong>Deploy helper:</strong>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-ghost" onClick={() => { const cmd = 'firebase deploy --only database'; navigator.clipboard.writeText(cmd); addToast('success', 'Deploy command copied'); }}>Copy deploy command</button>
                    <button className="btn btn-ghost" onClick={() => window.open(`https://console.firebase.google.com/project/${firebaseConfig.projectId}/database/rules`, '_blank')}>Open Rules Console</button>
                    <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); checkDeployedRules(); }}>Check deployed rules</button>
                  </div>
                  {diagnostics.deployedRulesError && <div className="small" style={{ color: 'var(--danger,#b33)', marginTop: 8 }}>Error fetching deployed rules: {diagnostics.deployedRulesError}</div>}
                  {diagnostics.deployedRules && <pre style={{ marginTop: 8, maxHeight: 200, overflow: 'auto', background: '#fff', padding: 8, borderRadius: 6 }}>{JSON.stringify(diagnostics.deployedRules, null, 2)}</pre>}
                </div>

                {(!diagnostics.claims || !diagnostics.claims.admin) && diagnostics.inviteWriteError && (
                  <div style={{ marginTop: 8, color: '#7a3' }}><em>Hint: Invite writes are blocked. Set admin claim for this user and deploy rules.</em></div>
                )}
              </div>
            </div>
          )}
        </div>

        <Toasts />

        <div className="section">
          <div className="form-row">
            <button
              className={`btn ${activePage === "users" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActivePage("users")}
            >
              Users & Invites
            </button>
            <button
              className={`btn ${activePage === "classes" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActivePage("classes")}
            >
              Classes & Scheduling
            </button>
          </div>
        </div>

        {activePage === "users" && (
          <>
            {/* Add Invite */}
            <div className="section">
              <div className="instructions">Tip: Enter an email and choose a role. Student IDs are generated automatically and checked for uniqueness.</div>

              <div className="form-row">
                <input
                  className="input"
                  type="email"
                  placeholder="User Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>

                <button className="btn btn-primary" onClick={(e) => { const btn = e.currentTarget; btn.classList.add('pulse'); setTimeout(() => btn.classList.remove('pulse'), 260); handleAddUser(); }} disabled={loading}>
                  {loading ? 'Creating...' : (<><PlusIcon className="icon"/> Create Invite</>)}
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="section">
              <div className="instructions">Search users and pending invites by email, role, student ID, or UID.</div>
              <div className="form-row">
                <input
                  className="input"
                  type="text"
                  placeholder="Search users or invites..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button
                  className="btn btn-ghost"
                  onClick={() => setSearchQuery("")}
                  disabled={!searchQuery}
                >
                  Clear
                </button>
              </div>
            </div>
          </>
        )}

        {activePage === "classes" && (
          <>
            {/* Classes */}
            <div className="section">
              <h3>Classes</h3>
              <div className="small">Create classes, assign a teacher, and enroll students by Student ID.</div>

              <div className="form-row" style={{ marginTop: 8 }}>
                <input
                  className="input"
                  type="text"
                  placeholder="Class ID (e.g. math101)"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                />
                <input
                  className="input"
                  type="text"
                  placeholder="Class name"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                />
                <select
                  className="select"
                  value={classTeacherUid}
                  onChange={(e) => setClassTeacherUid(e.target.value)}
                >
                  <option value="">Select teacher</option>
                  {users
                    .filter((u) => (u.role || "").toLowerCase() === "teacher")
                    .map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.email}
                      </option>
                    ))}
                </select>
                <button className="btn btn-primary" onClick={handleCreateClass}>
                  Create Class
                </button>
              </div>

              <div className="form-row" style={{ marginTop: 8 }}>
                <select
                  className="select"
                  value={enrollClassId}
                  onChange={(e) => setEnrollClassId(e.target.value)}
                >
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} — {c.name || "Untitled"}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="text"
                  placeholder="Student ID (6 digits)"
                  value={enrollStudentId}
                  onChange={(e) => setEnrollStudentId(e.target.value)}
                />
                <button className="btn btn-ghost" onClick={handleEnrollStudent}>
                  Enroll Student
                </button>
              </div>
            </div>

            {/* Bulk enroll */}
            <div className="section">
              <h3>Bulk Enroll</h3>
              <div className="small">Pick a student once, then select multiple classes to enroll at once.</div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <input
                  className="input"
                  type="text"
                  placeholder="Student ID (6 digits)"
                  value={bulkStudentId}
                  onChange={(e) => setBulkStudentId(e.target.value)}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                {classes.length === 0 ? (
                  <div className="small">No classes yet.</div>
                ) : (
                  classes.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={!!bulkSelectedClasses[c.id]}
                        onChange={(e) =>
                          setBulkSelectedClasses((prev) => ({
                            ...prev,
                            [c.id]: e.target.checked,
                          }))
                        }
                      />
                      <span>{c.id} — {c.name || "Untitled"}</span>
                    </label>
                  ))
                )}
              </div>

              <button className="btn btn-primary" onClick={handleBulkEnroll} style={{ marginTop: 8 }}>
                Enroll In Selected Classes
              </button>
            </div>
          </>
        )}

        {/* Existing Users */}
        <div className="section">
          <h3>Existing Users</h3>
          <div className="small">You can remove users here. Deleting is permanent.</div>
          <ul className="card-list">
            {filteredUsers.map((u) => (
              <li key={u.uid}>
                <div>
                  <div>{u.email}</div>
                  <div className="meta">{u.role}</div>
                </div>
                <div>
                  <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); openDeleteConfirm(u.uid, u.email); }} disabled={deleting === u.uid}>
                    <DeleteIcon className="icon" /> {deleting === u.uid ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Pending Invites */}
        <div className="section">
          <h3>Pending Invites</h3>
          <div className="small">Active invites can be copied and shared with students.</div>
          <ul className="card-list">
            {filteredInvites.filter((i) => !i.used).map((i) => {
              const signupUrl = `${window.location.origin}/signup?inviteId=${i.id}`;
              return (
                <li key={i.id}>
                  <div>
                    <div>{i.email}</div>
                    <div className="meta">{i.role} · Student ID: {i.studentId}</div>
                  </div>

                  <div>
                    <a href={signupUrl} target="_blank" rel="noreferrer" className="small"><LinkIcon className="icon" /> Signup Link</a>
                    <button
                      className="btn btn-ghost"
                      style={{ marginLeft: 10 }}
                      onClick={async (e) => {
                        const icon = e.currentTarget.querySelector('.icon');
                        if (icon) { icon.classList.add('pulse'); setTimeout(() => icon.classList.remove('pulse'), 260); }
                        try {
                          await navigator.clipboard.writeText(signupUrl);
                          addToast('success', 'Signup link copied');
                        } catch {
                          addToast('error', 'Copy failed');
                        }
                      }}
                    >
                      <CopyIcon className="icon" /> Copy Link
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ marginLeft: 10 }}
                      onClick={async (e) => {
                        const icon = e.currentTarget.querySelector('.icon');
                        if (icon) { icon.classList.add('pulse'); setTimeout(() => icon.classList.remove('pulse'), 260); }
                        try {
                          await navigator.clipboard.writeText(i.studentId || '');
                          addToast('success', 'Student ID copied');
                        } catch {
                          addToast('error', 'Copy failed');
                        }
                      }}
                    >
                      <CopyIcon className="icon" /> Copy ID
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <ConfirmModal 
        open={confirm.open}
        title={`Delete ${confirm.email}?`}
        description={`Are you sure you want to permanently delete this user (${confirm.email})? This action cannot be undone.`}
        onCancel={closeConfirm}
        onConfirm={() => performDeleteUser(confirm.uid)}
      />
    </div>
  );
}
