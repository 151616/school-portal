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
  const [classTeacherQuery, setClassTeacherQuery] = useState("");
  const [showClassTeacherSuggestions, setShowClassTeacherSuggestions] = useState(false);
  const [enrollClassId, setEnrollClassId] = useState("");
  const [enrollClassQuery, setEnrollClassQuery] = useState("");
  const [enrollStudentQuery, setEnrollStudentQuery] = useState("");
  const [enrollStudentSelectedUid, setEnrollStudentSelectedUid] = useState("");
  const [showEnrollSuggestions, setShowEnrollSuggestions] = useState(false);
  const [showEnrollClassSuggestions, setShowEnrollClassSuggestions] = useState(false);
  const [enrollStudentActive, setEnrollStudentActive] = useState(-1);
  const [activePage, setActivePage] = useState("users");
  const [userSection, setUserSection] = useState("students");
  const [bulkStudentId, setBulkStudentId] = useState("");
  const [bulkSelectedClasses, setBulkSelectedClasses] = useState({});
  const [bulkClassQuery, setBulkClassQuery] = useState("");
  const [showBulkClassSuggestions, setShowBulkClassSuggestions] = useState(false);
  const [multiEnrollMode, setMultiEnrollMode] = useState("class");
  const [multiEnrollClassId, setMultiEnrollClassId] = useState("");
  const [multiEnrollClassQuery, setMultiEnrollClassQuery] = useState("");
  const [multiEnrollTeacherUid, setMultiEnrollTeacherUid] = useState("");
  const [multiEnrollTeacherQuery, setMultiEnrollTeacherQuery] = useState("");
  const [multiSelectedStudents, setMultiSelectedStudents] = useState({});
  const [multiStudentQuery, setMultiStudentQuery] = useState("");
  const [showMultiStudentSuggestions, setShowMultiStudentSuggestions] = useState(false);
  const [showMultiClassSuggestions, setShowMultiClassSuggestions] = useState(false);
  const [showMultiTeacherSuggestions, setShowMultiTeacherSuggestions] = useState(false);
  const [multiStudentActive, setMultiStudentActive] = useState(-1);
  const [rosterClassId, setRosterClassId] = useState("");
  const [rosterClassQuery, setRosterClassQuery] = useState("");
  const [showRosterClassSuggestions, setShowRosterClassSuggestions] = useState(false);
  const [moveTargets, setMoveTargets] = useState({});
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterLimit, setRosterLimit] = useState(50);
  const [rosterSelected, setRosterSelected] = useState({});
  const [rosterBulkTarget, setRosterBulkTarget] = useState("");
  const [userLimits, setUserLimits] = useState({ students: 50, teachers: 50, admins: 50 });
  const [classListLimit, setClassListLimit] = useState(50);
  const [userSort, setUserSort] = useState("email");
  const [classSort, setClassSort] = useState("id");

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

  const formatTeacherLabel = (u) => {
    const first = u.firstName || "";
    const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
    const name = `${first} ${lastInitial}`.trim();
    return name ? `${name} — ${u.email}` : u.email;
  };

  const formatStudentLabel = (u) => {
    const first = u.firstName || "";
    const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
    const name = `${first} ${lastInitial}`.trim();
    const id = u.studentId ? `• ${u.studentId}` : "";
    return name ? `${name} — ${u.email} ${id}`.trim() : `${u.email} ${id}`.trim();
  };

  const formatClassLabel = (c) => `${c.id} — ${c.name || "Untitled"}`;

  const filteredEnrollClasses = classes.filter((c) => {
    const q = enrollClassQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.id.toLowerCase().includes(q) ||
      String(c.name || "").toLowerCase().includes(q)
    );
  }).slice(0, 200);

  const filteredEnrollStudents = users
    .filter((u) => (u.role || "").toLowerCase() === "student")
    .filter((u) => {
      const q = enrollStudentQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        String(u.email || "").toLowerCase().includes(q) ||
        String(u.studentId || "").toLowerCase().includes(q) ||
        String(u.firstName || "").toLowerCase().includes(q) ||
        String(u.lastInitial || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 200);

  const filteredMultiStudents = users
    .filter((u) => (u.role || "").toLowerCase() === "student")
    .filter((u) => {
      const q = multiStudentQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        String(u.email || "").toLowerCase().includes(q) ||
        String(u.studentId || "").toLowerCase().includes(q) ||
        String(u.firstName || "").toLowerCase().includes(q) ||
        String(u.lastInitial || "").toLowerCase().includes(q)
      );
    })
    .filter((u) => !multiSelectedStudents[u.uid])
    .slice(0, 200);

  const filteredMultiTeachers = users
    .filter((u) => (u.role || "").toLowerCase() === "teacher")
    .filter((u) => {
      const q = multiEnrollTeacherQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        String(u.email || "").toLowerCase().includes(q) ||
        String(u.firstName || "").toLowerCase().includes(q) ||
        String(u.lastInitial || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 200);

  const filteredClassTeachers = users
    .filter((u) => (u.role || "").toLowerCase() === "teacher")
    .filter((u) => {
      const q = classTeacherQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        String(u.email || "").toLowerCase().includes(q) ||
        String(u.firstName || "").toLowerCase().includes(q) ||
        String(u.lastInitial || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 200);

  const filteredMultiClasses = classes.filter((c) => {
    const q = multiEnrollClassQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.id.toLowerCase().includes(q) ||
      String(c.name || "").toLowerCase().includes(q)
    );
  }).slice(0, 200);

  const filteredBulkClasses = classes.filter((c) => {
    const q = bulkClassQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.id.toLowerCase().includes(q) ||
      String(c.name || "").toLowerCase().includes(q)
    );
  }).slice(0, 200);

  const filteredRosterClasses = classes.filter((c) => {
    const q = rosterClassQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.id.toLowerCase().includes(q) ||
      String(c.name || "").toLowerCase().includes(q)
    );
  }).slice(0, 200);

  const sortClasses = (list) => {
    const sorted = [...list];
    if (classSort === "name") {
      sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } else if (classSort === "teacher") {
      sorted.sort((a, b) => String(a.teacherUid || "").localeCompare(String(b.teacherUid || "")));
    } else {
      sorted.sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
    }
    return sorted;
  };

  const visibleClasses = sortClasses(classes).slice(0, classListLimit);

  const resolveStudentFromQuery = () => {
    if (enrollStudentSelectedUid) {
      const selected = users.find((u) => u.uid === enrollStudentSelectedUid);
      if (selected) return { student: selected };
    }
    const q = enrollStudentQuery.trim().toLowerCase();
    if (!q) return { student: null, reason: "empty" };

    const exact = users.filter((u) => (u.role || "").toLowerCase() === "student")
      .filter((u) => {
        const email = String(u.email || "").toLowerCase();
        const id = String(u.studentId || "").toLowerCase();
        const label = formatStudentLabel(u).toLowerCase();
        return q === email || q === id || q === label;
      });

    if (exact.length === 1) return { student: exact[0] };
    if (exact.length > 1) return { student: null, reason: "ambiguous" };

    const matches = filteredEnrollStudents;
    if (matches.length === 1) return { student: matches[0] };
    if (matches.length > 1) return { student: null, reason: "ambiguous" };
    return { student: null, reason: "not_found" };
  };

  const resolveClassFromQuery = () => {
    if (enrollClassId) {
      const selected = classes.find((c) => c.id === enrollClassId);
      if (selected) return { classId: selected.id };
    }
    const q = enrollClassQuery.trim().toLowerCase();
    if (!q) return { classId: null, reason: "empty" };
    const exact = classes.filter((c) => {
      const id = c.id.toLowerCase();
      const name = String(c.name || "").toLowerCase();
      const label = formatClassLabel(c).toLowerCase();
      return q === id || q === name || q === label;
    });
    if (exact.length === 1) return { classId: exact[0].id };
    if (exact.length > 1) return { classId: null, reason: "ambiguous" };
    if (filteredEnrollClasses.length === 1) return { classId: filteredEnrollClasses[0].id };
    if (filteredEnrollClasses.length > 1) return { classId: null, reason: "ambiguous" };
    return { classId: null, reason: "not_found" };
  };

  const resolveClassTeacherFromQuery = () => {
    if (classTeacherUid) {
      const selected = users.find((u) => u.uid === classTeacherUid);
      if (selected) return { teacherUid: selected.uid };
    }
    const q = classTeacherQuery.trim().toLowerCase();
    if (!q) return { teacherUid: null, reason: "empty" };
    const matches = filteredClassTeachers;
    if (matches.length === 1) return { teacherUid: matches[0].uid };
    if (matches.length > 1) return { teacherUid: null, reason: "ambiguous" };
    return { teacherUid: null, reason: "not_found" };
  };

  const resolveMultiClassFromQuery = () => {
    if (multiEnrollClassId) {
      const selected = classes.find((c) => c.id === multiEnrollClassId);
      if (selected) return { classId: selected.id };
    }
    const q = multiEnrollClassQuery.trim().toLowerCase();
    if (!q) return { classId: null, reason: "empty" };
    if (filteredMultiClasses.length === 1) return { classId: filteredMultiClasses[0].id };
    if (filteredMultiClasses.length > 1) return { classId: null, reason: "ambiguous" };
    return { classId: null, reason: "not_found" };
  };

  const resolveMultiTeacherFromQuery = () => {
    if (multiEnrollTeacherUid) {
      const selected = users.find((u) => u.uid === multiEnrollTeacherUid);
      if (selected) return { teacherUid: selected.uid };
    }
    const q = multiEnrollTeacherQuery.trim().toLowerCase();
    if (!q) return { teacherUid: null, reason: "empty" };
    if (filteredMultiTeachers.length === 1) return { teacherUid: filteredMultiTeachers[0].uid };
    if (filteredMultiTeachers.length > 1) return { teacherUid: null, reason: "ambiguous" };
    return { teacherUid: null, reason: "not_found" };
  };

  const sortUsers = (list) => {
    const sorted = [...list];
    if (userSort === "name") {
      sorted.sort((a, b) => {
        const an = `${a.firstName || ""} ${a.lastInitial || ""}`.trim().toLowerCase();
        const bn = `${b.firstName || ""} ${b.lastInitial || ""}`.trim().toLowerCase();
        return an.localeCompare(bn) || String(a.email || "").localeCompare(String(b.email || ""));
      });
    } else if (userSort === "studentId") {
      sorted.sort((a, b) => String(a.studentId || "").localeCompare(String(b.studentId || "")));
    } else {
      sorted.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    }
    return sorted;
  };

  const userStudents = sortUsers(filteredUsers.filter((u) => (u.role || "").toLowerCase() === "student"));
  const userTeachers = sortUsers(filteredUsers.filter((u) => (u.role || "").toLowerCase() === "teacher"));
  const userAdmins = sortUsers(filteredUsers.filter((u) => (u.role || "").toLowerCase() === "admin"));
  const visibleStudents = userStudents.slice(0, userLimits.students);
  const visibleTeachers = userTeachers.slice(0, userLimits.teachers);
  const visibleAdmins = userAdmins.slice(0, userLimits.admins);

  const inviteStudents = filteredInvites.filter((i) => !i.used && (i.role || "").toLowerCase() === "student");
  const inviteTeachers = filteredInvites.filter((i) => !i.used && (i.role || "").toLowerCase() === "teacher");
  const inviteAdmins = filteredInvites.filter((i) => !i.used && (i.role || "").toLowerCase() === "admin");

  const rosterClass = classes.find((c) => c.id === rosterClassId) || null;
  const rosterStudents = rosterClass && rosterClass.students
    ? Object.values(rosterClass.students)
    : [];

  const filteredRoster = rosterStudents
    .filter((s) => {
      const q = rosterSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        String(s.email || "").toLowerCase().includes(q) ||
        String(s.studentId || "").toLowerCase().includes(q) ||
        String(s.firstName || "").toLowerCase().includes(q) ||
        String(s.lastInitial || "").toLowerCase().includes(q)
      );
    })
    .slice(0, rosterLimit);

  const totalRosterCount = rosterStudents.filter((s) => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(s.email || "").toLowerCase().includes(q) ||
      String(s.studentId || "").toLowerCase().includes(q) ||
      String(s.firstName || "").toLowerCase().includes(q) ||
      String(s.lastInitial || "").toLowerCase().includes(q)
    );
  }).length;

  const handleRemoveFromClass = async (classId, uid) => {
    try {
      await set(ref(db, `classes/${classId}/students/${uid}`), null);
      addToast("success", "Student removed from class");
    } catch (err) {
      console.error("Error removing student:", err);
      addToast("error", "Error removing student: " + (err.message || err));
    }
  };

  const handleMoveStudent = async (fromClassId, uid) => {
    const targetClassId = moveTargets[uid];
    if (!targetClassId) {
      addToast("error", "Select a destination class");
      return;
    }
    if (targetClassId === fromClassId) {
      addToast("error", "Destination must be different");
      return;
    }

    const student = users.find((u) => u.uid === uid);
      if (!student) {
        addToast("error", "Student not found");
        return;
      }

    try {
      await set(ref(db, `classes/${targetClassId}/students/${uid}`), {
        uid,
        email: student.email || "",
        firstName: student.firstName || "",
        lastInitial: student.lastInitial || "",
        studentId: student.studentId || "",
      });
      await set(ref(db, `classes/${fromClassId}/students/${uid}`), null);
      addToast("success", "Student moved");
      setMoveTargets((prev) => ({ ...prev, [uid]: "" }));
    } catch (err) {
      console.error("Error moving student:", err);
      addToast("error", "Error moving student: " + (err.message || err));
    }
  };

  const handleBulkRemove = async () => {
    const selectedUids = Object.entries(rosterSelected)
      .filter(([, selected]) => selected)
      .map(([uid]) => uid);
    if (selectedUids.length === 0) {
      addToast("error", "Select at least one student");
      return;
    }

    try {
      await Promise.all(
        selectedUids.map((uid) =>
          set(ref(db, `classes/${rosterClassId}/students/${uid}`), null)
        )
      );
      addToast("success", "Students removed");
      setRosterSelected({});
    } catch (err) {
      console.error("Error bulk removing:", err);
      addToast("error", "Error bulk removing: " + (err.message || err));
    }
  };

  const handleBulkMove = async () => {
    const selectedUids = Object.entries(rosterSelected)
      .filter(([, selected]) => selected)
      .map(([uid]) => uid);
    if (selectedUids.length === 0) {
      addToast("error", "Select at least one student");
      return;
    }
    if (!rosterBulkTarget) {
      addToast("error", "Select a destination class");
      return;
    }
    if (rosterBulkTarget === rosterClassId) {
      addToast("error", "Destination must be different");
      return;
    }

    try {
      const studentMap = users.reduce((acc, u) => {
        acc[u.uid] = u;
        return acc;
      }, {});

      await Promise.all(
        selectedUids.map((uid) => {
          const student = studentMap[uid];
          if (!student) return null;
          return set(ref(db, `classes/${rosterBulkTarget}/students/${uid}`), {
            uid,
            email: student.email || "",
            firstName: student.firstName || "",
            lastInitial: student.lastInitial || "",
            studentId: student.studentId || "",
          });
        }).filter(Boolean)
      );
      await Promise.all(
        selectedUids.map((uid) =>
          set(ref(db, `classes/${rosterClassId}/students/${uid}`), null)
        )
      );
      addToast("success", "Students moved");
      setRosterSelected({});
      setRosterBulkTarget("");
    } catch (err) {
      console.error("Error bulk moving:", err);
      addToast("error", "Error bulk moving: " + (err.message || err));
    }
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin_user_limits");
      if (saved) setUserLimits(JSON.parse(saved));
      const savedClass = localStorage.getItem("admin_class_limit");
      if (savedClass) setClassListLimit(Number(savedClass));
      const savedUserSort = localStorage.getItem("admin_user_sort");
      if (savedUserSort) setUserSort(savedUserSort);
      const savedClassSort = localStorage.getItem("admin_class_sort");
      if (savedClassSort) setClassSort(savedClassSort);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("admin_user_limits", JSON.stringify(userLimits));
      localStorage.setItem("admin_class_limit", String(classListLimit));
      localStorage.setItem("admin_user_sort", userSort);
      localStorage.setItem("admin_class_sort", classSort);
    } catch {
      // ignore storage errors
    }
  }, [userLimits, classListLimit, userSort, classSort]);



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
    const { teacherUid, reason } = resolveClassTeacherFromQuery();
    if (!teacherUid) {
      if (reason === "empty") addToast("error", "Select a teacher");
      else if (reason === "ambiguous") addToast("error", "Multiple teachers match — type more");
      else addToast("error", "Teacher not found");
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
        teacherUid,
        createdAt: Date.now(),
      });

      await set(ref(db, `teachers/${teacherUid}/classes/${id}`), true);

      addToast("success", "Class created");
      setClassId("");
      setClassName("");
      setClassTeacherUid("");
      setClassTeacherQuery("");
    } catch (err) {
      console.error("Error creating class:", err);
      addToast("error", "Error creating class: " + (err.message || err));
    }
  };

  const handleEnrollStudent = async () => {
    const { classId: resolvedClassId, reason: classReason } = resolveClassFromQuery();
    if (!resolvedClassId) {
      if (classReason === "empty") addToast("error", "Select a class");
      else if (classReason === "ambiguous") addToast("error", "Multiple classes match — type more");
      else addToast("error", "Class not found");
      return;
    }
    const { student, reason } = resolveStudentFromQuery();
    if (!student) {
      if (reason === "empty") addToast("error", "Type a student name, email, or ID");
      else if (reason === "ambiguous") addToast("error", "Multiple matches — type more to narrow it down");
      else addToast("error", "Student not found");
      return;
    }

    const classObj = classes.find((c) => c.id === resolvedClassId);
    if (classObj && classObj.students && classObj.students[student.uid]) {
      addToast("error", "Student is already enrolled in this class");
      return;
    }

    try {
      const studentRef = ref(db, `classes/${resolvedClassId}/students/${student.uid}`);
      await set(studentRef, {
        uid: student.uid,
        email: student.email || "",
        firstName: student.firstName || "",
        lastInitial: student.lastInitial || "",
        studentId: student.studentId || "",
      });
      addToast("success", "Student enrolled");
      setEnrollStudentQuery("");
      setEnrollClassQuery("");
      setEnrollClassId("");
      setEnrollStudentSelectedUid("");
      setShowEnrollSuggestions(false);
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
      let skipped = 0;
      const writes = classIds
        .filter((id) => {
          const c = classes.find((x) => x.id === id);
          if (c && c.students && c.students[student.uid]) {
            skipped += 1;
            return false;
          }
          return true;
        })
        .map((id) =>
          set(ref(db, `classes/${id}/students/${student.uid}`), {
            uid: student.uid,
            email: student.email || "",
            firstName: student.firstName || "",
            lastInitial: student.lastInitial || "",
            studentId: student.studentId || "",
          })
        );
      if (writes.length > 0) {
        await Promise.all(writes);
      }
      if (skipped > 0 && writes.length > 0) {
        addToast("info", `Enrolled in ${writes.length} classes, skipped ${skipped} already enrolled`);
      } else if (skipped > 0 && writes.length === 0) {
        addToast("error", "Student already enrolled in all selected classes");
      } else {
        addToast("success", "Student enrolled in selected classes");
      }
      setBulkStudentId("");
      setBulkSelectedClasses({});
    } catch (err) {
      console.error("Error bulk enrolling:", err);
      addToast("error", "Error bulk enrolling: " + (err.message || err));
    }
  };

  const handleMultiEnroll = async () => {
    const selectedStudentUids = Object.entries(multiSelectedStudents)
      .filter(([, selected]) => selected)
      .map(([uid]) => uid);

    if (selectedStudentUids.length === 0) {
      addToast("error", "Select at least one student");
      return;
    }

    let targetClassIds = [];
    if (multiEnrollMode === "class") {
      const { classId, reason } = resolveMultiClassFromQuery();
      if (!classId) {
        if (reason === "empty") addToast("error", "Select a class");
        else if (reason === "ambiguous") addToast("error", "Multiple classes match — type more");
        else addToast("error", "Class not found");
        return;
      }
      targetClassIds = [classId];
    } else {
      const { teacherUid, reason } = resolveMultiTeacherFromQuery();
      if (!teacherUid) {
        if (reason === "empty") addToast("error", "Select a teacher");
        else if (reason === "ambiguous") addToast("error", "Multiple teachers match — type more");
        else addToast("error", "Teacher not found");
        return;
      }
      targetClassIds = classes
        .filter((c) => c.teacherUid === teacherUid)
        .map((c) => c.id);
      if (targetClassIds.length === 0) {
        addToast("error", "No classes found for that teacher");
        return;
      }
    }

    const studentMap = users
      .filter((u) => selectedStudentUids.includes(u.uid))
      .reduce((acc, u) => {
        acc[u.uid] = u;
        return acc;
      }, {});

    try {
      const writes = [];
      let skipped = 0;
      targetClassIds.forEach((classId) => {
        selectedStudentUids.forEach((uid) => {
          const c = classes.find((x) => x.id === classId);
          if (c && c.students && c.students[uid]) {
            skipped += 1;
            return;
          }
          const student = studentMap[uid];
          if (!student) return;
          writes.push(
            set(ref(db, `classes/${classId}/students/${uid}`), {
              uid,
              email: student.email || "",
              firstName: student.firstName || "",
              lastInitial: student.lastInitial || "",
              studentId: student.studentId || "",
            })
          );
        });
      });

      if (writes.length > 0) {
        await Promise.all(writes);
      }
      if (skipped > 0 && writes.length > 0) {
        addToast("info", `Enrolled ${writes.length}, skipped ${skipped} already enrolled`);
      } else if (skipped > 0 && writes.length === 0) {
        addToast("error", "All selected students are already enrolled");
      } else {
        addToast("success", "Students enrolled");
      }
      setMultiSelectedStudents({});
    } catch (err) {
      console.error("Error enrolling students:", err);
      addToast("error", "Error enrolling students: " + (err.message || err));
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
              Users
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
            <div className="section">
              <div className="form-row">
                <button
                  className={`btn ${userSection === "students" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => { setUserSection("students"); setRole("student"); }}
                >
                  Students
                </button>
                <button
                  className={`btn ${userSection === "teachers" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => { setUserSection("teachers"); setRole("teacher"); }}
                >
                  Teachers
                </button>
                <button
                  className={`btn ${userSection === "admins" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => { setUserSection("admins"); setRole("admin"); }}
                >
                  Admins
                </button>
              </div>
            </div>
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
                  {userSection === "students" && <option value="student">Student</option>}
                  {userSection === "teachers" && <option value="teacher">Teacher</option>}
                  {userSection === "admins" && <option value="admin">Admin</option>}
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

              <div className="small" style={{ marginTop: 16 }}>Enrollment</div>
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
                <div className="autocomplete">
                  <input
                    className="input"
                    type="text"
                    placeholder="Select teacher (name or email)"
                    value={classTeacherQuery}
                    onChange={(e) => {
                      setClassTeacherQuery(e.target.value);
                      setClassTeacherUid("");
                      setShowClassTeacherSuggestions(true);
                    }}
                    onFocus={() => setShowClassTeacherSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowClassTeacherSuggestions(false), 120)}
                  />
                  {showClassTeacherSuggestions && filteredClassTeachers.length > 0 && (
                    <div className="autocomplete-menu" role="listbox">
                      {filteredClassTeachers.map((u) => (
                        <button
                          key={u.uid}
                          type="button"
                          className="autocomplete-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setClassTeacherQuery(formatTeacherLabel(u));
                            setClassTeacherUid(u.uid);
                            setShowClassTeacherSuggestions(false);
                          }}
                        >
                          <span className="autocomplete-primary">
                            {u.firstName || "Teacher"} {u.lastInitial ? `${u.lastInitial}.` : ""}
                          </span>
                          <span className="autocomplete-secondary">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <button className="btn btn-primary" onClick={handleCreateClass}>
                  Create Class
                </button>
              </div>

              <div className="section">
                <div className="small">Classes List</div>
                {classes.length === 0 ? (
                  <div className="small" style={{ marginTop: 6 }}>No classes yet.</div>
                ) : (
                  <ul className="card-list" style={{ marginTop: 8 }}>
                    {visibleClasses.map((c) => (
                      <li key={c.id}>
                        <div>
                          <div>{c.id}</div>
                          <div className="meta">{c.name || "Untitled"}</div>
                        </div>
                        <div className="small">
                          {c.teacherUid ? `Teacher UID: ${c.teacherUid}` : "No teacher"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {classes.length > visibleClasses.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setClassListLimit((n) => n + 50)}
                  >
                    Show more ({visibleClasses.length}/{classes.length})
                  </button>
                )}
              </div>

              <div className="small" style={{ marginTop: 16 }}>Enrollment</div>
              <div className="form-row enroll-row" style={{ marginTop: 8 }}>
                <div className="autocomplete enroll-field">
                  <input
                    className="input"
                    type="text"
                    placeholder="Select class (type to filter)"
                    value={enrollClassQuery}
                    onChange={(e) => {
                      setEnrollClassQuery(e.target.value);
                      setEnrollClassId("");
                      setShowEnrollClassSuggestions(true);
                    }}
                    onFocus={() => setShowEnrollClassSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowEnrollClassSuggestions(false), 120)}
                  />
                  {showEnrollClassSuggestions && filteredEnrollClasses.length > 0 && (
                    <div className="autocomplete-menu" role="listbox">
                      {filteredEnrollClasses.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="autocomplete-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setEnrollClassQuery(formatClassLabel(c));
                            setEnrollClassId(c.id);
                            setShowEnrollClassSuggestions(false);
                          }}
                        >
                          <span className="autocomplete-primary">{c.id}</span>
                          <span className="autocomplete-secondary">{c.name || "Untitled"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="autocomplete enroll-field">
                  <input
                    className="input"
                    type="text"
                    placeholder="Start typing a student (name, email, ID)"
                    value={enrollStudentQuery}
                    onChange={(e) => {
                      setEnrollStudentQuery(e.target.value);
                      setEnrollStudentSelectedUid("");
                      setShowEnrollSuggestions(true);
                      setEnrollStudentActive(-1);
                    }}
                    onFocus={() => setShowEnrollSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowEnrollSuggestions(false), 120)}
                    onKeyDown={(e) => {
                      if (!showEnrollSuggestions || filteredEnrollStudents.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setEnrollStudentActive((i) =>
                          i < filteredEnrollStudents.length - 1 ? i + 1 : 0
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setEnrollStudentActive((i) =>
                          i > 0 ? i - 1 : filteredEnrollStudents.length - 1
                        );
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const idx = enrollStudentActive;
                        const u =
                          idx >= 0 ? filteredEnrollStudents[idx] : filteredEnrollStudents[0];
                        if (u) {
                          setEnrollStudentQuery(formatStudentLabel(u));
                          setEnrollStudentSelectedUid(u.uid);
                          setShowEnrollSuggestions(false);
                        }
                      }
                    }}
                  />
                  {showEnrollSuggestions && filteredEnrollStudents.length > 0 && (
                    <div className="autocomplete-menu" role="listbox">
                      {filteredEnrollStudents.map((u, idx) => (
                        <button
                          key={u.uid}
                          type="button"
                          className={`autocomplete-item${enrollStudentActive === idx ? " active" : ""}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setEnrollStudentQuery(formatStudentLabel(u));
                            setEnrollStudentSelectedUid(u.uid);
                            setShowEnrollSuggestions(false);
                          }}
                        >
                          <span className="autocomplete-primary">
                            {u.firstName || "Student"} {u.lastInitial ? `${u.lastInitial}.` : ""}
                          </span>
                          <span className="autocomplete-secondary">
                            {u.email} {u.studentId ? `• ${u.studentId}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={handleEnrollStudent}>
                  Enroll Student
                </button>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="small">Bulk Enroll (one student → many classes)</div>
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

              <div className="form-row" style={{ marginTop: 8 }}>
                <div className="autocomplete">
                  <input
                    className="input"
                    type="text"
                    placeholder="Add class (type to filter)"
                    value={bulkClassQuery}
                    onChange={(e) => {
                      setBulkClassQuery(e.target.value);
                      setShowBulkClassSuggestions(true);
                    }}
                    onFocus={() => setShowBulkClassSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowBulkClassSuggestions(false), 120)}
                  />
                  {showBulkClassSuggestions && filteredBulkClasses.length > 0 && (
                    <div className="autocomplete-menu" role="listbox">
                      {filteredBulkClasses.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="autocomplete-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setBulkSelectedClasses((prev) => ({ ...prev, [c.id]: true }));
                            setBulkClassQuery("");
                            setShowBulkClassSuggestions(false);
                          }}
                        >
                          <span className="autocomplete-primary">{c.id}</span>
                          <span className="autocomplete-secondary">{c.name || "Untitled"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 8 }}>
                {Object.keys(bulkSelectedClasses).length === 0 ? (
                  <div className="small">No classes selected yet.</div>
                ) : (
                  Object.keys(bulkSelectedClasses).map((id) => {
                    const c = classes.find((x) => x.id === id);
                    if (!c) return null;
                    return (
                      <div key={id} className="small" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span>{formatClassLabel(c)}</span>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            setBulkSelectedClasses((prev) => {
                              const next = { ...prev };
                              delete next[id];
                              return next;
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <button className="btn btn-primary" onClick={handleBulkEnroll} style={{ marginTop: 8 }}>
                Enroll In Selected Classes
              </button>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="small">Multi-Student Enroll</div>
                <div className="small">Select a class or teacher, then enroll multiple students at once.</div>

              <div className="form-row" style={{ marginTop: 8 }}>
                <select
                  className="select"
                  value={multiEnrollMode}
                  onChange={(e) => setMultiEnrollMode(e.target.value)}
                >
                  <option value="class">Enroll into one class</option>
                  <option value="teacher">Enroll into a teacher's classes</option>
                </select>

                {multiEnrollMode === "class" ? (
                  <div className="autocomplete">
                    <input
                      className="input"
                      type="text"
                      placeholder="Select class (type to filter)"
                      value={multiEnrollClassQuery}
                      onChange={(e) => {
                        setMultiEnrollClassQuery(e.target.value);
                        setMultiEnrollClassId("");
                        setShowMultiClassSuggestions(true);
                      }}
                      onFocus={() => setShowMultiClassSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowMultiClassSuggestions(false), 120)}
                    />
                    {showMultiClassSuggestions && filteredMultiClasses.length > 0 && (
                      <div className="autocomplete-menu" role="listbox">
                        {filteredMultiClasses.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="autocomplete-item"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setMultiEnrollClassQuery(formatClassLabel(c));
                              setMultiEnrollClassId(c.id);
                              setShowMultiClassSuggestions(false);
                            }}
                          >
                            <span className="autocomplete-primary">{c.id}</span>
                            <span className="autocomplete-secondary">{c.name || "Untitled"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="autocomplete">
                    <input
                      className="input"
                      type="text"
                      placeholder="Select teacher (name or email)"
                      value={multiEnrollTeacherQuery}
                      onChange={(e) => {
                        setMultiEnrollTeacherQuery(e.target.value);
                        setMultiEnrollTeacherUid("");
                        setShowMultiTeacherSuggestions(true);
                      }}
                      onFocus={() => setShowMultiTeacherSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowMultiTeacherSuggestions(false), 120)}
                    />
                    {showMultiTeacherSuggestions && filteredMultiTeachers.length > 0 && (
                      <div className="autocomplete-menu" role="listbox">
                        {filteredMultiTeachers.map((u) => (
                          <button
                            key={u.uid}
                            type="button"
                            className="autocomplete-item"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setMultiEnrollTeacherQuery(formatTeacherLabel(u));
                              setMultiEnrollTeacherUid(u.uid);
                              setShowMultiTeacherSuggestions(false);
                            }}
                          >
                            <span className="autocomplete-primary">
                              {u.firstName || "Teacher"} {u.lastInitial ? `${u.lastInitial}.` : ""}
                            </span>
                            <span className="autocomplete-secondary">{u.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="form-row" style={{ marginTop: 8 }}>
                <div className="autocomplete">
                  <input
                    className="input"
                    type="text"
                    placeholder="Add student (name, email, ID)"
                    value={multiStudentQuery}
                    onChange={(e) => {
                      setMultiStudentQuery(e.target.value);
                      setShowMultiStudentSuggestions(true);
                      setMultiStudentActive(-1);
                    }}
                    onFocus={() => setShowMultiStudentSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowMultiStudentSuggestions(false), 120)}
                    onKeyDown={(e) => {
                      if (!showMultiStudentSuggestions || filteredMultiStudents.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setMultiStudentActive((i) =>
                          i < filteredMultiStudents.length - 1 ? i + 1 : 0
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setMultiStudentActive((i) =>
                          i > 0 ? i - 1 : filteredMultiStudents.length - 1
                        );
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const idx = multiStudentActive;
                        const u =
                          idx >= 0 ? filteredMultiStudents[idx] : filteredMultiStudents[0];
                        if (u) {
                          setMultiSelectedStudents((prev) => ({ ...prev, [u.uid]: true }));
                          setMultiStudentQuery("");
                          setShowMultiStudentSuggestions(false);
                        }
                      }
                    }}
                  />
                  {showMultiStudentSuggestions && filteredMultiStudents.length > 0 && (
                    <div className="autocomplete-menu" role="listbox">
                      {filteredMultiStudents.map((u, idx) => (
                        <button
                          key={u.uid}
                          type="button"
                          className={`autocomplete-item${multiStudentActive === idx ? " active" : ""}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setMultiSelectedStudents((prev) => ({ ...prev, [u.uid]: true }));
                            setMultiStudentQuery("");
                            setShowMultiStudentSuggestions(false);
                          }}
                        >
                          <span className="autocomplete-primary">
                            {u.firstName || "Student"} {u.lastInitial ? `${u.lastInitial}.` : ""}
                          </span>
                          <span className="autocomplete-secondary">
                            {u.email} {u.studentId ? `• ${u.studentId}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 8 }}>
                {Object.keys(multiSelectedStudents).length === 0 ? (
                  <div className="small">No students selected yet.</div>
                ) : (
                  Object.keys(multiSelectedStudents).map((uid) => {
                    const u = users.find((x) => x.uid === uid);
                    if (!u) return null;
                    return (
                      <div key={uid} className="small" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span>{formatStudentLabel(u)}</span>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            setMultiSelectedStudents((prev) => {
                              const next = { ...prev };
                              delete next[uid];
                              return next;
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <button className="btn btn-primary" onClick={handleMultiEnroll} style={{ marginTop: 8 }}>
                Enroll Selected Students
              </button>
              </div>
            </div>

            {/* Roster management */}
            <div className="section">
              <h3>Class Roster</h3>
              <div className="small">View, remove, or move students between classes.</div>

              <div className="form-row" style={{ marginTop: 8 }}>
                <div className="autocomplete">
                  <input
                    className="input"
                    type="text"
                    placeholder="Select class (type to filter)"
                    value={rosterClassQuery}
                    onChange={(e) => {
                      setRosterClassQuery(e.target.value);
                      setRosterClassId("");
                      setShowRosterClassSuggestions(true);
                    }}
                    onFocus={() => setShowRosterClassSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowRosterClassSuggestions(false), 120)}
                  />
                  {showRosterClassSuggestions && filteredRosterClasses.length > 0 && (
                    <div className="autocomplete-menu" role="listbox">
                      {filteredRosterClasses.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="autocomplete-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setRosterClassQuery(formatClassLabel(c));
                            setRosterClassId(c.id);
                            setRosterSelected({});
                            setRosterSearch("");
                            setRosterLimit(50);
                            setShowRosterClassSuggestions(false);
                          }}
                        >
                          <span className="autocomplete-primary">{c.id}</span>
                          <span className="autocomplete-secondary">{c.name || "Untitled"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {!rosterClassId && (
                <div className="small" style={{ marginTop: 8 }}>
                  Pick a class to view its roster.
                </div>
              )}

              {rosterClassId && (
                <div style={{ marginTop: 10 }}>
                  <div className="form-row" style={{ marginBottom: 8 }}>
                    <input
                      className="input"
                      type="text"
                      placeholder="Search roster (name, email, or ID)"
                      value={rosterSearch}
                      onChange={(e) => {
                        setRosterSearch(e.target.value);
                        setRosterLimit(50);
                      }}
                    />
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        const allSelected = filteredRoster.every(
                          (s) => rosterSelected[s.uid]
                        );
                        if (allSelected) {
                          setRosterSelected((prev) => {
                            const next = { ...prev };
                            filteredRoster.forEach((s) => {
                              delete next[s.uid];
                            });
                            return next;
                          });
                        } else {
                          setRosterSelected((prev) => {
                            const next = { ...prev };
                            filteredRoster.forEach((s) => {
                              next[s.uid] = true;
                            });
                            return next;
                          });
                        }
                      }}
                      disabled={filteredRoster.length === 0}
                    >
                      {filteredRoster.every((s) => rosterSelected[s.uid])
                        ? "Clear filtered"
                        : "Select filtered"}
                    </button>
                  </div>

                  {rosterStudents.length === 0 ? (
                    <div className="small">No students enrolled in this class.</div>
                  ) : (
                    <div className="card-list">
                      {filteredRoster.map((s) => (
                        <div
                          key={s.uid}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 0",
                            borderBottom: "1px solid #eee",
                            gap: 12,
                          }}
                        >
                          <div>
                            <div>
                              {s.firstName || "Student"} {s.lastInitial ? `${s.lastInitial}.` : ""}
                            </div>
                            <div className="meta">
                              {s.email} {s.studentId ? `• ${s.studentId}` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={!!rosterSelected[s.uid]}
                              onChange={(e) =>
                                setRosterSelected((prev) => ({
                                  ...prev,
                                  [s.uid]: e.target.checked,
                                }))
                              }
                            />
                            <select
                              className="select"
                              value={moveTargets[s.uid] || ""}
                              onChange={(e) =>
                                setMoveTargets((prev) => ({
                                  ...prev,
                                  [s.uid]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Move to...</option>
                              {classes
                                .filter((c) => c.id !== rosterClassId)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.id} — {c.name || "Untitled"}
                                  </option>
                                ))}
                            </select>
                            <button
                              className="btn btn-ghost"
                              onClick={() => handleMoveStudent(rosterClassId, s.uid)}
                            >
                              Move
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() => handleRemoveFromClass(rosterClassId, s.uid)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {totalRosterCount > filteredRoster.length && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setRosterLimit((n) => n + 50)}
                      style={{ marginTop: 6 }}
                    >
                      Show more ({filteredRoster.length}/{totalRosterCount})
                    </button>
                  )}

                  <div className="form-row" style={{ marginTop: 10 }}>
                    <select
                      className="select"
                      value={rosterBulkTarget}
                      onChange={(e) => setRosterBulkTarget(e.target.value)}
                    >
                      <option value="">Move selected to...</option>
                      {classes
                        .filter((c) => c.id !== rosterClassId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.id} — {c.name || "Untitled"}
                          </option>
                        ))}
                    </select>
                    <button className="btn btn-ghost" onClick={handleBulkMove}>
                      Move Selected
                    </button>
                    <button className="btn btn-ghost" onClick={handleBulkRemove}>
                      Remove Selected
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activePage === "users" && (
          <>
            {/* Existing Users */}
            <div className="section">
              <h3>Existing Users</h3>
              <div className="small">You can remove users here. Deleting is permanent.</div>

              {userSection === "students" && (
                <ul className="card-list">
                  {visibleStudents.map((u) => (
                    <li key={u.uid}>
                      <div>
                        <div>{u.email}</div>
                        <div className="meta">student {u.studentId ? `• ID: ${u.studentId}` : ""}</div>
                      </div>
                      <div>
                        <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); openDeleteConfirm(u.uid, u.email); }} disabled={deleting === u.uid}>
                          <DeleteIcon className="icon" /> {deleting === u.uid ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </li>
                  ))}
                  {userStudents.length === 0 && (
                    <li className="small">No students match this filter.</li>
                  )}
                </ul>
                {userStudents.length > visibleStudents.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setUserLimits((prev) => ({ ...prev, students: prev.students + 50 }))
                    }
                  >
                    Show more ({visibleStudents.length}/{userStudents.length})
                  </button>
                )}
              )}

              {userSection === "teachers" && (
                <ul className="card-list">
                  {visibleTeachers.map((u) => (
                    <li key={u.uid}>
                      <div>
                        <div>{u.email}</div>
                        <div className="meta">teacher</div>
                      </div>
                      <div>
                        <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); openDeleteConfirm(u.uid, u.email); }} disabled={deleting === u.uid}>
                          <DeleteIcon className="icon" /> {deleting === u.uid ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </li>
                  ))}
                  {userTeachers.length === 0 && (
                    <li className="small">No teachers match this filter.</li>
                  )}
                </ul>
                {userTeachers.length > visibleTeachers.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setUserLimits((prev) => ({ ...prev, teachers: prev.teachers + 50 }))
                    }
                  >
                    Show more ({visibleTeachers.length}/{userTeachers.length})
                  </button>
                )}
              )}

              {userSection === "admins" && (
                <ul className="card-list">
                  {visibleAdmins.map((u) => (
                    <li key={u.uid}>
                      <div>
                        <div>{u.email}</div>
                        <div className="meta">admin</div>
                      </div>
                      <div>
                        <button className="btn btn-ghost" onClick={(e) => { const b = e.currentTarget; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 260); openDeleteConfirm(u.uid, u.email); }} disabled={deleting === u.uid}>
                          <DeleteIcon className="icon" /> {deleting === u.uid ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </li>
                  ))}
                  {userAdmins.length === 0 && (
                    <li className="small">No admins match this filter.</li>
                  )}
                </ul>
                {userAdmins.length > visibleAdmins.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setUserLimits((prev) => ({ ...prev, admins: prev.admins + 50 }))
                    }
                  >
                    Show more ({visibleAdmins.length}/{userAdmins.length})
                  </button>
                )}
              )}
            </div>

            {/* Pending Invites */}
            <div className="section">
              <h3>Pending Invites</h3>
              <div className="small">Active invites can be copied and shared with students.</div>
              <ul className="card-list">
                {(userSection === "students" ? inviteStudents : userSection === "teachers" ? inviteTeachers : inviteAdmins).map((i) => {
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
          </>
        )}
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
