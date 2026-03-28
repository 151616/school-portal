import { useState, useEffect, useRef } from "react";
import { ref, set, get, push } from "firebase/database";
import { db, auth } from "../firebase";
import { addToast } from "../toastService";

// ---- shared types ----

interface UserRecord {
  uid: string;
  email?: string;
  role?: string;
  studentId?: string;
  firstName?: string;
  lastInitial?: string;
  schoolId?: string;
  [key: string]: unknown;
}

interface ClassRecord {
  id: string;
  name?: string;
  teacherUid?: string;
  schoolId?: string;
  students?: Record<string, RosterStudent>;
  [key: string]: unknown;
}

interface RosterStudent {
  uid: string;
  email?: string;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
}

interface AttendanceRow {
  uid: string;
  name: string;
  email?: string;
  studentId?: string;
  present?: number;
  tardy?: number;
  absent?: number;
  excused?: number;
}

export interface AdminClassesProps {
  users: UserRecord[];
  classes: ClassRecord[];
  mySchoolId: string | null;
}

// ---- helpers ----

const CLASS_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

const toISODate = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getRecentDates = (days = 7): string[] => {
  const list: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    list.push(toISODate(d));
  }
  return list;
};

const formatTeacherLabel = (u: UserRecord): string => {
  const first = u.firstName || "";
  const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
  const name = `${first} ${lastInitial}`.trim();
  return name ? `${name} - ${u.email}` : u.email || "";
};

const formatStudentLabel = (u: UserRecord): string => {
  const first = u.firstName || "";
  const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
  const name = `${first} ${lastInitial}`.trim();
  const id = u.studentId ? ` - ${u.studentId}` : "";
  return name ? `${name} - ${u.email}${id}`.trim() : `${u.email}${id}`.trim();
};

const formatClassLabel = (c: ClassRecord): string => `${c.id} - ${c.name || "Untitled"}`;

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
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

const parseCSV = (text: string): Record<string, string>[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] || "").trim();
    });
    return obj;
  });
};

const escapeCSV = (value: unknown): string => {
  const text = String(value ?? "");
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",\n]/.test(safeText)) {
    return `"${safeText.replace(/"/g, '""')}"`;
  }
  return safeText;
};

