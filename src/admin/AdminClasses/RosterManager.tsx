import { useState } from "react";
import { ref, set } from "firebase/database";
import { db } from "../../firebase";
import { addToast } from "@/shared/toastService";
import { formatClassLabel } from "@/shared/utils/formatters";
import { logAudit } from "@/shared/utils/auditUtils";
import type { UserRecord, ClassRecord, RosterStudent } from "./index";

interface RosterManagerProps {
  users: UserRecord[];
  schoolScopedClasses: ClassRecord[];
}

export default function RosterManager({
  users,
  schoolScopedClasses,
}: RosterManagerProps) {
  const [rosterClassId, setRosterClassId] = useState("");
  const [rosterClassQuery, setRosterClassQuery] = useState("");
  const [showRosterClassSuggestions, setShowRosterClassSuggestions] = useState(false);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterLimit, setRosterLimit] = useState(50);
  const [rosterSelected, setRosterSelected] = useState<Record<string, boolean>>({});
  const [rosterBulkTarget, setRosterBulkTarget] = useState("");

  // ---- derived data ----

  const filteredRosterClasses = schoolScopedClasses
    .filter((c) => {
      const q = rosterClassQuery.trim().toLowerCase();
      if (!q) return true;
      return c.id.toLowerCase().includes(q) || String(c.name || "").toLowerCase().includes(q);
    })
    .slice(0, 200);

  const rosterClass = schoolScopedClasses.find((c) => c.id === rosterClassId) || null;
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

  // ---- handlers ----

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
      {schoolScopedClasses
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
              {schoolScopedClasses
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
  );
}
