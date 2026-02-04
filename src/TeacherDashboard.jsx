import React, { useEffect, useMemo, useState } from "react";
import { ref, get, set } from "firebase/database";
import { db } from "./firebase";
import Toasts from "./Toasts";
import { addToast } from "./toastService";
import { PlusIcon, CheckIcon } from "./icons";

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

export default function TeacherDashboard({ user }) {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [assignmentName, setAssignmentName] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadClasses = async () => {
      setLoading(true);
      try {
        const classIdsSnap = await get(ref(db, `teachers/${user.uid}/classes`));
        const classIds = classIdsSnap.exists() ? Object.keys(classIdsSnap.val()) : [];
        const classData = await Promise.all(
          classIds.map(async (id) => {
            const cSnap = await get(ref(db, `classes/${id}`));
            return cSnap.exists() ? { id, ...cSnap.val() } : null;
          })
        );
        setClasses(classData.filter(Boolean));
      } catch (err) {
        console.error("Error loading classes:", err);
        addToast("error", "Unable to load classes");
      } finally {
        setLoading(false);
      }
    };

    loadClasses();
  }, [user]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  const roster = useMemo(() => {
    if (!selectedClass || !selectedClass.students) return [];
    return Object.values(selectedClass.students);
  }, [selectedClass]);

  const handleScoreChange = (uid, value) => {
    setScores((prev) => ({ ...prev, [uid]: value }));
  };

  const handleSubmitAssignment = async () => {
    if (!selectedClassId) {
      addToast("error", "Select a class");
      return;
    }
    if (!assignmentName.trim()) {
      addToast("error", "Enter an assignment name");
      return;
    }
    if (!maxScore) {
      addToast("error", "Enter a max score");
      return;
    }

    const assignmentId = slugify(assignmentName);
    if (!assignmentId) {
      addToast("error", "Invalid assignment name");
      return;
    }

    try {
      const writes = roster
        .filter((s) => scores[s.uid] !== undefined && scores[s.uid] !== "")
        .map((student) => {
          const scoreValue = Number(scores[student.uid]);
          if (Number.isNaN(scoreValue)) return null;
          const assignmentRef = ref(
            db,
            `grades/${student.uid}/${selectedClassId}/assignments/${assignmentId}`
          );
          return set(assignmentRef, {
            name: assignmentName.trim(),
            score: scoreValue,
            maxScore: Number(maxScore),
            teacherUid: user.uid,
            updatedAt: Date.now(),
          });
        })
        .filter(Boolean);

      if (writes.length === 0) {
        addToast("error", "Enter at least one score");
        return;
      }

      await Promise.all(writes);
      addToast("success", "Grades saved");
    } catch (err) {
      console.error("Error saving grades:", err);
      addToast("error", "Error saving grades: " + (err.message || err));
    }
  };

  return (
    <div className="app-container">
      <div className="card" style={{ maxWidth: 900 }}>
        <Toasts />
        <div className="card-header">
          <h2>Teacher Dashboard</h2>
          <div className="muted">Select a class and enter grades for an assignment.</div>
        </div>

        <div className="section">
          <div className="form-row">
            <select
              className="select"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setScores({});
              }}
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.name || "Untitled"}
                </option>
              ))}
            </select>
          </div>
          {loading && <div className="small" style={{ marginTop: 8 }}>Loading classes...</div>}
        </div>

        {selectedClass && (
          <div className="section">
            <div className="instructions">
              Enter an assignment name once, then add scores for each student. Re‑using the same
              assignment name will overwrite (edit) previous scores.
            </div>

            <div className="form-row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Assignment name"
                value={assignmentName}
                onChange={(e) => setAssignmentName(e.target.value)}
              />
              <input
                className="input"
                placeholder="Max score"
                type="number"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleSubmitAssignment}>
                <CheckIcon className="icon" /> Save Grades
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {roster.length === 0 ? (
                <div className="small">No students enrolled in this class yet.</div>
              ) : (
                <div className="card-list">
                  {roster.map((s) => (
                    <div
                      key={s.uid}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 0",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <div>
                        <div>
                          {s.firstName || "Student"} {s.lastInitial ? `${s.lastInitial}.` : ""}
                        </div>
                        <div className="meta">
                          {s.email} {s.studentId ? `• ID: ${s.studentId}` : ""}
                        </div>
                      </div>
                      <input
                        className="input"
                        style={{ maxWidth: 120 }}
                        type="number"
                        placeholder="Score"
                        value={scores[s.uid] ?? ""}
                        onChange={(e) => handleScoreChange(s.uid, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