const downloadCSV = (filename: string, rows: string[][]) => {
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

const logAudit = async (action: string, details: Record<string, unknown> = {}) => {
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

// ---- component ----

export default function AdminClasses({ users, classes, mySchoolId }: AdminClassesProps) {
  // Class creation
  const [classId, setClassId] = useState("");
  const [className, setClassName] = useState("");
  const [classTeacherUid, setClassTeacherUid] = useState("");
  const [classTeacherQuery, setClassTeacherQuery] = useState("");
  const [showClassTeacherSuggestions, setShowClassTeacherSuggestions] = useState(false);

  // Enrollment (single)
  const [enrollClassId, setEnrollClassId] = useState("");
  const [enrollClassQuery, setEnrollClassQuery] = useState("");
  const [enrollStudentQuery, setEnrollStudentQuery] = useState("");
  const [enrollStudentSelectedUid, setEnrollStudentSelectedUid] = useState("");
  const [showEnrollSuggestions, setShowEnrollSuggestions] = useState(false);
  const [showEnrollClassSuggestions, setShowEnrollClassSuggestions] = useState(false);
  const [enrollStudentActive, setEnrollStudentActive] = useState(-1);

  // Bulk enrollment (one student -> many classes)
  const [bulkStudentId, setBulkStudentId] = useState("");
  const [bulkSelectedClasses, setBulkSelectedClasses] = useState<Record<string, boolean>>({});
  const [bulkClassQuery, setBulkClassQuery] = useState("");
  const [showBulkClassSuggestions, setShowBulkClassSuggestions] = useState(false);

  // Multi-student enrollment
  const [multiEnrollMode, setMultiEnrollMode] = useState("class");
  const [multiEnrollClassId, setMultiEnrollClassId] = useState("");
  const [multiEnrollClassQuery, setMultiEnrollClassQuery] = useState("");
  const [multiEnrollTeacherUid, setMultiEnrollTeacherUid] = useState("");
  const [multiEnrollTeacherQuery, setMultiEnrollTeacherQuery] = useState("");
  const [multiSelectedStudents, setMultiSelectedStudents] = useState<Record<string, boolean>>({});
  const [multiStudentQuery, setMultiStudentQuery] = useState("");
  const [showMultiStudentSuggestions, setShowMultiStudentSuggestions] = useState(false);
  const [showMultiClassSuggestions, setShowMultiClassSuggestions] = useState(false);
  const [showMultiTeacherSuggestions, setShowMultiTeacherSuggestions] = useState(false);
  const [multiStudentActive, setMultiStudentActive] = useState(-1);

  // Roster management
  const [rosterClassId, setRosterClassId] = useState("");
  const [rosterClassQuery, setRosterClassQuery] = useState("");
  const [showRosterClassSuggestions, setShowRosterClassSuggestions] = useState(false);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterLimit, setRosterLimit] = useState(50);
  const [rosterSelected, setRosterSelected] = useState<Record<string, boolean>>({});
  const [rosterBulkTarget, setRosterBulkTarget] = useState("");

  // Class list
  const [classListLimit, setClassListLimit] = useState(50);
  const [classSort, setClassSort] = useState("id");
  const [classSortDir, setClassSortDir] = useState("asc");

  // Attendance & gradebook
  const [exportClassId, setExportClassId] = useState("");
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const classNameInputRef = useRef<HTMLInputElement>(null);
  const classTeacherInputRef = useRef<HTMLInputElement>(null);

  // Persist class sort prefs
  useEffect(() => {
    try {
      const savedClass = localStorage.getItem("admin_class_limit");
      if (savedClass) setClassListLimit(Number(savedClass));
      const savedClassSort = localStorage.getItem("admin_class_sort");
      if (savedClassSort) setClassSort(savedClassSort);
      const savedClassSortDir = localStorage.getItem("admin_class_sort_dir");
      if (savedClassSortDir) setClassSortDir(savedClassSortDir);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("admin_class_limit", String(classListLimit));
      localStorage.setItem("admin_class_sort", classSort);
      localStorage.setItem("admin_class_sort_dir", classSortDir);
    } catch {
      // ignore
    }
  }, [classListLimit, classSort, classSortDir]);

  // Attendance summary loader
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
        const summaryMap: Record<string, { present: number; tardy: number; absent: number; excused: number }> = {};
        Object.entries(data).forEach(([date, dayData]) => {
          if (!dates.has(date)) return;
          Object.entries((dayData as Record<string, string>) || {}).forEach(([uid, status]) => {
            if (!summaryMap[uid]) {
              summaryMap[uid] = { present: 0, tardy: 0, absent: 0, excused: 0 };
            }
            if (summaryMap[uid][status as keyof typeof summaryMap[string]] !== undefined) {
              summaryMap[uid][status as keyof typeof summaryMap[string]] += 1;
            }
          });
        });
        const classObj = classes.find((c) => c.id === attendanceClassId);
        const rosterList: RosterStudent[] = classObj?.students ? Object.values(classObj.students) : [];
        const list: AttendanceRow[] = rosterList.map((s) => ({
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

  // ---- derived data ----

  const schoolScopedUsers = mySchoolId ? users.filter((u) => u.schoolId === mySchoolId) : users;
  const schoolScopedClasses = mySchoolId ? classes.filter((c) => c.schoolId === mySchoolId) : classes;

  const filteredEnrollClasses = schoolScopedClasses
    .filter((c) => {
      const q = enrollClassQuery.trim().toLowerCase();
      if (!q) return true;
      return c.id.toLowerCase().includes(q) || String(c.name || "").toLowerCase().includes(q);
    })
    .slice(0, 200);

  const filteredEnrollStudents = schoolScopedUsers
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

  const filteredMultiStudents = schoolScopedUsers
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

  const filteredMultiTeachers = schoolScopedUsers
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

  const filteredClassTeachers = schoolScopedUsers
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

  const filteredMultiClasses = schoolScopedClasses
    .filter((c) => {
      const q = multiEnrollClassQuery.trim().toLowerCase();
      if (!q) return true;
      return c.id.toLowerCase().includes(q) || String(c.name || "").toLowerCase().includes(q);
    })
    .slice(0, 200);

  const filteredBulkClasses = schoolScopedClasses
    .filter((c) => {
      const q = bulkClassQuery.trim().toLowerCase();
      if (!q) return true;
      return c.id.toLowerCase().includes(q) || String(c.name || "").toLowerCase().includes(q);
    })
    .slice(0, 200);

  const filteredRosterClasses = schoolScopedClasses
    .filter((c) => {
      const q = rosterClassQuery.trim().toLowerCase();
      if (!q) return true;
      return c.id.toLowerCase().includes(q) || String(c.name || "").toLowerCase().includes(q);
    })
    .slice(0, 200);

  const sortClasses = (list: ClassRecord[]) => {
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

  const filteredClassList = schoolScopedClasses.filter((c) => {
    const q = rosterClassQuery.trim().toLowerCase();
    if (!q) return true;
    return c.id.toLowerCase().includes(q) || String(c.name || "").toLowerCase().includes(q);
  });

  const visibleClasses = sortClasses(filteredClassList).slice(0, classListLimit);

  const rosterClass = classes.find((c) => c.id === rosterClassId) || null;
  const rosterStudents: RosterStudent[] =
    rosterClass && rosterClass.students ? Object.values(rosterClass.students) : [];

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

  // ---- resolvers ----

  const resolveStudentFromQuery = () => {
    if (enrollStudentSelectedUid) {
      const selected = users.find((u) => u.uid === enrollStudentSelectedUid);
      if (selected) return { student: selected };
    }
    const q = enrollStudentQuery.trim().toLowerCase();
    if (!q) return { student: null as UserRecord | null, reason: "empty" };

    const exact = users
      .filter((u) => (u.role || "").toLowerCase() === "student")
      .filter((u) => {
        const email = String(u.email || "").toLowerCase();
        const id = String(u.studentId || "").toLowerCase();
        const label = formatStudentLabel(u).toLowerCase();
        return q === email || q === id || q === label;
      });

    if (exact.length === 1) return { student: exact[0] };
    if (exact.length > 1) return { student: null as UserRecord | null, reason: "ambiguous" };

    const matches = filteredEnrollStudents;
    if (matches.length === 1) return { student: matches[0] };
    if (matches.length > 1) return { student: null as UserRecord | null, reason: "ambiguous" };
    return { student: null as UserRecord | null, reason: "not_found" };
  };

  const resolveClassFromQuery = () => {
    if (enrollClassId) {
      const selected = classes.find((c) => c.id === enrollClassId);
      if (selected) return { classId: selected.id };
    }
    const q = enrollClassQuery.trim().toLowerCase();
    if (!q) return { classId: null as string | null, reason: "empty" };
    const exact = classes.filter((c) => {
      const id = c.id.toLowerCase();
      const name = String(c.name || "").toLowerCase();
      const label = formatClassLabel(c).toLowerCase();
      return q === id || q === name || q === label;
    });
    if (exact.length === 1) return { classId: exact[0]!.id };
    if (exact.length > 1) return { classId: null as string | null, reason: "ambiguous" };
    if (filteredEnrollClasses.length === 1) return { classId: filteredEnrollClasses[0]!.id };
    if (filteredEnrollClasses.length > 1) return { classId: null as string | null, reason: "ambiguous" };
    return { classId: null as string | null, reason: "not_found" };
  };

  const resolveClassTeacherFromQuery = () => {
    if (classTeacherUid) {
      const selected = users.find((u) => u.uid === classTeacherUid);
      if (selected) return { teacherUid: selected.uid };
    }
    const q = classTeacherQuery.trim().toLowerCase();
    if (!q) return { teacherUid: null as string | null, reason: "empty" };
    const matches = filteredClassTeachers;
    if (matches.length === 1) return { teacherUid: matches[0]!.uid };
    if (matches.length > 1) return { teacherUid: null as string | null, reason: "ambiguous" };
    return { teacherUid: null as string | null, reason: "not_found" };
  };

  const resolveMultiClassFromQuery = () => {
    if (multiEnrollClassId) {
      const selected = classes.find((c) => c.id === multiEnrollClassId);
      if (selected) return { classId: selected.id };
    }
    const q = multiEnrollClassQuery.trim().toLowerCase();
    if (!q) return { classId: null as string | null, reason: "empty" };
    if (filteredMultiClasses.length === 1) return { classId: filteredMultiClasses[0]!.id };
    if (filteredMultiClasses.length > 1) return { classId: null as string | null, reason: "ambiguous" };
    return { classId: null as string | null, reason: "not_found" };
  };

  const resolveMultiTeacherFromQuery = () => {
    if (multiEnrollTeacherUid) {
      const selected = users.find((u) => u.uid === multiEnrollTeacherUid);
      if (selected) return { teacherUid: selected.uid };
    }
    const q = multiEnrollTeacherQuery.trim().toLowerCase();
    if (!q) return { teacherUid: null as string | null, reason: "empty" };
    if (filteredMultiTeachers.length === 1) return { teacherUid: filteredMultiTeachers[0]!.uid };
    if (filteredMultiTeachers.length > 1) return { teacherUid: null as string | null, reason: "ambiguous" };
    return { teacherUid: null as string | null, reason: "not_found" };
  };

  // ---- handlers ----

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
        ...(mySchoolId ? { schoolId: mySchoolId } : {}),
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error creating class:", err);
      addToast("error", "Error creating class: " + message);
    }
  };

  const handleImportClassesCSV = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        addToast("error", "CSV has no rows");
        return;
      }
      const usersByEmail = schoolScopedUsers.reduce<Record<string, UserRecord>>((acc, u) => {
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
          ...(mySchoolId ? { schoolId: mySchoolId } : {}),
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
      const rosterList: RosterStudent[] = Object.values(classObj.students);
      const assignmentMap: Record<string, string> = {};
      const gradeData: Record<string, Record<string, { name?: string; score?: number; maxScore?: number }>> = {};

      await Promise.all(
        rosterList.map(async (s) => {
          const snap = await get(ref(db, `grades/${s.uid}/${exportClassId}/assignments`));
          const assignments = snap.exists() ? snap.val() : {};
          gradeData[s.uid] = assignments;
          Object.entries(assignments).forEach(([aid, a]: [string, unknown]) => {
            const assignment = a as { name?: string };
            const label = assignment.name || aid;
            assignmentMap[aid] = label;
          });
        })
      );

      const assignmentIds = Object.keys(assignmentMap);
      const header = [
        "studentId",
        "email",
        "firstName",
        "lastInitial",
        ...assignmentIds.map((id) => assignmentMap[id] ?? ""),
      ];
      const rows: string[][] = [header];

      rosterList.forEach((s) => {
        const row = [s.studentId || "", s.email || "", s.firstName || "", s.lastInitial || ""];
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error enrolling student:", err);
      addToast("error", "Error enrolling student: " + message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error bulk enrolling:", err);
      addToast("error", "Error bulk enrolling: " + message);
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

    let targetClassIds: string[] = [];
    if (multiEnrollMode === "class") {
      const { classId: cid, reason } = resolveMultiClassFromQuery();
      if (!cid) {
        if (reason === "empty") addToast("error", "Select a class");
        else if (reason === "ambiguous") addToast("error", "Multiple classes match - type more");
        else addToast("error", "Class not found");
        return;
      }
      targetClassIds = [cid];
    } else {
      const { teacherUid, reason } = resolveMultiTeacherFromQuery();
      if (!teacherUid) {
        if (reason === "empty") addToast("error", "Select a teacher");
        else if (reason === "ambiguous") addToast("error", "Multiple teachers match - type more");
        else addToast("error", "Teacher not found");
        return;
      }
      targetClassIds = classes.filter((c) => c.teacherUid === teacherUid).map((c) => c.id);
      if (targetClassIds.length === 0) {
        addToast("error", "No classes found for that teacher");
        return;
      }
    }

    const studentMap = users
      .filter((u) => selectedStudentUids.includes(u.uid))
      .reduce<Record<string, UserRecord>>((acc, u) => {
        acc[u.uid] = u;
        return acc;
      }, {});

    try {
      const writes: Promise<void>[] = [];
      let skipped = 0;
      targetClassIds.forEach((cId) => {
        selectedStudentUids.forEach((uid) => {
          const c = classes.find((x) => x.id === cId);
          if (c && c.students && c.students[uid]) {
            skipped += 1;
            return;
          }
          const student = studentMap[uid];
          if (!student) return;
          writes.push(
            set(ref(db, `classes/${cId}/students/${uid}`), {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error enrolling students:", err);
      addToast("error", "Error enrolling students: " + message);
    }
  };

  const handleDeleteClass = async (classId: string, teacherUid?: string) => {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error deleting class:", err);
      addToast("error", "Error deleting class: " + message);
    }
  };

  const handleRemoveFromClass = async (cId: string, uid: string) => {
    try {
      await set(ref(db, `classes/${cId}/students/${uid}`), null);
      await logAudit("student_removed", { classId: cId, studentUid: uid });
      addToast("success", "Student removed from class");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error removing student:", err);
      addToast("error", "Error removing student: " + message);
    }
  };

  const handleMoveStudent = async (fromClassId: string, uid: string) => {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error moving student:", err);
      addToast("error", "Error moving student: " + message);
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
        selectedUids.map((uid) => set(ref(db, `classes/${rosterClassId}/students/${uid}`), null))
      );
      await logAudit("bulk_remove", {
        classId: rosterClassId,
        studentUids: selectedUids,
      });
      addToast("success", "Students removed");
      setRosterSelected({});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error bulk removing:", err);
      addToast("error", "Error bulk removing: " + message);
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
      const studentMap = users.reduce<Record<string, UserRecord>>((acc, u) => {
        acc[u.uid] = u;
        return acc;
      }, {});

      await Promise.all(
        selectedUids
          .map((uid) => {
            const student = studentMap[uid];
            if (!student) return null;
            return set(ref(db, `classes/${rosterBulkTarget}/students/${uid}`), {
              uid,
              email: student.email || "",
              firstName: student.firstName || "",
              lastInitial: student.lastInitial || "",
              studentId: student.studentId || "",
            });
          })
          .filter(Boolean) as Promise<void>[]
      );
      await Promise.all(
        selectedUids.map((uid) => set(ref(db, `classes/${rosterClassId}/students/${uid}`), null))
      );
      await logAudit("bulk_move", {
        fromClassId: rosterClassId,
        toClassId: rosterBulkTarget,
        studentUids: selectedUids,
      });
      addToast("success", "Students moved");
      setRosterSelected({});
      setRosterBulkTarget("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error bulk moving:", err);
      addToast("error", "Error bulk moving: " + message);
    }
  };

  // ---- render ----

  return (
    <>
      {/* Create Class */}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") classNameInputRef.current?.focus();
            }}
          />
          <input
            ref={classNameInputRef}
            className="input"
            type="text"
            placeholder="Class name"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") classTeacherInputRef.current?.focus();
            }}
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && classTeacherUid) {
                  setShowClassTeacherSuggestions(false);
                  handleCreateClass();
                }
              }}
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

        {/* Bulk Import / Export */}
        <div className="section">
          <h3>Bulk Import / Export</h3>
          <div className="small">Import classes via CSV: classId, className, teacherEmail.</div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <input
              className="input"
              type="file"
              accept=".csv"
              onChange={(e) => handleImportClassesCSV((e.target as HTMLInputElement).files?.[0])}
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

        {/* Classes List */}
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
            <button className="btn btn-ghost" onClick={() => setClassListLimit((n) => n + 50)}>
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

        {/* Attendance Summary */}
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
          {attendanceLoading && (
            <div className="small" style={{ marginTop: 6 }}>Loading attendance...</div>
          )}
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
                          Present {row.present || 0} | Tardy {row.tardy || 0} | Absent{" "}
                          {row.absent || 0}
                          {(row.absent || 0) >= 2 ? " | Missed days flag" : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Enrollment */}
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
                if (
                  e.key === "ArrowDown" &&
                  showEnrollSuggestions &&
                  filteredEnrollStudents.length > 0
                ) {
                  e.preventDefault();
                  setEnrollStudentActive((i) =>
                    i < filteredEnrollStudents.length - 1 ? i + 1 : 0
                  );
                } else if (
                  e.key === "ArrowUp" &&
                  showEnrollSuggestions &&
                  filteredEnrollStudents.length > 0
                ) {
                  e.preventDefault();
                  setEnrollStudentActive((i) =>
                    i > 0 ? i - 1 : filteredEnrollStudents.length - 1
                  );
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (showEnrollSuggestions && filteredEnrollStudents.length > 0) {
                    const idx = enrollStudentActive;
                    const u =
                      idx >= 0 ? filteredEnrollStudents[idx] : filteredEnrollStudents[0];
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
                      {u.email}
                      {u.studentId ? ` - ${u.studentId}` : ""}
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

        {/* Bulk Enroll */}
        <div style={{ marginTop: 16 }}>
          <div className="small">Bulk Enroll (one student to many classes)</div>
          <div className="small">
            Pick a student once, then select multiple classes to enroll at once.
          </div>
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
                  <div
                    key={id}
                    className="small"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
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

          <button
            className="btn btn-primary"
            onClick={handleBulkEnroll}
            style={{ marginTop: 8 }}
          >
            Enroll In Selected Classes
          </button>
        </div>

        {/* Multi-Student Enroll */}
        <div style={{ marginTop: 16 }}>
          <div className="small">Multi-Student Enroll</div>
          <div className="small">
            Select a class or teacher, then enroll multiple students at once.
          </div>

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
                        {u.email}
                        {u.studentId ? ` - ${u.studentId}` : ""}
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
                  <div
                    key={uid}
                    className="small"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
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

          <button
            className="btn btn-primary"
            onClick={handleMultiEnroll}
            style={{ marginTop: 8 }}
          >
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
          <div className="small" style={{ marginTop: 8 }}>Pick a class to view its roster.</div>
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
                  const allSelected = filteredRoster.every((s) => rosterSelected[s.uid]);
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
                        {s.email}
                        {s.studentId ? ` - ${s.studentId}` : ""}
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
  );
}
