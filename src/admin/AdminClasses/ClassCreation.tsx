import { useState, useEffect, useRef } from "react";
import { ref, set, get } from "firebase/database";
import { db } from "@/firebase";
import { addToast } from "@/shared/toastService";
import { parseCSV, downloadCSV } from "@/shared/utils/csvUtils";
import { formatTeacherLabel } from "@/shared/utils/formatters";
import { logAudit } from "@/shared/utils/auditUtils";
import type { UserRecord, ClassRecord, RosterStudent } from "./index";
import { CLASS_ID_REGEX } from "./index";

interface ClassCreationProps {
  users: UserRecord[];
  classes: ClassRecord[];
  schoolScopedUsers: UserRecord[];
  schoolScopedClasses: ClassRecord[];
  mySchoolId: string | null;
}

export default function ClassCreation({
  users,
  classes,
  schoolScopedUsers,
  schoolScopedClasses,
  mySchoolId,
}: ClassCreationProps) {
  // Class creation state
  const [classId, setClassId] = useState("");
  const [className, setClassName] = useState("");
  const [classTeacherUid, setClassTeacherUid] = useState("");
  const [classTeacherQuery, setClassTeacherQuery] = useState("");
  const [showClassTeacherSuggestions, setShowClassTeacherSuggestions] = useState(false);

  // Gradebook export
  const [exportClassId, setExportClassId] = useState("");

  // Class list
  const [classListLimit, setClassListLimit] = useState(50);
  const [classSort, setClassSort] = useState("id");
  const [classSortDir, setClassSortDir] = useState("asc");
  const [classListFilter, setClassListFilter] = useState("");

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

  // ---- derived data ----

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
    const q = classListFilter.trim().toLowerCase();
    if (!q) return true;
    return c.id.toLowerCase().includes(q) || String(c.name || "").toLowerCase().includes(q);
  });

  const visibleClasses = sortClasses(filteredClassList).slice(0, classListLimit);

  // ---- resolvers ----

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

  const handleDeleteClass = async (deleteClassId: string, teacherUid?: string) => {
    if (!deleteClassId) return;
    const first = window.confirm(`Delete class ${deleteClassId}? This cannot be undone.`);
    if (!first) return;
    const second = window.confirm(`Are you absolutely sure you want to delete ${deleteClassId}?`);
    if (!second) return;

    try {
      await set(ref(db, `classes/${deleteClassId}`), null);
      if (teacherUid) {
        await set(ref(db, `teachers/${teacherUid}/classes/${deleteClassId}`), null);
      }
      await logAudit("class_deleted", { classId: deleteClassId, teacherUid: teacherUid || "" });
      addToast("success", "Class deleted");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error deleting class:", err);
      addToast("error", "Error deleting class: " + message);
    }
  };

  // ---- render ----

  return (
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
              value={classListFilter}
              onChange={(e) => setClassListFilter(e.target.value)}
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
    </div>
  );
}
