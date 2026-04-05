import { useState } from "react";
import { ref, set } from "firebase/database";
import { db } from "@/firebase";
import { addToast } from "@/shared/toastService";
import Combobox from "@/shared/components/Combobox";
import { formatStudentLabel, formatClassLabel, formatTeacherLabel } from "@/shared/utils/formatters";
import { logAudit } from "@/shared/utils/auditUtils";
import type { UserRecord, ClassRecord } from "./index";

interface EnrollmentManagerProps {
  schoolScopedUsers: UserRecord[];
  schoolScopedClasses: ClassRecord[];
}

export default function EnrollmentManager({
  schoolScopedUsers,
  schoolScopedClasses,
}: EnrollmentManagerProps) {
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

  // ---- derived data ----

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

  // ---- resolvers ----

  const resolveStudentFromQuery = () => {
    if (enrollStudentSelectedUid) {
      const selected = schoolScopedUsers.find((u) => u.uid === enrollStudentSelectedUid);
      if (selected) return { student: selected };
    }
    const q = enrollStudentQuery.trim().toLowerCase();
    if (!q) return { student: null as UserRecord | null, reason: "empty" };

    const exact = schoolScopedUsers
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
      const selected = schoolScopedClasses.find((c) => c.id === enrollClassId);
      if (selected) return { classId: selected.id };
    }
    const q = enrollClassQuery.trim().toLowerCase();
    if (!q) return { classId: null as string | null, reason: "empty" };
    const exact = schoolScopedClasses.filter((c) => {
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

  const resolveMultiClassFromQuery = () => {
    if (multiEnrollClassId) {
      const selected = schoolScopedClasses.find((c) => c.id === multiEnrollClassId);
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
      const selected = schoolScopedUsers.find((u) => u.uid === multiEnrollTeacherUid);
      if (selected) return { teacherUid: selected.uid };
    }
    const q = multiEnrollTeacherQuery.trim().toLowerCase();
    if (!q) return { teacherUid: null as string | null, reason: "empty" };
    if (filteredMultiTeachers.length === 1) return { teacherUid: filteredMultiTeachers[0]!.uid };
    if (filteredMultiTeachers.length > 1) return { teacherUid: null as string | null, reason: "ambiguous" };
    return { teacherUid: null as string | null, reason: "not_found" };
  };

  // ---- handlers ----

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

    const classObj = schoolScopedClasses.find((c) => c.id === resolvedClassId);
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

    const student = schoolScopedUsers.find(
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
          const c = schoolScopedClasses.find((x) => x.id === id);
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
      targetClassIds = schoolScopedClasses
        .filter((c) => c.teacherUid === teacherUid)
        .map((c) => c.id);
      if (targetClassIds.length === 0) {
        addToast("error", "No classes found for that teacher");
        return;
      }
    }

    const studentMap = schoolScopedUsers
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
          const c = schoolScopedClasses.find((x) => x.id === cId);
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

  // ---- render ----

  return (
    <div className="section">
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
              const c = schoolScopedClasses.find((x) => x.id === id);
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
          <Combobox
            options={[
              { value: "class", label: "Enroll into one class" },
              { value: "teacher", label: "Enroll into a teacher's classes" },
            ]}
            value={multiEnrollMode}
            onChange={(v) => setMultiEnrollMode(v)}
          />

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
                const u = schoolScopedUsers.find((x) => x.uid === uid);
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
  );
}
