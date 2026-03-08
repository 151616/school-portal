import React, { useState, useEffect, useRef } from "react";
import { ref, set, push, onValue, get, query, orderByChild, limitToLast } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions, firebaseConfig } from "./firebase"; // make sure auth is imported
import { addToast } from "./toastService";
import ConfirmModal from "./ConfirmModal";
import { CopyIcon, DeleteIcon, LinkIcon, PlusIcon, AlertIcon } from "./icons";

const toISODate = (date) => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getRecentDates = (days = 7) => {
  const list = [];
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    list.push(toISODate(d));
  }
  return list;
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
  const [classSortDir, setClassSortDir] = useState("asc");
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [userSearchActive, setUserSearchActive] = useState(-1);
  const [auditLogs, setAuditLogs] = useState([]);
  const [exportClassId, setExportClassId] = useState("");
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceSummary, setAttendanceSummary] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Refs for keyboard navigation
  const classNameInputRef = useRef(null);
  const classTeacherInputRef = useRef(null);

  // Diagnostics UI state
  const [diagnostics, setDiagnostics] = useState({
    loading: false,
    authUser: null,
    claims: null,
    usersRead: null,
    usersReadError: null,
    diagWriteError: null,
    inviteCreateError: null,
    note: ''
  });

  // Run a set of diagnostics and update UI state so problems are visible in-page
  const runDiagnostics = async () => {
    setDiagnostics((s) => ({ ...s, loading: true, note: '' }));

    if (!auth || !auth.currentUser) {
      setDiagnostics({ loading: false, note: 'Not authenticated', authUser: null });
      addToast('error', 'Not authenticated - sign in and retry diagnostics');
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

    // Test the callable invite path and clean it up immediately
    let inviteCreateErr = null;
    try {
      const inviteEmail = `diag+${Date.now()}@example.com`;
      const inviteResult = await callCreateInvite({
        email: inviteEmail,
        role: 'student',
      });

      if (inviteResult?.inviteId) {
        await set(ref(db, `invites/${inviteResult.inviteId}`), null);
      } else {
        throw new Error('createInvite returned no inviteId');
      }
    } catch (err) {
      inviteCreateErr = err.message || String(err);
      console.error('createInvite diagnostics failed:', err);
    }

    setDiagnostics({
      loading: false,
      authUser: { uid, email },
      claims,
      usersRead,
      usersReadError,
      diagWriteError: diagWriteErr,
      inviteCreateError: inviteCreateErr,
      deployedRules: null,
      deployedRulesError: null,
      note: 'Diagnostics complete'
    });

    addToast('info', 'Diagnostics complete - see the panel below');
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
      addToast('error', 'Unable to fetch deployed rules - check Console or deploy rules');
    }
  };

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);


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
    return name ? `${name} - ${u.email}` : u.email;
  };

  const formatStudentLabel = (u) => {
    const first = u.firstName || "";
    const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
    const name = `${first} ${lastInitial}`.trim();
    const id = u.studentId ? ` - ${u.studentId}` : "";
    return name ? `${name} - ${u.email}${id}`.trim() : `${u.email}${id}`.trim();
  };

  const formatClassLabel = (c) => `${c.id} - ${c.name || "Untitled"}`;

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
    if (classSortDir === "desc") sorted.reverse();
    return sorted;
  };

  const filteredClassList = classes.filter((c) => {
    const q = rosterClassQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.id.toLowerCase().includes(q) ||
      String(c.name || "").toLowerCase().includes(q)
    );
  });

  const visibleClasses = sortClasses(filteredClassList).slice(0, classListLimit);

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

  const userSuggestions =
    userSection === "students"
      ? userStudents
      : userSection === "teachers"
      ? userTeachers
      : userAdmins;

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
      await logAudit("student_removed", { classId, studentUid: uid });
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
      await logAudit("student_moved", {
        fromClassId,
        toClassId: targetClassId,
        studentUid: uid,
      });
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
      await logAudit("bulk_remove", {
        classId: rosterClassId,
        studentUids: selectedUids,
      });
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
      await logAudit("bulk_move", {
        fromClassId: rosterClassId,
        toClassId: rosterBulkTarget,
        studentUids: selectedUids,
      });
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
      const savedClassSortDir = localStorage.getItem("admin_class_sort_dir");
      if (savedClassSortDir) setClassSortDir(savedClassSortDir);
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
      localStorage.setItem("admin_class_sort_dir", classSortDir);
    } catch {
      // ignore storage errors
    }
  }, [userLimits, classListLimit, userSort, classSort, classSortDir]);

  useEffect(() => {
    const logsRef = query(ref(db, "auditLogs"), orderByChild("createdAt"), limitToLast(50));
    const unsubscribe = onValue(logsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data)
        .map(([id, entry]) => ({ id, ...entry }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAuditLogs(list);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!attendanceClassId) {
      setAttendanceSummary([]);
      return;
    }
    const loadAttendanceSummary = async () => {
      setAttendanceLoading(true);
      try {
        const snap = await get(ref(db, `attendance/${attendanceClassId}`));
        const data = snap.exists() ? snap.val() : {};
        const dates = new Set(getRecentDates(7));
        const summaryMap = {};
        Object.entries(data).forEach(([date, dayData]) => {
          if (!dates.has(date)) return;
          Object.entries(dayData || {}).forEach(([uid, status]) => {
            if (!summaryMap[uid]) {
              summaryMap[uid] = { present: 0, tardy: 0, absent: 0, excused: 0 };
            }
            if (summaryMap[uid][status] !== undefined) {
              summaryMap[uid][status] += 1;
            }
          });
        });
        const classObj = classes.find((c) => c.id === attendanceClassId);
        const rosterList = classObj?.students ? Object.values(classObj.students) : [];
        const list = rosterList.map((s) => ({
          uid: s.uid,
          name: `${s.firstName || "Student"} ${s.lastInitial ? `${s.lastInitial}.` : ""}`.trim(),
          email: s.email,
          studentId: s.studentId,
          ...summaryMap[s.uid],
        }));
        setAttendanceSummary(list);
      } catch (err) {
        console.error("Admin attendance summary error:", err);
        addToast("error", "Unable to load attendance summary");
      } finally {
        setAttendanceLoading(false);
      }
    };
    loadAttendanceSummary();
  }, [attendanceClassId, classes]);

  const logAudit = async (action, details = {}) => {
    if (!auth.currentUser) return;
    try {
      const entry = {
        action,
        createdAt: Date.now(),
        actorUid: auth.currentUser.uid,
        actorEmail: auth.currentUser.email || "",
        ...details,
      };
      await set(push(ref(db, "auditLogs")), entry);
    } catch (err) {
      console.error("Audit log error:", err);
    }
  };

  const formatAuditTime = (ts) => {
    if (!ts) return "Unknown time";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) return [];
    const headers = parseCSVLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cols = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (cols[idx] || "").trim();
      });
      return obj;
    });
  };

  const escapeCSV = (value) => {
    const text = String(value ?? "");
    // Prefix cells that start with formula-trigger chars to prevent CSV injection in Excel/Sheets
    const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    if (/[",\n]/.test(safeText)) {
      return `"${safeText.replace(/"/g, '""')}"`;
    }
    return safeText;
  };

  const downloadCSV = (filename, rows) => {
    const content = rows.map((row) => row.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const callCreateInvite = async (payload) => {
    const createInvite = httpsCallable(functions, "createInvite");
    const result = await createInvite(payload);
    return result.data;
  };

  const handleImportInvitesCSV = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        addToast("error", "CSV has no rows");
        return;
      }
      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const emailLower = String(row.email || "").toLowerCase();
        const roleValue = String(row.role || "").toLowerCase() || "student";
        if (!emailLower) {
          skipped += 1;
          continue;
        }
        try {
          await callCreateInvite({
            email: emailLower,
            role: roleValue,
            studentId: row.studentId || "",
            firstName: row.firstName || "",
            lastInitial: row.lastInitial || "",
          });
          created += 1;
        } catch (err) {
          const code = String(err?.code || "").replace("functions/", "");
          if (
            code === "already-exists" ||
            code === "invalid-argument" ||
            code === "failed-precondition"
          ) {
            skipped += 1;
            continue;
          }
          throw err;
        }
      }

      addToast("success", `Imported invites: ${created}, skipped: ${skipped}`);
    } catch (err) {
      console.error("Import invites error:", err);
      addToast("error", "Failed to import invites");
    }
  };

  const handleImportClassesCSV = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        addToast("error", "CSV has no rows");
        return;
      }
      const usersByEmail = users.reduce((acc, u) => {
        acc[String(u.email || "").toLowerCase()] = u;
        return acc;
      }, {});
      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const id = String(row.classId || row.id || "").trim();
        const name = String(row.className || row.name || "").trim();
        const teacherEmail = String(row.teacherEmail || "").toLowerCase();
        if (!id || !name || !teacherEmail || !CLASS_ID_REGEX.test(id)) {
          skipped += 1;
          continue;
        }
        const teacher = usersByEmail[teacherEmail];
        if (!teacher || (teacher.role || "").toLowerCase() !== "teacher") {
          skipped += 1;
          continue;
        }
        const classRef = ref(db, `classes/${id}`);
        const existing = await get(classRef);
        if (existing.exists()) {
          skipped += 1;
          continue;
        }
        await set(classRef, {
          name,
          teacherUid: teacher.uid,
          createdAt: Date.now(),
        });
        await set(ref(db, `teachers/${teacher.uid}/classes/${id}`), true);
        created += 1;
      }
      addToast("success", `Imported classes: ${created}, skipped: ${skipped}`);
    } catch (err) {
      console.error("Import classes error:", err);
      addToast("error", "Failed to import classes");
    }
  };

  const handleExportGradebook = async () => {
    if (!exportClassId) {
      addToast("error", "Select a class to export");
      return;
    }
    const classObj = classes.find((c) => c.id === exportClassId);
    if (!classObj || !classObj.students) {
      addToast("error", "Class has no students");
      return;
    }
    try {
      const rosterList = Object.values(classObj.students);
      const assignmentMap = {};
      const gradeData = {};

      await Promise.all(
        rosterList.map(async (s) => {
          const snap = await get(ref(db, `grades/${s.uid}/${exportClassId}/assignments`));
          const assignments = snap.exists() ? snap.val() : {};
          gradeData[s.uid] = assignments;
          Object.entries(assignments).forEach(([aid, a]) => {
            const label = a.name || aid;
            assignmentMap[aid] = label;
          });
        })
      );

      const assignmentIds = Object.keys(assignmentMap);
      const header = ["studentId", "email", "firstName", "lastInitial", ...assignmentIds.map((id) => assignmentMap[id])];
      const rows = [header];

      rosterList.forEach((s) => {
        const row = [
          s.studentId || "",
          s.email || "",
          s.firstName || "",
          s.lastInitial || "",
        ];
        assignmentIds.forEach((aid) => {
          const a = gradeData[s.uid]?.[aid];
          row.push(a ? `${a.score}/${a.maxScore}` : "");
        });
        rows.push(row);
      });

      downloadCSV(`${exportClassId}-gradebook.csv`, rows);
      addToast("success", "Gradebook exported");
    } catch (err) {
      console.error("Export gradebook error:", err);
      addToast("error", "Failed to export gradebook");
    }
  };

  const handleExportUsersCSV = () => {
    const list =
      userSection === "students"
        ? userStudents
        : userSection === "teachers"
        ? userTeachers
        : userAdmins;
    const rows = [
      ["uid", "email", "role", "studentId", "firstName", "lastInitial"],
      ...list.map((u) => [
        u.uid || "",
        u.email || "",
        u.role || "",
        u.studentId || "",
        u.firstName || "",
        u.lastInitial || "",
      ]),
    ];
    downloadCSV(`${userSection}-users.csv`, rows);
    addToast("success", "User export ready");
  };

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
      const emailLower = email.toLowerCase();
      const inviteResult = await callCreateInvite({
        email: emailLower,
        role,
      });

      await logAudit("invite_created", {
        inviteId: inviteResult.inviteId,
        targetEmail: inviteResult.email,
        role: inviteResult.role,
        studentId: inviteResult.studentId,
      });

      const idSuffix = inviteResult.studentId ? ` Student ID: ${inviteResult.studentId}` : "";
      addToast('success', `Invite created for ${inviteResult.email}!${idSuffix}`);

      setEmail(""); // reset input

    } catch (error) {
      console.error("Error creating invite:", error);
      addToast('error', 'Error creating invite: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  }; 

  const CLASS_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

  const handleCreateClass = async () => {
    if (!classId.trim()) {
      addToast("error", "Enter a class ID");
      return;
    }
    if (!CLASS_ID_REGEX.test(classId.trim())) {
      addToast("error", "Class ID may only contain letters, numbers, hyphens, and underscores (max 64 chars)");
      return;
    }
    if (!className.trim()) {
      addToast("error", "Enter a class name");
      return;
    }
    const { teacherUid, reason } = resolveClassTeacherFromQuery();
    if (!teacherUid) {
      if (reason === "empty") addToast("error", "Select a teacher");
      else if (reason === "ambiguous") addToast("error", "Multiple teachers match - type more");
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
      await logAudit("class_created", {
        classId: id,
        className: className.trim(),
        teacherUid,
      });

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
      else if (classReason === "ambiguous") addToast("error", "Multiple classes match - type more");
      else addToast("error", "Class not found");
      return;
    }
    const { student, reason } = resolveStudentFromQuery();
    if (!student) {
      if (reason === "empty") addToast("error", "Type a student name, email, or ID");
      else if (reason === "ambiguous") addToast("error", "Multiple matches - type more to narrow it down");
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
      await logAudit("student_enrolled", {
        classId: resolvedClassId,
        studentUid: student.uid,
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
      await logAudit("student_bulk_enroll", {
        studentUid: student.uid,
        classIds,
        skipped,
      });
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
        else if (reason === "ambiguous") addToast("error", "Multiple classes match - type more");
        else addToast("error", "Class not found");
        return;
      }
      targetClassIds = [classId];
    } else {
      const { teacherUid, reason } = resolveMultiTeacherFromQuery();
      if (!teacherUid) {
        if (reason === "empty") addToast("error", "Select a teacher");
        else if (reason === "ambiguous") addToast("error", "Multiple teachers match - type more");
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
      await logAudit("multi_enroll", {
        classIds: targetClassIds,
        studentUids: selectedStudentUids,
        skipped,
      });
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

  const handleDeleteClass = async (classId, teacherUid) => {
    if (!classId) return;
    const first = window.confirm(`Delete class ${classId}? This cannot be undone.`);
    if (!first) return;
    const second = window.confirm(`Are you absolutely sure you want to delete ${classId}?`);
    if (!second) return;

    try {
      await set(ref(db, `classes/${classId}`), null);
      if (teacherUid) {
        await set(ref(db, `teachers/${teacherUid}/classes/${classId}`), null);
      }
      await logAudit("class_deleted", { classId, teacherUid: teacherUid || "" });
      addToast("success", "Class deleted");
    } catch (err) {
      console.error("Error deleting class:", err);
      addToast("error", "Error deleting class: " + (err.message || err));
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
      const deleteUser = httpsCallable(functions, "deleteUserByAdmin");
      await deleteUser({ uid });
      await logAudit("user_deleted", { targetUid: uid });
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
          <div>
            <h2>Admin Dashboard</h2>
            <div className="muted">Manage users and invitations. Create invites, copy links, and remove users safely.</div>
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
                <div><strong>Invite create:</strong> {diagnostics.inviteCreateError ? `Error: ${diagnostics.inviteCreateError}` : 'OK (callable path)'}</div>

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

                {(!diagnostics.claims || !diagnostics.claims.admin) && diagnostics.inviteCreateError && (
                  <div style={{ marginTop: 8, color: '#7a3' }}><em>Hint: Invite creation requires a live admin claim. Sign out and back in if this user was promoted recently.</em></div>
                )}
              </div>
            </div>
          )}
        </div>
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
                  className={`tab-btn ${userSection === "students" ? "active" : ""}`}
                  onClick={() => { setUserSection("students"); setRole("student"); }}
                >
                  Students
                </button>
                <button
                  className={`tab-btn ${userSection === "teachers" ? "active" : ""}`}
                  onClick={() => { setUserSection("teachers"); setRole("teacher"); }}
                >
                  Teachers
                </button>
                <button
                  className={`tab-btn ${userSection === "admins" ? "active" : ""}`}
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
                  onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleAddUser(); }}
                  autoComplete="off"
                />

                <button className="btn btn-primary" onClick={(e) => { const btn = e.currentTarget; btn.classList.add('pulse'); setTimeout(() => btn.classList.remove('pulse'), 260); handleAddUser(); }} disabled={loading}>
                  {loading ? 'Creating...' : (<><PlusIcon className="icon"/> Create Invite</>)}
                </button>
              </div>
            </div>

            <div className="section">
              <h3>Bulk Import (Invites)</h3>
              <div className="small">CSV columns: email, role, studentId (optional), firstName (optional), lastInitial (optional).</div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <input
                  className="input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleImportInvitesCSV(e.target.files?.[0])}
                />
              </div>
            </div>

            {/* Search */}
            <div className="section">
              <div className="instructions">Search users and pending invites by email, role, student ID, or UID.</div>
              <div className="form-row">
                <div className="autocomplete">
                  <input
                    className="input"
                    type="text"
                    placeholder="Search users or invites..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowUserSuggestions(true);
                      setUserSearchActive(-1);
                    }}
                    onFocus={() => setShowUserSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowUserSuggestions(false), 120)}
                    onKeyDown={(e) => {
                      if (!showUserSuggestions || userSuggestions.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setUserSearchActive((i) =>
                          i < userSuggestions.length - 1 ? i + 1 : 0
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setUserSearchActive((i) =>
                          i > 0 ? i - 1 : userSuggestions.length - 1
                        );
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const idx = userSearchActive;
                        const u = idx >= 0 ? userSuggestions[idx] : userSuggestions[0];
                        if (u) {
                          setSearchQuery(u.email || "");
                          setShowUserSuggestions(false);
                        }
                      }
                    }}
                  />
                  {showUserSuggestions && userSuggestions.length > 0 && (
                    <div className="autocomplete-menu" role="listbox">
                      {userSuggestions.map((u, idx) => (
                        <button
                          key={u.uid}
                          type="button"
                          className={`autocomplete-item${userSearchActive === idx ? " active" : ""}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSearchQuery(u.email || "");
                            setShowUserSuggestions(false);
                          }}
                        >
                          <span className="autocomplete-primary">
                            {u.firstName || "User"} {u.lastInitial ? `${u.lastInitial}.` : ""}
                          </span>
                          <span className="autocomplete-secondary">
                            {u.email}{u.studentId ? ` - ${u.studentId}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 6 }}>
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

              <div className="small" style={{ marginTop: 16 }}>Create Class</div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <input
                  className="input"
                  type="text"
                  placeholder="Class ID (e.g. math101)"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") classNameInputRef.current?.focus(); }}
                />
                <input
                  ref={classNameInputRef}
                  className="input"
                  type="text"
                  placeholder="Class name"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") classTeacherInputRef.current?.focus(); }}
                />
                <div className="autocomplete">
                  <input
                    ref={classTeacherInputRef}
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
                    onKeyDown={(e) => { if (e.key === "Enter" && classTeacherUid) { setShowClassTeacherSuggestions(false); handleCreateClass(); } }}
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
                <h3>Bulk Import / Export</h3>
                <div className="small">Import classes via CSV: classId, className, teacherEmail.</div>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <input
                    className="input"
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleImportClassesCSV(e.target.files?.[0])}
                  />
                </div>
                <div className="small" style={{ marginTop: 12 }}>Export gradebook by class.</div>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <select
                    className="select"
                    value={exportClassId}
                    onChange={(e) => setExportClassId(e.target.value)}
                  >
                    <option value="">Select class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} - {c.name || "Untitled"}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-ghost" onClick={handleExportGradebook}>
                    Export Gradebook
                  </button>
                </div>
              </div>

              <div className="section">
                <div className="small">Classes List</div>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <div className="autocomplete">
                    <input
                      className="input"
                      type="text"
                      placeholder="Filter classes (ID or name)"
                      value={rosterClassQuery}
                      onChange={(e) => setRosterClassQuery(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setClassSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  >
                    Sort {classSortDir === "asc" ? "A-Z" : "Z-A"}
                  </button>
                </div>
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
                        <div className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span>{c.teacherUid ? `Teacher UID: ${c.teacherUid}` : "No teacher"}</span>
                          <button
                            className="btn btn-ghost"
                            onClick={() => handleDeleteClass(c.id, c.teacherUid)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {filteredClassList.length > visibleClasses.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setClassListLimit((n) => n + 50)}
                  >
                    Show more ({visibleClasses.length}/{filteredClassList.length})
                  </button>
                )}
                {filteredClassList.length > visibleClasses.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setClassListLimit(filteredClassList.length)}
                  >
                    Show all
                  </button>
                )}
              </div>

              <div className="section">
                <h3>Attendance Summary</h3>
                <div className="small">Past 7 days per class.</div>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <select
                    className="select"
                    value={attendanceClassId}
                    onChange={(e) => setAttendanceClassId(e.target.value)}
                  >
                    <option value="">Select class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} - {c.name || "Untitled"}
                      </option>
                    ))}
                  </select>
                </div>
                {attendanceLoading && <div className="small" style={{ marginTop: 6 }}>Loading attendance...</div>}
                {!attendanceLoading && attendanceClassId && (
                  <>
                    {attendanceSummary.length === 0 ? (
                      <div className="small" style={{ marginTop: 6 }}>No attendance data yet.</div>
                    ) : (
                      <ul className="card-list" style={{ marginTop: 8 }}>
                        {attendanceSummary.map((row) => (
                          <li key={row.uid}>
                            <div>
                              <div>{row.name}</div>
                              <div className="meta">
                                Present {row.present || 0} | Tardy {row.tardy || 0} | Absent {row.absent || 0}
                                {row.absent >= 2 ? " | Missed days flag" : ""}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
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
                      if (e.key === "ArrowDown" && showEnrollSuggestions && filteredEnrollStudents.length > 0) {
                        e.preventDefault();
                        setEnrollStudentActive((i) =>
                          i < filteredEnrollStudents.length - 1 ? i + 1 : 0
                        );
                      } else if (e.key === "ArrowUp" && showEnrollSuggestions && filteredEnrollStudents.length > 0) {
                        e.preventDefault();
                        setEnrollStudentActive((i) =>
                          i > 0 ? i - 1 : filteredEnrollStudents.length - 1
                        );
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (showEnrollSuggestions && filteredEnrollStudents.length > 0) {
                          const idx = enrollStudentActive;
                          const u = idx >= 0 ? filteredEnrollStudents[idx] : filteredEnrollStudents[0];
                          if (u) {
                            setEnrollStudentQuery(formatStudentLabel(u));
                            setEnrollStudentSelectedUid(u.uid);
                            setShowEnrollSuggestions(false);
                          }
                        } else if (enrollStudentSelectedUid || enrollStudentQuery) {
                          handleEnrollStudent();
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
                            {u.email}{u.studentId ? ` - ${u.studentId}` : ""}
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
                <div className="small">Bulk Enroll (one student to many classes)</div>
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
                            {u.email}{u.studentId ? ` - ${u.studentId}` : ""}
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
                              {s.email}{s.studentId ? ` - ${s.studentId}` : ""}
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
                                    {c.id} - {c.name || "Untitled"}
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
                            {c.id} - {c.name || "Untitled"}
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
              <div className="form-row" style={{ marginTop: 8 }}>
                <select
                  className="select"
                  value={userSort}
                  onChange={(e) => setUserSort(e.target.value)}
                >
                  <option value="email">Sort by Email</option>
                  <option value="name">Sort by Name</option>
                  <option value="studentId">Sort by Student ID</option>
                </select>
                <button className="btn btn-ghost" onClick={handleExportUsersCSV}>
                  Export {userSection}
                </button>
              </div>

              {userSection === "students" && (
                <>
                <ul className="card-list">
                  {visibleStudents.map((u) => (
                    <li key={u.uid}>
                      <div>
                        <div>{u.email}</div>
                        <div className="meta">student{u.studentId ? ` - ID: ${u.studentId}` : ""}</div>
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
                {userStudents.length > visibleStudents.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setUserLimits((prev) => ({ ...prev, students: userStudents.length }))
                    }
                  >
                    Show all
                  </button>
                )}
                </>
              )}

              {userSection === "teachers" && (
                <>
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
                {userTeachers.length > visibleTeachers.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setUserLimits((prev) => ({ ...prev, teachers: userTeachers.length }))
                    }
                  >
                    Show all
                  </button>
                )}
                </>
              )}

              {userSection === "admins" && (
                <>
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
                {userAdmins.length > visibleAdmins.length && (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setUserLimits((prev) => ({ ...prev, admins: userAdmins.length }))
                    }
                  >
                    Show all
                  </button>
                )}
                </>
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
                    <div className="meta">{i.role} | Student ID: {i.studentId}</div>
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

        <div className="section">
          <h3>Audit Log</h3>
          <div className="small">Recent admin actions and system changes.</div>
          <ul className="card-list" style={{ marginTop: 8 }}>
            {auditLogs.length === 0 ? (
              <li className="small">No audit events yet.</li>
            ) : (
              auditLogs.map((log) => {
                const parts = [];
                if (log.targetEmail) parts.push(log.targetEmail);
                if (log.classId) parts.push(`class ${log.classId}`);
                if (log.studentUid) parts.push(`student ${log.studentUid}`);
                if (log.targetUid) parts.push(`user ${log.targetUid}`);
                if (log.inviteId) parts.push(`invite ${log.inviteId}`);
                const detailText = parts.join(" | ");
                return (
                  <li key={log.id}>
                    <div>
                      <div>{log.action || "action"}</div>
                      <div className="meta">
                        {formatAuditTime(log.createdAt)} | {log.actorEmail || log.actorUid || "system"}
                        {detailText ? ` | ${detailText}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
          </>
        )}
        <div className="section" style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
          <button
            className="btn btn-ghost"
            onClick={(e) => {
              const b = e.currentTarget;
              b.classList.add("pulse");
              setTimeout(() => b.classList.remove("pulse"), 260);
              runDiagnostics();
            }}
          >
            <AlertIcon className="icon" /> Having a problem? Report it!
          </button>
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
