import { useEffect, useMemo, useState } from "react";
import { ref, get, onValue, set, push } from "firebase/database";
import { db } from "@/firebase";
import { addToast } from "@/shared/toastService";
import { PlusIcon, CheckIcon } from "@/shared/icons";
import type { User as FirebaseUser } from "firebase/auth";
import type { SchoolClass, ClassStudent, Assignment, AttendanceStatus, TeacherTemplate } from "@/types";
import { toISODate, getRecentDates } from "@/shared/utils/dateUtils";
import { useAcademicConfig } from "@/shared/hooks/useAcademicConfig";

interface Props {
  user: FirebaseUser;
}

interface ClassWithId extends SchoolClass {
  id: string;
}

interface TemplateWithId extends TeacherTemplate {
  id: string;
}

interface StudentHistoryEntry {
  name: string;
  score: number;
  maxScore: number;
  updatedAt: number | null;
}

interface AttendanceSummaryRow {
  uid: string;
  name: string;
  email?: string;
  studentId?: string;
  present?: number;
  tardy?: number;
  absent?: number;
  excused?: number;
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

export default function TeacherDashboard({ user }: Props) {
  const [classes, setClasses] = useState<ClassWithId[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [assignmentName, setAssignmentName] = useState<string>("");
  const [assignmentType, setAssignmentType] = useState<"" | "ca" | "exam">("");
  const [maxScore, setMaxScore] = useState<string>("");
  const [assignmentRubric, setAssignmentRubric] = useState<string>("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [rosterSearch, setRosterSearch] = useState<string>("");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [selectedStudent, setSelectedStudent] = useState<ClassStudent | null>(null);
  const [studentHistory, setStudentHistory] = useState<StudentHistoryEntry[]>([]);
  const [studentAverage, setStudentAverage] = useState<number | null>(null);
  const [templates, setTemplates] = useState<TemplateWithId[]>([]);
  const [templateName, setTemplateName] = useState<string>("");
  const [templateMaxScore, setTemplateMaxScore] = useState<string>("");
  const [templateRubric, setTemplateRubric] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [attendanceDate, setAttendanceDate] = useState<string>(toISODate(new Date()));
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummaryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reportComments, setReportComments] = useState<Record<string, string>>({});
  const [commentsSaving, setCommentsSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const teacherClassesRef = ref(db, `teachers/${user.uid}/classes`);
    const unsubscribe = onValue(
      teacherClassesRef,
      async (snapshot) => {
        try {
          const classIds: string[] = snapshot.exists() ? Object.keys(snapshot.val()) : [];
          if (classIds.length === 0) {
            setClasses([]);
            setLoading(false);
            return;
          }

          const classData = await Promise.all(
            classIds.map(async (id) => {
              const cSnap = await get(ref(db, `classes/${id}`));
              return cSnap.exists() ? ({ id, ...cSnap.val() } as ClassWithId) : null;
            })
          );
          setClasses(classData.filter((c): c is ClassWithId => c !== null));
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
      const list: TemplateWithId[] = Object.entries(data).map(([id, t]) => ({ id, ...(t as TeacherTemplate) }));
      setTemplates(list);
    });
    return () => unsubscribe();
  }, [user]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  const roster = useMemo((): ClassStudent[] => {
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
        setAttendance(snapshot.exists() ? (snapshot.val() as Record<string, AttendanceStatus>) : {});
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
      const summaryMap: Record<string, { present: number; tardy: number; absent: number; excused: number }> = {};
      Object.entries(data).forEach(([date, dayData]) => {
        if (!dates.has(date)) return;
        Object.entries(dayData as Record<string, AttendanceStatus>).forEach(([uid, status]) => {
          if (!summaryMap[uid]) {
            summaryMap[uid] = { present: 0, tardy: 0, absent: 0, excused: 0 };
          }
          if (summaryMap[uid][status] !== undefined) {
            summaryMap[uid][status] += 1;
          }
        });
      });
      const list: AttendanceSummaryRow[] = roster.map((s) => ({
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

  const { activeTerm } = useAcademicConfig();

  useEffect(() => {
    if (!selectedClassId || !activeTerm) return;
    const selectedClassObj = classes.find((c) => c.id === selectedClassId);
    if (!selectedClassObj?.students) return;

    const studentUids = Object.keys(selectedClassObj.students);
    const comments: Record<string, string> = {};

    Promise.all(
      studentUids.map(async (uid) => {
        const snap = await get(
          ref(db, `reportComments/${activeTerm.sessionId}/${activeTerm.termId}/${uid}/teacherComment`)
        );
        if (snap.exists()) {
          comments[uid] = snap.val() as string;
        }
      })
    ).then(() => setReportComments(comments));
  }, [selectedClassId, activeTerm, classes]);

  const filteredRoster = useMemo((): ClassStudent[] => {
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

  const handleScoreChange = (uid: string, value: string): void => {
    setScores((prev) => ({ ...prev, [uid]: value }));
  };

  const handleSubmitAssignment = async (): Promise<void> => {
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

      const gradePayload: Omit<Assignment, "type"> & { type?: "ca" | "exam" } = {
        name: assignmentName.trim(),
        score: 0, // placeholder — overridden per student below
        maxScore: Number(maxScore),
        rubric: assignmentRubric.trim() || "",
        teacherUid: user.uid,
        updatedAt: Date.now(),
        ...(assignmentType ? { type: assignmentType } : {}),
        ...(activeTerm ? { termId: activeTerm.termId, sessionId: activeTerm.sessionId } : {}),
      };

      const writes = scoredStudents.map(({ student, scoreValue }) => {
        const assignmentRef = ref(
          db,
          `grades/${student.uid}/${selectedClassId}/assignments/${assignmentId}`
        );
        return set(assignmentRef, {
          ...gradePayload,
          score: scoreValue,
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
            const assignments: Assignment[] = Object.values(assignmentsSnap.val() || {});
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
      addToast("error", "Error saving grades: " + ((err as Error).message || err));
    }
  };

  const handleSaveTemplate = async (): Promise<void> => {
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
      addToast("error", "Error saving template: " + ((err as Error).message || err));
    }
  };

  const applyTemplate = (): void => {
    if (!selectedTemplateId) return;
    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tmpl) return;
    setAssignmentName(tmpl.name || "");
    setMaxScore(String(tmpl.maxScore ?? ""));
    setAssignmentRubric(tmpl.rubric || "");
    setAssignmentType("");
    addToast("success", "Template applied");
  };

  const handleSaveAttendance = async (): Promise<void> => {
    if (!selectedClassId) {
      addToast("error", "Select a class");
      return;
    }
    try {
      await set(ref(db, `attendance/${selectedClassId}/${attendanceDate}`), attendance);
      addToast("success", "Attendance saved");
    } catch (err) {
      console.error("Error saving attendance:", err);
      addToast("error", "Error saving attendance: " + ((err as Error).message || err));
    }
  };

  const handleSaveComments = async (): Promise<void> => {
    if (!activeTerm || !selectedClassId) return;
    setCommentsSaving(true);
    try {
      const writes = Object.entries(reportComments)
        .filter(([, comment]) => comment.trim())
        .map(([uid, comment]) =>
          set(
            ref(db, `reportComments/${activeTerm.sessionId}/${activeTerm.termId}/${uid}/teacherComment`),
            comment.trim()
          )
        );
      await Promise.all(writes);
      addToast("success", "Report comments saved");
    } catch (err) {
      addToast("error", "Failed to save comments: " + (err as Error).message);
    }
    setCommentsSaving(false);
  };

  const loadStudentHistory = async (student: ClassStudent): Promise<void> => {
    if (!student || !selectedClassId) return;
    try {
      const historySnap = await get(
        ref(db, `grades/${student.uid}/${selectedClassId}/assignments`)
      );
      const data = historySnap.exists() ? historySnap.val() : {};
      const entries: StudentHistoryEntry[] = Object.values(data || {}).map((a) => {
        const assignment = a as Assignment;
        return {
          name: assignment.name,
          score: Number(assignment.score || 0),
          maxScore: Number(assignment.maxScore || 0),
          updatedAt: assignment.updatedAt || null,
        };
      });
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
          {!loading && classes.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <div className="stat-card" style={{ minWidth: 80, textAlign: "center" }}>
                <div className="stat-card-value" style={{ justifyContent: "center" }}>{classes.length}</div>
                <div className="stat-card-label">Classes</div>
              </div>
              {selectedClass && (
                <div className="stat-card" style={{ minWidth: 80, textAlign: "center" }}>
                  <div className="stat-card-value" style={{ justifyContent: "center" }}>{roster.length}</div>
                  <div className="stat-card-label">Students</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <div className="form-row">
            <select
              className="select"
              value={selectedClassId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setSelectedClassId(e.target.value);
                setScores({});
                setAssignmentType("");
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
          {activeTerm && (
            <div style={{ border: "1px solid #1a365d", borderRadius: 6, padding: "6px 12px", background: "#f0f7ff", fontSize: 13 }}>
              <strong>Active:</strong> {activeTerm.termLabel} ({activeTerm.sessionLabel})
            </div>
          )}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssignmentName(e.target.value)}
              />
              <select
                className="input"
                value={assignmentType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAssignmentType(e.target.value as "" | "ca" | "exam")}
                style={{ maxWidth: 200 }}
              >
                <option value="">Type (optional)</option>
                <option value="ca">CA (Continuous Assessment)</option>
                <option value="exam">Exam</option>
              </select>
              <input
                className="input"
                placeholder="Max score"
                type="number"
                value={maxScore}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxScore(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleSubmitAssignment}>
                <CheckIcon className="icon" /> Save Grades
              </button>
            </div>

            <div className="form-row" style={{ marginTop: 8 }}>
              <select
                className="select"
                value={selectedTemplateId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedTemplateId(e.target.value)}
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
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAssignmentRubric(e.target.value)}
              />
            </div>

            <div className="form-row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Search students (name, email, ID)"
                value={rosterSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRosterSearch(e.target.value)}
              />
              <select
                className="select"
                value={scoreFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScoreFilter(e.target.value)}
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
                    <div key={s.uid} className="roster-row">
                      <div style={{ cursor: "pointer" }} onClick={() => { setSelectedStudent(s); loadStudentHistory(s); }}>
                        <div>{s.firstName || "Student"} {s.lastInitial ? `${s.lastInitial}.` : ""}</div>
                        <div className="meta">{s.email}{s.studentId ? ` · ID: ${s.studentId}` : ""}</div>
                      </div>
                      <input
                        className="input"
                        style={{ maxWidth: 110, flex: "none" }}
                        type="number"
                        placeholder="Score"
                        value={scores[s.uid] ?? ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleScoreChange(s.uid, e.target.value)}
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemplateName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Max score"
              type="number"
              value={templateMaxScore}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemplateMaxScore(e.target.value)}
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
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTemplateRubric(e.target.value)}
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAttendanceDate(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSaveAttendance}>
              Save Attendance
            </button>
          </div>

          {selectedClass ? (
            <div style={{ marginTop: 10 }}>
              {roster.map((s) => (
                <div key={s.uid} className="roster-row">
                  <div>
                    <div>{s.firstName || "Student"} {s.lastInitial ? `${s.lastInitial}.` : ""}</div>
                    <div className="meta">{s.email}{s.studentId ? ` · ID: ${s.studentId}` : ""}</div>
                  </div>
                  <select
                    className="select"
                    style={{ width: 110 }}
                    value={attendance[s.uid] || "present"}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAttendance((prev) => ({ ...prev, [s.uid]: e.target.value as AttendanceStatus }))}
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
                      <div className="meta" style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className="attend-badge present">P: {row.present || 0}</span>
                        <span className="attend-badge tardy">T: {row.tardy || 0}</span>
                        <span className="attend-badge absent">A: {row.absent || 0}</span>
                        {(row.excused || 0) > 0 && <span className="attend-badge excused">E: {row.excused}</span>}
                        {(row.absent || 0) >= 2 && <span style={{ fontSize: "0.75rem", color: "#c02020", fontWeight: 600 }}>⚑ Attendance concern</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {selectedClassId && activeTerm && (() => {
          const selectedClassObj = classes.find((c) => c.id === selectedClassId);
          const students = selectedClassObj?.students
            ? Object.values(selectedClassObj.students).sort((a, b) =>
                (a.firstName || a.email || "").localeCompare(b.firstName || b.email || "")
              )
            : [];
          if (students.length === 0) return null;

          return (
            <div className="section">
              <h3>Report Comments — {activeTerm.termLabel}</h3>
              <p className="muted">Write a remark for each student. These appear on the published report card.</p>
              {students.map((s) => (
                <div key={s.uid} className="form-row" style={{ marginBottom: 8 }}>
                  <span style={{ minWidth: 160, fontSize: 13 }}>
                    {s.firstName || ""} {s.lastInitial || ""} {s.studentId ? `(${s.studentId})` : ""}
                  </span>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="Write a remark..."
                    value={reportComments[s.uid] || ""}
                    onChange={(e) =>
                      setReportComments((prev) => ({ ...prev, [s.uid]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <button
                className="btn btn-primary"
                style={{ marginTop: 8 }}
                onClick={handleSaveComments}
                disabled={commentsSaving}
              >
                {commentsSaving ? "Saving..." : "Save Comments"}
              </button>
            </div>
          );
        })()}

      </div>
    </div>
  );
}