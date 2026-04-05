import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ref, get, onValue, set, push, remove } from "firebase/database";
import { db } from "@/firebase";
import { addToast } from "@/shared/toastService";
import { PlusIcon, CheckIcon } from "@/shared/icons";
import Combobox from "@/shared/components/Combobox";
import type { User as FirebaseUser } from "firebase/auth";
import type { SchoolClass, ClassStudent, Assignment, AttendanceStatus, TeacherTemplate } from "@/types";

interface Props {
  user: FirebaseUser;
  selectedClassId?: string;
  onSelectClass?: (id: string) => void;
  classes?: ClassWithId[];
  classesLoading?: boolean;
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

interface HistoryAssignment {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  rubric?: string;
  type?: string;
  updatedAt: number;
}

interface StudentHistoryData {
  student: ClassStudent;
  assignments: HistoryAssignment[];
  average: number | null;
}

/* ── Widget registry (easy to extend) ── */
interface WidgetDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const WIDGETS: WidgetDef[] = [
  {
    id: "grades",
    label: "Grades",
    description: "Enter scores and manage assignments",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    id: "templates",
    label: "Templates",
    description: "Create and manage grading templates",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
      </svg>
    ),
  },
  {
    id: "history",
    label: "History",
    description: "View and edit past grades by student",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: "attendance",
    label: "Attendance",
    description: "Take attendance and view summaries",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
];

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

const toISODate = (date: Date): string => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
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

export default function TeacherDashboard({
  user,
  selectedClassId: externalClassId,
  classes: externalClasses,
}: Props) {
  const [internalClasses, setInternalClasses] = useState<ClassWithId[]>([]);
  const [internalClassId] = useState<string>("");
  const [, setInternalLoading] = useState<boolean>(false);

  const classes = externalClasses ?? internalClasses;
  const selectedClassId = externalClassId ?? internalClassId;

  /* ── Active widget (null = show widget grid) ── */
  const [activeWidget, setActiveWidget] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startHeightRef = useRef<number | null>(null);

  const openWidget = useCallback((id: string) => {
    if (containerRef.current) {
      startHeightRef.current = containerRef.current.offsetHeight;
    }
    setActiveWidget(id);
  }, []);

  const closeWidget = useCallback(() => {
    if (containerRef.current) {
      startHeightRef.current = containerRef.current.offsetHeight;
    }
    setActiveWidget(null);
  }, []);

  // FLIP animation: animate height from previous view to new view
  useLayoutEffect(() => {
    const el = containerRef.current;
    const from = startHeightRef.current;
    if (!el || from === null) return;
    const to = el.offsetHeight;
    startHeightRef.current = null;
    if (from === to) return;
    el.animate(
      [
        { height: `${from}px`, opacity: 0.5 },
        { height: `${to}px`, opacity: 1 },
      ],
      { duration: 280, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "none" }
    );
  }, [activeWidget]);

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

  // History widget state
  const [historyData, setHistoryData] = useState<StudentHistoryData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState<Record<string, boolean>>({});
  const [historyEditing, setHistoryEditing] = useState<Record<string, Record<string, Partial<HistoryAssignment>>>>({});
  const [historySearch, setHistorySearch] = useState("");

  // Reset widget when class changes
  useEffect(() => { setActiveWidget(null); }, [selectedClassId]);

  useEffect(() => {
    if (externalClasses || !user) return;
    setInternalLoading(true);
    const teacherClassesRef = ref(db, `teachers/${user.uid}/classes`);
    const unsubscribe = onValue(
      teacherClassesRef,
      async (snapshot) => {
        try {
          const classIds: string[] = snapshot.exists() ? Object.keys(snapshot.val()) : [];
          if (classIds.length === 0) { setInternalClasses([]); setInternalLoading(false); return; }
          const classData = await Promise.all(
            classIds.map(async (id) => {
              const cSnap = await get(ref(db, `classes/${id}`));
              return cSnap.exists() ? ({ id, ...cSnap.val() } as ClassWithId) : null;
            })
          );
          setInternalClasses(classData.filter((c): c is ClassWithId => c !== null));
        } catch (err) {
          console.error("Error loading classes:", err);
          addToast("error", "Unable to load classes");
        } finally { setInternalLoading(false); }
      },
      (error) => { console.error("Error watching classes:", error); addToast("error", "Unable to load classes"); setInternalLoading(false); }
    );
    return () => unsubscribe();
  }, [user, externalClasses]);

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

  const selectedClass = useMemo(() => classes.find((c) => c.id === selectedClassId) || null, [classes, selectedClassId]);

  const roster = useMemo((): ClassStudent[] => {
    if (!selectedClass || !selectedClass.students) return [];
    return Object.values(selectedClass.students);
  }, [selectedClass]);

  // Load history data when History widget is opened
  useEffect(() => {
    if (activeWidget !== "history" || !selectedClassId || roster.length === 0) return;
    let cancelled = false;
    const load = async () => {
      setHistoryLoading(true);
      try {
        const results: StudentHistoryData[] = await Promise.all(
          roster.map(async (student) => {
            const snap = await get(ref(db, `grades/${student.uid}/${selectedClassId}/assignments`));
            const raw = snap.exists() ? snap.val() : {};
            const assignments: HistoryAssignment[] = Object.entries(raw).map(([id, a]) => {
              const asn = a as Assignment;
              return {
                id,
                name: asn.name,
                score: Number(asn.score || 0),
                maxScore: Number(asn.maxScore || 0),
                rubric: asn.rubric || "",
                type: asn.type || "",
                updatedAt: asn.updatedAt || 0,
              };
            });
            assignments.sort((a, b) => b.updatedAt - a.updatedAt);
            const total = assignments.reduce((s, a) => s + a.score, 0);
            const max = assignments.reduce((s, a) => s + a.maxScore, 0);
            return { student, assignments, average: max > 0 ? Math.round((total / max) * 100) : null };
          })
        );
        if (!cancelled) {
          setHistoryData(results);
          setHistoryExpanded({});
          setHistoryEditing({});
          setHistorySearch("");
        }
      } catch (err) {
        console.error("Error loading history:", err);
        addToast("error", "Unable to load student history");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activeWidget, selectedClassId, roster]);

  useEffect(() => {
    if (!selectedClassId || !attendanceDate) { setAttendance({}); return; }
    const attendanceRef = ref(db, `attendance/${selectedClassId}/${attendanceDate}`);
    const unsubscribe = onValue(attendanceRef, (snapshot) => {
      setAttendance(snapshot.exists() ? (snapshot.val() as Record<string, AttendanceStatus>) : {});
    }, (error) => { console.error("Attendance read error:", error); addToast("error", "Unable to load attendance"); });
    return () => unsubscribe();
  }, [selectedClassId, attendanceDate]);

  useEffect(() => {
    if (!selectedClassId) { setAttendanceSummary([]); return; }
    const loadSummary = async () => {
      const snap = await get(ref(db, `attendance/${selectedClassId}`));
      const data = snap.exists() ? snap.val() : {};
      const dates = new Set(getRecentDates(7));
      const summaryMap: Record<string, { present: number; tardy: number; absent: number; excused: number }> = {};
      Object.entries(data).forEach(([date, dayData]) => {
        if (!dates.has(date)) return;
        Object.entries(dayData as Record<string, AttendanceStatus>).forEach(([uid, status]) => {
          if (!summaryMap[uid]) summaryMap[uid] = { present: 0, tardy: 0, absent: 0, excused: 0 };
          if (summaryMap[uid][status] !== undefined) summaryMap[uid][status] += 1;
        });
      });
      const list: AttendanceSummaryRow[] = roster.map((s) => ({
        uid: s.uid,
        name: `${s.firstName || "Student"} ${s.lastInitial ? `${s.lastInitial}.` : ""}`.trim(),
        email: s.email, studentId: s.studentId, ...summaryMap[s.uid],
      }));
      setAttendanceSummary(list);
    };
    loadSummary();
  }, [selectedClassId, roster]);

  const filteredRoster = useMemo((): ClassStudent[] => {
    const q = rosterSearch.trim().toLowerCase();
    return roster.filter((s) => {
      const matchesQuery = !q || String(s.email || "").toLowerCase().includes(q) || String(s.studentId || "").toLowerCase().includes(q) || String(s.firstName || "").toLowerCase().includes(q) || String(s.lastInitial || "").toLowerCase().includes(q);
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
    if (!selectedClassId) { addToast("error", "Select a class"); return; }
    if (!assignmentName.trim()) { addToast("error", "Enter an assignment name"); return; }
    if (!maxScore) { addToast("error", "Enter a max score"); return; }
    const assignmentId = slugify(assignmentName);
    if (!assignmentId) { addToast("error", "Invalid assignment name"); return; }
    try {
      const scoredStudents = roster
        .filter((s) => scores[s.uid] !== undefined && scores[s.uid] !== "")
        .map((student) => ({ student, scoreValue: Number(scores[student.uid]) }))
        .filter((entry) => !Number.isNaN(entry.scoreValue));
      const gradePayload: Omit<Assignment, "type"> & { type?: "ca" | "exam" } = {
        name: assignmentName.trim(), score: 0, maxScore: Number(maxScore),
        rubric: assignmentRubric.trim() || "", teacherUid: user.uid, updatedAt: Date.now(),
        ...(assignmentType ? { type: assignmentType } : {}),
      };
      const writes = scoredStudents.map(({ student, scoreValue }) => {
        const assignmentRef = ref(db, `grades/${student.uid}/${selectedClassId}/assignments/${assignmentId}`);
        return set(assignmentRef, { ...gradePayload, score: scoreValue });
      });
      if (writes.length === 0) { addToast("error", "Enter at least one score"); return; }
      await Promise.all(writes);
      await Promise.all(
        scoredStudents.map(async ({ student, scoreValue }) => {
          const notifRef = push(ref(db, `notifications/${student.uid}`));
          await set(notifRef, { type: "grade", classId: selectedClassId, assignmentId, title: `New grade in ${selectedClassId}`, body: `${assignmentName.trim()}: ${scoreValue}/${Number(maxScore)}`, createdAt: Date.now(), read: false });
          const assignmentsSnap = await get(ref(db, `grades/${student.uid}/${selectedClassId}/assignments`));
          if (assignmentsSnap.exists()) {
            const assignments: Assignment[] = Object.values(assignmentsSnap.val() || {});
            const total = assignments.reduce((sum, a) => sum + Number(a.score || 0), 0);
            const max = assignments.reduce((sum, a) => sum + Number(a.maxScore || 0), 0);
            const avg = max > 0 ? Math.round((total / max) * 100) : null;
            if (avg !== null) {
              const avgRef = push(ref(db, `notifications/${student.uid}`));
              await set(avgRef, { type: "average", classId: selectedClassId, title: `Average updated for ${selectedClassId}`, body: `Current average: ${avg}%`, createdAt: Date.now(), read: false });
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
    if (!templateName.trim()) { addToast("error", "Enter a template name"); return; }
    if (!templateMaxScore) { addToast("error", "Enter a max score"); return; }
    try {
      const tmplRef = push(ref(db, `teacherTemplates/${user.uid}`));
      await set(tmplRef, { name: templateName.trim(), maxScore: Number(templateMaxScore), rubric: templateRubric.trim(), createdAt: Date.now() });
      setTemplateName(""); setTemplateMaxScore(""); setTemplateRubric("");
      addToast("success", "Template saved");
    } catch (err) {
      console.error("Error saving template:", err);
      addToast("error", "Error saving template: " + ((err as Error).message || err));
    }
  };

  const applyTemplate = (templateId?: string): void => {
    const id = templateId || selectedTemplateId;
    if (!id) return;
    const tmpl = templates.find((t) => t.id === id);
    if (!tmpl) return;
    setAssignmentName(tmpl.name || "");
    setMaxScore(String(tmpl.maxScore ?? ""));
    setAssignmentRubric(tmpl.rubric || "");
    setAssignmentType("");
    setSelectedTemplateId(id);
    openWidget("grades");
    addToast("success", "Template applied");
  };

  const handleSaveAttendance = async (): Promise<void> => {
    if (!selectedClassId) { addToast("error", "Select a class"); return; }
    try {
      await set(ref(db, `attendance/${selectedClassId}/${attendanceDate}`), attendance);
      addToast("success", "Attendance saved");
    } catch (err) {
      console.error("Error saving attendance:", err);
      addToast("error", "Error saving attendance: " + ((err as Error).message || err));
    }
  };

  const loadStudentHistory = async (student: ClassStudent): Promise<void> => {
    if (!student || !selectedClassId) return;
    try {
      const historySnap = await get(ref(db, `grades/${student.uid}/${selectedClassId}/assignments`));
      const data = historySnap.exists() ? historySnap.val() : {};
      const entries: StudentHistoryEntry[] = Object.values(data || {}).map((a) => {
        const assignment = a as Assignment;
        return { name: assignment.name, score: Number(assignment.score || 0), maxScore: Number(assignment.maxScore || 0), updatedAt: assignment.updatedAt || null };
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

  /* ── Back button ── */
  const BackButton = () => (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={closeWidget}
      style={{ marginBottom: 12 }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );

  /* ── Widget content renderers ── */
  const renderGrades = () => (
    <div className="section widget-content">
      <BackButton />
      <h3>Grades</h3>
      <div className="instructions">
        Enter an assignment name once, then add scores for each student. Re-using the same
        assignment name will overwrite (edit) previous scores.
      </div>

      <div className="form-row" style={{ marginTop: 8 }}>
        <input className="input" placeholder="Assignment name" value={assignmentName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssignmentName(e.target.value)} />
        <Combobox
          options={[
            { value: "", label: "Type (optional)" },
            { value: "ca", label: "CA (Continuous Assessment)" },
            { value: "exam", label: "Exam" },
          ]}
          value={assignmentType}
          onChange={(v) => setAssignmentType(v as "" | "ca" | "exam")}
          placeholder="Type (optional)"
          style={{ maxWidth: 200 }}
        />
        <input className="input" placeholder="Max score" type="number" value={maxScore}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxScore(e.target.value)} />
        <button className="btn btn-primary" onClick={handleSubmitAssignment}>
          <CheckIcon className="icon" /> Save Grades
        </button>
      </div>

      <div className="form-row" style={{ marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={() => applyTemplate()}>
          Apply Template
        </button>
      </div>

      <div className="section" style={{ marginTop: 8 }}>
        <div className="small">Rubric (optional)</div>
        <textarea className="input" style={{ minHeight: 80, width: "100%", boxSizing: "border-box" }}
          placeholder="Ex: 4 pts - Correct steps, 3 pts - Minor errors, 2 pts - Incomplete..."
          value={assignmentRubric}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAssignmentRubric(e.target.value)} />
      </div>

      <div className="form-row" style={{ marginTop: 8 }}>
        <input className="input" placeholder="Search students (name, email, ID)" value={rosterSearch}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRosterSearch(e.target.value)} />
        <Combobox
          options={[
            { value: "all", label: "All students" },
            { value: "missing", label: "Missing scores" },
            { value: "filled", label: "Filled scores" },
          ]}
          value={scoreFilter}
          onChange={(v) => setScoreFilter(v)}
        />
        <button className="btn btn-ghost" onClick={() => { setRosterSearch(""); setScoreFilter("all"); }}>
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
                <input className="input" style={{ maxWidth: 110, flex: "none" }} type="number" placeholder="Score"
                  value={scores[s.uid] ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleScoreChange(s.uid, e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedStudent && (
        <div className="section">
          <h3>Student Details</h3>
          <div className="small">
            {selectedStudent.firstName || "Student"} {selectedStudent.lastInitial ? `${selectedStudent.lastInitial}.` : ""} &middot; {selectedStudent.email}
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
  );

  const renderTemplates = () => (
    <div className="section widget-content">
      <BackButton />
      <h3>Assignment Templates</h3>
      <div className="small">Reuse grading structures across classes.</div>
      <div className="form-row" style={{ marginTop: 8 }}>
        <input className="input" placeholder="Template name" value={templateName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemplateName(e.target.value)} />
        <input className="input" placeholder="Max score" type="number" value={templateMaxScore}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemplateMaxScore(e.target.value)} />
        <button className="btn btn-ghost" onClick={handleSaveTemplate}>
          <PlusIcon className="icon" /> Save Template
        </button>
      </div>
      <div className="section" style={{ marginTop: 8 }}>
        <textarea className="input" style={{ minHeight: 70, width: "100%", boxSizing: "border-box" }}
          placeholder="Rubric details (optional)" value={templateRubric}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTemplateRubric(e.target.value)} />
      </div>
      {templates.length > 0 && (
        <ul className="card-list" style={{ marginTop: 10 }}>
          {templates.map((t) => (
            <li key={t.id}>
              <div>
                <div>{t.name}</div>
                <div className="meta">Max: {t.maxScore}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => applyTemplate(t.id)}>
                Use
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderAttendance = () => (
    <div className="section widget-content">
      <BackButton />
      <h3>Attendance & Tardy</h3>
      <div className="small">Quick check-in and weekly summary.</div>
      <div className="form-row" style={{ marginTop: 8 }}>
        <input className="input" type="date" value={attendanceDate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAttendanceDate(e.target.value)} />
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
              <Combobox
                options={[
                  { value: "present", label: "Present" },
                  { value: "tardy", label: "Tardy" },
                  { value: "absent", label: "Absent" },
                  { value: "excused", label: "Excused" },
                ]}
                value={attendance[s.uid] || "present"}
                onChange={(v) => setAttendance((prev) => ({ ...prev, [s.uid]: v as AttendanceStatus }))}
                style={{ width: 130 }}
              />
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
                    {(row.absent || 0) >= 2 && <span style={{ fontSize: "0.75rem", color: "#c02020", fontWeight: 600 }}>Attendance concern</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  /* ── History helpers ── */
  const getHistoryEdit = (uid: string, asnId: string): Partial<HistoryAssignment> =>
    historyEditing[uid]?.[asnId] ?? {};

  const setHistoryField = (uid: string, asnId: string, field: keyof HistoryAssignment, value: string | number) => {
    setHistoryEditing((prev) => ({
      ...prev,
      [uid]: { ...(prev[uid] || {}), [asnId]: { ...(prev[uid]?.[asnId] || {}), [field]: value } },
    }));
  };

  const handleHistorySave = async (uid: string, asnId: string, original: HistoryAssignment) => {
    if (!selectedClassId) return;
    const edits = getHistoryEdit(uid, asnId);
    const updated = { ...original, ...edits, updatedAt: Date.now() };
    try {
      const asnRef = ref(db, `grades/${uid}/${selectedClassId}/assignments/${asnId}`);
      await set(asnRef, {
        name: updated.name,
        score: Number(updated.score),
        maxScore: Number(updated.maxScore),
        rubric: updated.rubric || "",
        type: updated.type || "",
        teacherUid: user.uid,
        updatedAt: updated.updatedAt,
      });
      // Update local state
      setHistoryData((prev) =>
        prev.map((sd) => {
          if (sd.student.uid !== uid) return sd;
          const newAssignments = sd.assignments.map((a) => (a.id === asnId ? { ...a, ...updated } : a));
          const total = newAssignments.reduce((s, a) => s + Number(a.score), 0);
          const max = newAssignments.reduce((s, a) => s + Number(a.maxScore), 0);
          return { ...sd, assignments: newAssignments, average: max > 0 ? Math.round((total / max) * 100) : null };
        })
      );
      setHistoryEditing((prev) => {
        const copy = { ...prev };
        if (copy[uid]) { delete copy[uid][asnId]; if (Object.keys(copy[uid]).length === 0) delete copy[uid]; }
        return copy;
      });
      addToast("success", "Assignment updated");
    } catch (err) {
      console.error("Error updating assignment:", err);
      addToast("error", "Failed to update assignment");
    }
  };

  const handleHistoryDelete = async (uid: string, asnId: string) => {
    if (!selectedClassId) return;
    try {
      await remove(ref(db, `grades/${uid}/${selectedClassId}/assignments/${asnId}`));
      setHistoryData((prev) =>
        prev.map((sd) => {
          if (sd.student.uid !== uid) return sd;
          const newAssignments = sd.assignments.filter((a) => a.id !== asnId);
          const total = newAssignments.reduce((s, a) => s + Number(a.score), 0);
          const max = newAssignments.reduce((s, a) => s + Number(a.maxScore), 0);
          return { ...sd, assignments: newAssignments, average: max > 0 ? Math.round((total / max) * 100) : null };
        })
      );
      addToast("success", "Assignment deleted");
    } catch (err) {
      console.error("Error deleting assignment:", err);
      addToast("error", "Failed to delete assignment");
    }
  };

  const renderHistory = () => {
    const q = historySearch.trim().toLowerCase();
    const filtered = q
      ? historyData.filter((sd) =>
          (sd.student.firstName || "").toLowerCase().includes(q) ||
          (sd.student.email || "").toLowerCase().includes(q) ||
          (sd.student.studentId || "").toLowerCase().includes(q)
        )
      : historyData;

    return (
      <div className="section widget-content">
        <BackButton />
        <h3>Grade History</h3>
        <div className="small">View and edit past assignments for each student.</div>

        <div className="form-row" style={{ marginTop: 8 }}>
          <input
            className="input"
            placeholder="Search students..."
            value={historySearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHistorySearch(e.target.value)}
          />
        </div>

        {historyLoading ? (
          <div className="small" style={{ marginTop: 16, textAlign: "center" }}>Loading history…</div>
        ) : filtered.length === 0 ? (
          <div className="small" style={{ marginTop: 16 }}>No student data found.</div>
        ) : (
          <div className="history-list" style={{ marginTop: 12 }}>
            {filtered.map((sd) => {
              const expanded = historyExpanded[sd.student.uid] ?? false;
              const name = `${sd.student.firstName || "Student"} ${sd.student.lastInitial ? `${sd.student.lastInitial}.` : ""}`.trim();
              return (
                <div key={sd.student.uid} className={`history-student${expanded ? " expanded" : ""}`}>
                  <button
                    type="button"
                    className="history-student-header"
                    onClick={() => setHistoryExpanded((prev) => ({ ...prev, [sd.student.uid]: !expanded }))}
                  >
                    <div className="history-student-info">
                      <span className="history-student-name">{name}</span>
                      <span className="history-student-meta">
                        {sd.student.email}{sd.student.studentId ? ` · ${sd.student.studentId}` : ""}
                      </span>
                    </div>
                    <div className="history-student-stats">
                      <span className="history-avg">
                        {sd.average !== null ? `${sd.average}%` : "N/A"}
                      </span>
                      <span className="history-count">{sd.assignments.length} assignment{sd.assignments.length !== 1 ? "s" : ""}</span>
                      <svg
                        className={`history-chevron${expanded ? " open" : ""}`}
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </button>

                  {expanded && (
                    <div className="history-assignments">
                      {sd.assignments.length === 0 ? (
                        <div className="small" style={{ padding: "12px 16px" }}>No assignments yet.</div>
                      ) : (
                        sd.assignments.map((asn) => {
                          const edits = getHistoryEdit(sd.student.uid, asn.id);
                          const hasEdits = Object.keys(edits).length > 0;
                          const displayName = edits.name ?? asn.name;
                          const displayScore = edits.score ?? asn.score;
                          const displayMax = edits.maxScore ?? asn.maxScore;
                          const displayRubric = edits.rubric ?? asn.rubric ?? "";
                          const dateStr = asn.updatedAt
                            ? new Date(asn.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                            : "—";

                          return (
                            <div key={asn.id} className="history-assignment-row">
                              <div className="history-asn-main">
                                <input
                                  className="input history-asn-input history-asn-name"
                                  value={displayName}
                                  onChange={(e) => setHistoryField(sd.student.uid, asn.id, "name", e.target.value)}
                                  placeholder="Name"
                                />
                                <div className="history-asn-scores">
                                  <input
                                    className="input history-asn-input history-asn-score"
                                    type="number"
                                    value={displayScore}
                                    onChange={(e) => setHistoryField(sd.student.uid, asn.id, "score", Number(e.target.value))}
                                    placeholder="Score"
                                  />
                                  <span className="history-asn-divider">/</span>
                                  <input
                                    className="input history-asn-input history-asn-score"
                                    type="number"
                                    value={displayMax}
                                    onChange={(e) => setHistoryField(sd.student.uid, asn.id, "maxScore", Number(e.target.value))}
                                    placeholder="Max"
                                  />
                                </div>
                                <span className="history-asn-date">{dateStr}</span>
                                {asn.type && <span className="history-asn-type">{asn.type.toUpperCase()}</span>}
                              </div>
                              <div className="history-asn-rubric-row">
                                <input
                                  className="input history-asn-input"
                                  value={displayRubric}
                                  onChange={(e) => setHistoryField(sd.student.uid, asn.id, "rubric", e.target.value)}
                                  placeholder="Rubric (optional)"
                                  style={{ flex: 1 }}
                                />
                              </div>
                              <div className="history-asn-actions">
                                {hasEdits && (
                                  <button
                                    className="btn btn-primary btn-xs"
                                    onClick={() => handleHistorySave(sd.student.uid, asn.id, asn)}
                                  >
                                    Save
                                  </button>
                                )}
                                <button
                                  className="btn btn-danger btn-xs"
                                  onClick={() => handleHistoryDelete(sd.student.uid, asn.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const widgetRenderers: Record<string, () => React.ReactNode> = {
    grades: renderGrades,
    templates: renderTemplates,
    attendance: renderAttendance,
    history: renderHistory,
  };

  return (
    <>
      {!selectedClass ? (
        <div className="muted">Select a class from the sidebar to get started.</div>
      ) : (
        <div
          ref={containerRef}
          className="widget-transition"
        >
          {activeWidget && widgetRenderers[activeWidget] ? (
            widgetRenderers[activeWidget]()
          ) : (
            <div className="widget-grid">
              {WIDGETS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="widget-card"
                  onClick={() => openWidget(w.id)}
                >
                  <div className="widget-icon">{w.icon}</div>
                  <div className="widget-label">{w.label}</div>
                  <div className="widget-desc">{w.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
