import React, { useEffect, useMemo, useState } from "react";
import { ref, get, onValue, set, push } from "firebase/database";
import { db } from "./firebase";
import { addToast } from "./toastService";
import { PlusIcon, CheckIcon } from "./icons";

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

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

export default function TeacherDashboard({ user }) {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [assignmentName, setAssignmentName] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [assignmentRubric, setAssignmentRubric] = useState("");
  const [scores, setScores] = useState({});
  const [rosterSearch, setRosterSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentHistory, setStudentHistory] = useState([]);
  const [studentAverage, setStudentAverage] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [templateMaxScore, setTemplateMaxScore] = useState("");
  const [templateRubric, setTemplateRubric] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(toISODate(new Date()));
  const [attendance, setAttendance] = useState({});
  const [attendanceSummary, setAttendanceSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const teacherClassesRef = ref(db, `teachers/${user.uid}/classes`);
    const unsubscribe = onValue(
      teacherClassesRef,
      async (snapshot) => {
        try {
          const classIds = snapshot.exists() ? Object.keys(snapshot.val()) : [];
          if (classIds.length === 0) {
            setClasses([]);
            setLoading(false);
            return;
          }

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
      },
      (error) => {
        console.error("Error watching classes:", error);
        addToast("error", "Unable to load classes");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const templatesRef = ref(db, `teacherTemplates/${user.uid}`);
    const unsubscribe = onValue(templatesRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.val() : {};
      const list = Object.entries(data).map(([id, t]) => ({ id, ...t }));
      setTemplates(list);
    });
    return () => unsubscribe();
  }, [user]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  const roster = useMemo(() => {
    if (!selectedClass || !selectedClass.students) return [];
    return Object.values(selectedClass.students);
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedClassId || !attendanceDate) {
      setAttendance({});
      return;
    }
    const attendanceRef = ref(db, `attendance/${selectedClassId}/${attendanceDate}`);
    const unsubscribe = onValue(
      attendanceRef,
      (snapshot) => {
        setAttendance(snapshot.exists() ? snapshot.val() : {});
      },
      (error) => {
        console.error("Attendance read error:", error);
        addToast("error", "Unable to load attendance");
      }
    );
    return () => unsubscribe();
  }, [selectedClassId, attendanceDate]);

  useEffect(() => {
    if (!selectedClassId) {
      setAttendanceSummary([]);
      return;
    }
    const loadSummary = async () => {
      const snap = await get(ref(db, `attendance/${selectedClassId}`));
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
      const list = roster.map((s) => ({
        uid: s.uid,
        name: `${s.firstName || "Student"} ${s.lastInitial ? `${s.lastInitial}.` : ""}`.trim(),
        email: s.email,
        studentId: s.studentId,
        ...summaryMap[s.uid],
      }));
      setAttendanceSummary(list);
    };
    loadSummary();
  }, [selectedClassId, roster]);

  const filteredRoster = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    return roster.filter((s) => {
      const matchesQuery =
        !q ||
        String(s.email || "").toLowerCase().includes(q) ||
        String(s.studentId || "").toLowerCase().includes(q) ||
        String(s.firstName || "").toLowerCase().includes(q) ||
        String(s.lastInitial || "").toLowerCase().includes(q);

      if (!matchesQuery) return false;

      const hasScore = scores[s.uid] !== undefined && scores[s.uid] !== "";
      if (scoreFilter === "missing") return !hasScore;
      if (scoreFilter === "filled") return hasScore;
      return true;
    });
  }, [roster, rosterSearch, scoreFilter, scores]);

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
      const scoredStudents = roster
        .filter((s) => scores[s.uid] !== undefined && scores[s.uid] !== "")
        .map((student) => ({
          student,
          scoreValue: Number(scores[student.uid]),
        }))
        .filter((entry) => !Number.isNaN(entry.scoreValue));

      const writes = scoredStudents.map(({ student, scoreValue }) => {
        const assignmentRef = ref(
          db,
          `grades/${student.uid}/${selectedClassId}/assignments/${assignmentId}`
        );
        return set(assignmentRef, {
          name: assignmentName.trim(),
          score: scoreValue,
          maxScore: Number(maxScore),
          rubric: assignmentRubric.trim() || "",
          teacherUid: user.uid,
          updatedAt: Date.now(),
        });
      });

      if (writes.length === 0) {
        addToast("error", "Enter at least one score");
        return;
      }

      await Promise.all(writes);
      await Promise.all(
        scoredStudents.map(async ({ student, scoreValue }) => {
          const notifRef = push(ref(db, `notifications/${student.uid}`));
          await set(notifRef, {
            type: "grade",
            classId: selectedClassId,
            assignmentId,
            title: `New grade in ${selectedClassId}`,
            body: `${assignmentName.trim()}: ${scoreValue}/${Number(maxScore)}`,
            createdAt: Date.now(),
            read: false,
          });

          const assignmentsSnap = await get(
            ref(db, `grades/${student.uid}/${selectedClassId}/assignments`)
          );
          if (assignmentsSnap.exists()) {
            const assignments = Object.values(assignmentsSnap.val() || {});
            const total = assignments.reduce((sum, a) => sum + Number(a.score || 0), 0);
            const max = assignments.reduce((sum, a) => sum + Number(a.maxScore || 0), 0);
            const avg = max > 0 ? Math.round((total / max) * 100) : null;
            if (avg !== null) {
              const avgRef = push(ref(db, `notifications/${student.uid}`));
              await set(avgRef, {
                type: "average",
                classId: selectedClassId,
                title: `Average updated for ${selectedClassId}`,
                body: `Current average: ${avg}%`,
                createdAt: Date.now(),
                read: false,
              });
            }
          }
        })
      );
      addToast("success", "Grades saved");
    } catch (err) {
      console.error("Error saving grades:", err);
      addToast("error", "Error saving grades: " + (err.message || err));
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      addToast("error", "Enter a template name");
      return;
    }
    if (!templateMaxScore) {
      addToast("error", "Enter a max score");
      return;
    }
    try {
      const tmplRef = push(ref(db, `teacherTemplates/${user.uid}`));
      await set(tmplRef, {
        name: templateName.trim(),
        maxScore: Number(templateMaxScore),
        rubric: templateRubric.trim(),
        createdAt: Date.now(),
      });
      setTemplateName("");
      setTemplateMaxScore("");
      setTemplateRubric("");
      addToast("success", "Template saved");
    } catch (err) {
      console.error("Error saving template:", err);
      addToast("error", "Error saving template: " + (err.message || err));
    }
  };

  const applyTemplate = () => {
    if (!selectedTemplateId) return;
    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tmpl) return;
    setAssignmentName(tmpl.name || "");
    setMaxScore(String(tmpl.maxScore ?? ""));
    setAssignmentRubric(tmpl.rubric || "");
    addToast("success", "Template applied");
  };

  const handleSaveAttendance = async () => {
    if (!selectedClassId) {
      addToast("error", "Select a class");
      return;
    }
    try {
      await set(ref(db, `attendance/${selectedClassId}/${attendanceDate}`), attendance);
      addToast("success", "Attendance saved");
    } catch (err) {
      console.error("Error saving attendance:", err);
      addToast("error", "Error saving attendance: " + (err.message || err));
    }
  };

  const loadStudentHistory = async (student) => {
    if (!student || !selectedClassId) return;
    try {
      const historySnap = await get(
        ref(db, `grades/${student.uid}/${selectedClassId}/assignments`)
      );
      const data = historySnap.exists() ? historySnap.val() : {};
      const entries = Object.values(data || {}).map((a) => ({
        name: a.name,
        score: Number(a.score || 0),
        maxScore: Number(a.maxScore || 0),
        updatedAt: a.updatedAt || null,
      }));
      const total = entries.reduce((sum, a) => sum + a.score, 0);
      const max = entries.reduce((sum, a) => sum + a.maxScore, 0);
      const avg = max > 0 ? Math.round((total / max) * 100) : null;
      setStudentHistory(entries);
      setStudentAverage(avg);
    } catch (err) {
      console.error("Error loading student history:", err);
      addToast("error", "Unable to load student history");
    }
  };

  return (
    <div className="app-container">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Teacher Dashboard</h2>
            <div className="muted">Select a class and enter grades for an assignment.</div>
          </div>
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

            <div className="form-row" style={{ marginTop: 8 }}>
              <select
                className="select"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                <option value="">Apply template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (max {t.maxScore})
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost" onClick={applyTemplate} disabled={!selectedTemplateId}>
                Apply Template
              </button>
            </div>

            <div className="section" style={{ marginTop: 8 }}>
              <div className="small">Rubric (optional)</div>
              <textarea
                className="input"
                style={{ minHeight: 80 }}
                placeholder="Ex: 4 pts - Correct steps, 3 pts - Minor errors, 2 pts - Incomplete..."
                value={assignmentRubric}
                onChange={(e) => setAssignmentRubric(e.target.value)}
              />
            </div>

            <div className="form-row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Search students (name, email, ID)"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
              />
              <select
                className="select"
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value)}
              >
                <option value="all">All students</option>
                <option value="missing">Missing scores</option>
                <option value="filled">Filled scores</option>
              </select>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setRosterSearch("");
                  setScoreFilter("all");
                }}
              >
                Clear Filters
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {filteredRoster.length === 0 ? (
                <div className="small">No students enrolled in this class yet.</div>
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
                      }}
                    >
                      <div style={{ cursor: "pointer" }} onClick={() => { setSelectedStudent(s); loadStudentHistory(s); }}>
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
            {selectedStudent && (
              <div className="section">
                <h3>Student Details</h3>
                <div className="small">
                  {selectedStudent.firstName || "Student"} {selectedStudent.lastInitial ? `${selectedStudent.lastInitial}.` : ""} • {selectedStudent.email}
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  Current average: {studentAverage !== null ? `${studentAverage}%` : "N/A"}
                </div>
                <div style={{ marginTop: 8 }}>
                  {studentHistory.length === 0 ? (
                    <div className="small">No assignments yet.</div>
                  ) : (
                    studentHistory.map((a, idx) => (
                      <div key={idx} className="small" style={{ marginTop: 6 }}>
                        {a.name}: {a.score}/{a.maxScore}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="section">
          <h3>Assignment Templates</h3>
          <div className="small">Reuse grading structures across classes.</div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <input
              className="input"
              placeholder="Template name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Max score"
              type="number"
              value={templateMaxScore}
              onChange={(e) => setTemplateMaxScore(e.target.value)}
            />
            <button className="btn btn-ghost" onClick={handleSaveTemplate}>
              <PlusIcon className="icon" /> Save Template
            </button>
          </div>
          <div className="section" style={{ marginTop: 8 }}>
            <textarea
              className="input"
              style={{ minHeight: 70 }}
              placeholder="Rubric details (optional)"
              value={templateRubric}
              onChange={(e) => setTemplateRubric(e.target.value)}
            />
          </div>
          {templates.length > 0 && (
            <ul className="card-list" style={{ marginTop: 10 }}>
              {templates.map((t) => (
                <li key={t.id}>
                  <div>
                    <div>{t.name}</div>
                    <div className="meta">Max: {t.maxScore}</div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setSelectedTemplateId(t.id);
                      applyTemplate();
                    }}
                  >
                    Use
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="section">
          <h3>Attendance & Tardy</h3>
          <div className="small">Quick check‑in and weekly summary.</div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <input
              className="input"
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSaveAttendance}>
              Save Attendance
            </button>
          </div>

          {selectedClass ? (
            <div className="card-list" style={{ marginTop: 10 }}>
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
                      {s.email}{s.studentId ? ` - ID: ${s.studentId}` : ""}
                    </div>
                  </div>
                  <select
                    className="select"
                    value={attendance[s.uid] || "present"}
                    onChange={(e) =>
                      setAttendance((prev) => ({ ...prev, [s.uid]: e.target.value }))
                    }
                  >
                    <option value="present">Present</option>
                    <option value="tardy">Tardy</option>
                    <option value="absent">Absent</option>
                    <option value="excused">Excused</option>
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="small" style={{ marginTop: 8 }}>Select a class to take attendance.</div>
          )}

          {attendanceSummary.length > 0 && (
            <div className="section">
              <div className="small">Past 7 days summary</div>
              <ul className="card-list" style={{ marginTop: 8 }}>
                {attendanceSummary.map((row) => (
                  <li key={row.uid}>
                    <div>
                      <div>{row.name}</div>
                      <div className="meta">
                        Present {row.present || 0} · Tardy {row.tardy || 0} · Absent {row.absent || 0}
                        {row.absent >= 2 ? " · Missed days flag" : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
