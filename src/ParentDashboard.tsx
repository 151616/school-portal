import { useEffect, useMemo, useState } from "react";
import { get, onValue, ref } from "firebase/database";
import { db } from "./firebase";
import { addToast as _addToast } from "./toastService";
import AddChildModal from "./AddChildModal";
import type { User as FirebaseUser } from "firebase/auth";
import type { User, Assignment, SchoolClass, AttendanceStatus, SchoolSettings } from "./types";

interface Props {
  user: FirebaseUser;
}

interface ClassGradeData {
  assignments: Array<Assignment & { id: string }>;
  caAssignments: Array<Assignment & { id: string }>;
  examAssignments: Array<Assignment & { id: string }>;
  untypedAssignments: Array<Assignment & { id: string }>;
  weightedAvg: number | null;
  simpleAvg: number | null;
  average: number | null;
}

export default function ParentDashboard({ user }: Props) {
  const [children, setChildren] = useState<string[]>([]);
  const [activeChildUid, setActiveChildUid] = useState<string | null>(null);
  const [childProfiles, setChildProfiles] = useState<Record<string, User>>({});
  const [grades, setGrades] = useState<Record<string, { assignments?: Record<string, Assignment> }>>({});
  const [classes, setClasses] = useState<Record<string, SchoolClass>>({});
  const [attendance, setAttendance] = useState<Record<string, Record<string, AttendanceStatus>>>({});
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [tab, setTab] = useState<string>("grades");
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [showAddChild, setShowAddChild] = useState<boolean>(false);

  // Load linked children
  useEffect(() => {
    if (!user) return;
    const parentsRef = ref(db, `parents/${user.uid}/children`);
    const unsub = onValue(parentsRef, (snap) => {
      const data = snap.val() || {};
      const childUids: string[] = Object.keys(data);
      setChildren(childUids);
      if (childUids.length > 0 && !activeChildUid) {
        setActiveChildUid(childUids[0] ?? null);
      }
      if (childUids.length === 0) {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [user]);

  // Load child profiles
  useEffect(() => {
    if (children.length === 0) return;
    const profiles: Record<string, User> = {};
    const promises = children.map(async (uid) => {
      const snap = await get(ref(db, `Users/${uid}`));
      if (snap.exists()) profiles[uid] = snap.val() as User;
    });
    Promise.all(promises).then(() => setChildProfiles(profiles));
  }, [children]);

  // Load school settings
  useEffect(() => {
    if (!user) return;
    const settingsRef = ref(db, "schoolSettings/default");
    const unsub = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        setSchoolSettings(snap.val() as SchoolSettings);
      } else {
        setSchoolSettings({ caWeight: 40, examWeight: 60 });
      }
    });
    return () => unsub();
  }, [user]);

  // Load active child's grades
  useEffect(() => {
    if (!activeChildUid) return;
    setLoading(true);
    const gradesRef = ref(db, `grades/${activeChildUid}`);
    const unsub = onValue(gradesRef, (snap) => {
      setGrades(snap.val() || {});
      setLoading(false);
    });
    return () => unsub();
  }, [activeChildUid]);

  // Load active child's classes
  useEffect(() => {
    if (!activeChildUid) return;
    const unsub = onValue(ref(db, "classes"), async (snap) => {
      const all = snap.val() || {};
      const enrolled: Record<string, SchoolClass> = {};
      Object.entries(all).forEach(([classId, classData]) => {
        const cls = classData as SchoolClass & { students?: Record<string, unknown> };
        if (cls?.students?.[activeChildUid]) {
          enrolled[classId] = cls;
        }
      });
      setClasses(enrolled);
    }, (_err) => {
      // If bulk read fails, try reading each class from grades
      const classIds = Object.keys(grades);
      const enrolled: Record<string, SchoolClass> = {};
      Promise.all(
        classIds.map(async (classId) => {
          try {
            const snap = await get(ref(db, `classes/${classId}`));
            if (snap.exists()) enrolled[classId] = snap.val() as SchoolClass;
          } catch (e) {
            console.debug("Cannot read class", classId);
          }
        })
      ).then(() => setClasses(enrolled));
    });
    return () => unsub();
  }, [activeChildUid, grades]);

  // Load active child's attendance (last 7 days)
  useEffect(() => {
    if (!activeChildUid || Object.keys(classes).length === 0) return;
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0]!);
    }

    const attendanceData: Record<string, Record<string, AttendanceStatus>> = {};
    const promises = Object.keys(classes).flatMap((classId) =>
      dates.map(async (date) => {
        try {
          const snap = await get(
            ref(db, `attendance/${classId}/${date}/${activeChildUid}`)
          );
          if (snap.exists()) {
            if (!attendanceData[classId]) attendanceData[classId] = {};
            attendanceData[classId][date] = snap.val() as AttendanceStatus;
          }
        } catch (e) {
          // Parent may not have read access to full attendance node
        }
      })
    );

    Promise.all(promises).then(() => setAttendance(attendanceData));
  }, [activeChildUid, classes]);

  const activeChild: User | null = childProfiles[activeChildUid ?? ""] || null;

  const classGrades = useMemo((): Record<string, ClassGradeData> => {
    const result: Record<string, ClassGradeData> = {};
    Object.entries(grades).forEach(([classId, classData]) => {
      const assignments = classData?.assignments || {};
      const list: Array<Assignment & { id: string }> = Object.entries(assignments).map(([id, a]) => ({
        id,
        ...a,
      }));
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const caAssignments = list.filter((a) => a.type === "ca");
      const examAssignments = list.filter((a) => a.type === "exam");
      const untyped = list.filter((a) => !a.type);

      let weightedAvg: number | null = null;
      if (
        schoolSettings &&
        (caAssignments.length > 0 || examAssignments.length > 0)
      ) {
        const caTotal = caAssignments.reduce((s, a) => s + (a.score || 0), 0);
        const caMax = caAssignments.reduce((s, a) => s + (a.maxScore || 0), 0);
        const examTotal = examAssignments.reduce(
          (s, a) => s + (a.score || 0),
          0
        );
        const examMax = examAssignments.reduce(
          (s, a) => s + (a.maxScore || 0),
          0
        );

        const caPercent = caMax > 0 ? (caTotal / caMax) * 100 : 0;
        const examPercent = examMax > 0 ? (examTotal / examMax) * 100 : 0;
        const caW = schoolSettings.caWeight / 100;
        const examW = schoolSettings.examWeight / 100;

        if (caMax > 0 && examMax > 0) {
          weightedAvg = caPercent * caW + examPercent * examW;
        } else if (caMax > 0) {
          weightedAvg = caPercent;
        } else if (examMax > 0) {
          weightedAvg = examPercent;
        }
      }

      const totalScore = list.reduce((s, a) => s + (a.score || 0), 0);
      const totalMax = list.reduce((s, a) => s + (a.maxScore || 0), 0);
      const simpleAvg = totalMax > 0 ? (totalScore / totalMax) * 100 : null;

      result[classId] = {
        assignments: list,
        caAssignments,
        examAssignments,
        untypedAssignments: untyped,
        weightedAvg,
        simpleAvg,
        average: weightedAvg !== null ? weightedAvg : simpleAvg,
      };
    });
    return result;
  }, [grades, schoolSettings]);

  const letterGrade = (pct: number | null | undefined): string => {
    if (pct === null || pct === undefined) return "—";
    if (pct >= 90) return "A";
    if (pct >= 80) return "B";
    if (pct >= 70) return "C";
    if (pct >= 60) return "D";
    return "F";
  };

  const overallAverage = useMemo((): number | null => {
    const avgs = Object.values(classGrades)
      .map((c) => c.average)
      .filter((a): a is number => a !== null);
    if (avgs.length === 0) return null;
    return avgs.reduce((s, a) => s + a, 0) / avgs.length;
  }, [classGrades]);

  const toggleClass = (classId: string): void => {
    setExpandedClasses((prev) => ({ ...prev, [classId]: !prev[classId] }));
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="card">Loading your dashboard...</div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="app-container">
        <div className="card">
          <div className="card-header">
            <h2>Parent Dashboard</h2>
            <div className="muted">
              No children linked yet. Use the "Add Child" button to link your
              child's account using their parent code.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Child Switcher */}
      {children.length > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {children.map((uid) => {
              const profile = childProfiles[uid];
              const name = profile
                ? `${profile.firstName || ""} ${profile.lastInitial || ""}`.trim()
                : uid.slice(0, 8);
              return (
                <button
                  key={uid}
                  className={`btn ${uid === activeChildUid ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setActiveChildUid(uid)}
                >
                  {name}
                  {profile?.studentId ? ` (${profile.studentId})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>
            {activeChild
              ? `${activeChild.firstName || ""} ${activeChild.lastInitial || ""}`.trim()
              : "Student"}
          </h2>
          <div className="muted">
            {activeChild?.studentId && <>ID: {activeChild.studentId} &middot; </>}
            {Object.keys(classes).length} class
            {Object.keys(classes).length !== 1 ? "es" : ""} &middot;{" "}
            Overall: {overallAverage !== null ? `${overallAverage.toFixed(1)}% (${letterGrade(overallAverage)})` : "No grades yet"}
          </div>
        </div>
      </div>

      {/* Add Child Button */}
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={() => setShowAddChild(true)}>
          + Add Child
        </button>
      </div>

      {showAddChild && (
        <AddChildModal
          onClose={() => setShowAddChild(false)}
          onLinked={() => {}}
        />
      )}

      {/* Tab Navigation */}
      <div className="form-row" style={{ marginBottom: 16, gap: 8 }}>
        {["grades", "attendance", "assignments"].map((t) => (
          <button
            key={t}
            className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Grades Tab */}
      {tab === "grades" && (
        <div>
          {Object.entries(classGrades).length === 0 && (
            <div className="card">
              <div className="muted">No grades recorded yet.</div>
            </div>
          )}
          {Object.entries(classGrades).map(([classId, data]) => {
            const cls = classes[classId];
            const expanded = expandedClasses[classId];
            return (
              <div className="card" key={classId} style={{ marginBottom: 12 }}>
                <div
                  className="card-header"
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleClass(classId)}
                >
                  <h3 style={{ margin: 0 }}>
                    {cls?.name || classId}{" "}
                    <span className="muted" style={{ fontWeight: "normal" }}>
                      {data.average !== null
                        ? `${data.average.toFixed(1)}% (${letterGrade(data.average)})`
                        : "—"}
                    </span>
                  </h3>
                  <span className="muted">{expanded ? "▲" : "▼"}</span>
                </div>

                {/* Progress bar */}
                {data.average !== null && (
                  <div
                    style={{
                      background: "var(--border)",
                      borderRadius: 4,
                      height: 6,
                      margin: "8px 0",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(data.average, 100)}%`,
                        height: "100%",
                        background: "var(--accent)",
                        borderRadius: 4,
                      }}
                    />
                  </div>
                )}

                {expanded && (
                  <div style={{ marginTop: 12 }}>
                    {/* CA/Exam breakdown if weights are configured */}
                    {schoolSettings &&
                      (data.caAssignments.length > 0 ||
                        data.examAssignments.length > 0) && (
                        <div
                          className="muted small"
                          style={{ marginBottom: 8 }}
                        >
                          CA ({schoolSettings.caWeight}%):{" "}
                          {data.caAssignments.length} assignments &middot; Exam (
                          {schoolSettings.examWeight}%):{" "}
                          {data.examAssignments.length} assignments
                        </div>
                      )}

                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{ textAlign: "left", padding: "4px 8px" }}>
                            Assignment
                          </th>
                          <th style={{ textAlign: "left", padding: "4px 8px" }}>
                            Type
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 8px" }}>
                            Score
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 8px" }}>
                            %
                          </th>
                          <th style={{ textAlign: "center", padding: "4px 8px" }}>
                            Grade
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.assignments.map((a) => {
                          const pct =
                            a.maxScore > 0
                              ? (a.score / a.maxScore) * 100
                              : null;
                          return (
                            <tr
                              key={a.id}
                              style={{
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              <td style={{ padding: "4px 8px" }}>{a.name}</td>
                              <td
                                style={{ padding: "4px 8px" }}
                                className="muted small"
                              >
                                {a.type === "ca"
                                  ? "CA"
                                  : a.type === "exam"
                                  ? "Exam"
                                  : "—"}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "4px 8px",
                                }}
                              >
                                {a.score}/{a.maxScore}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "4px 8px",
                                }}
                              >
                                {pct !== null ? `${pct.toFixed(1)}%` : "—"}
                              </td>
                              <td
                                style={{
                                  textAlign: "center",
                                  padding: "4px 8px",
                                }}
                              >
                                {letterGrade(pct)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Attendance Tab */}
      {tab === "attendance" && (
        <div>
          {Object.keys(classes).length === 0 && (
            <div className="card">
              <div className="muted">No classes enrolled.</div>
            </div>
          )}
          {Object.entries(classes).map(([classId, cls]) => {
            const classAttendance = attendance[classId] || {};
            const dates = Object.keys(classAttendance).sort().reverse();
            const counts: Record<AttendanceStatus, number> = { present: 0, tardy: 0, absent: 0, excused: 0 };
            dates.forEach((d) => {
              const status = classAttendance[d];
              if (status && counts[status] !== undefined) counts[status]++;
            });

            return (
              <div className="card" key={classId} style={{ marginBottom: 12 }}>
                <h3 style={{ margin: "0 0 8px 0" }}>{cls?.name || classId}</h3>

                {dates.length === 0 ? (
                  <div className="muted small">
                    No attendance data available.
                  </div>
                ) : (
                  <>
                    <div className="form-row" style={{ gap: 16, marginBottom: 8 }}>
                      <span className="small">
                        Present: <strong>{counts.present}</strong>
                      </span>
                      <span className="small">
                        Tardy: <strong>{counts.tardy}</strong>
                      </span>
                      <span className="small" style={{ color: counts.absent >= 2 ? "var(--error, #c0392b)" : "inherit" }}>
                        Absent: <strong>{counts.absent}</strong>
                        {counts.absent >= 2 && " ⚠"}
                      </span>
                      <span className="small">
                        Excused: <strong>{counts.excused}</strong>
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {dates.map((date) => {
                        const status = classAttendance[date];
                        const colors: Record<string, string> = {
                          present: "var(--accent)",
                          tardy: "#e67e22",
                          absent: "var(--error, #c0392b)",
                          excused: "#7f8c8d",
                        };
                        return (
                          <div
                            key={date}
                            title={`${date}: ${status}`}
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: (status ? colors[status] : undefined) || "var(--border)",
                              color: "#fff",
                              fontSize: "0.75rem",
                            }}
                          >
                            {date.slice(5)}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assignments Tab */}
      {tab === "assignments" && (
        <div>
          {Object.entries(classGrades).length === 0 && (
            <div className="card">
              <div className="muted">No assignments yet.</div>
            </div>
          )}
          {Object.entries(classGrades).map(([classId, data]) => {
            const cls = classes[classId];
            const missing = data.assignments.filter(
              (a) => a.score === undefined || a.score === null
            );
            const completed = data.assignments.filter(
              (a) => a.score !== undefined && a.score !== null
            );

            return (
              <div className="card" key={classId} style={{ marginBottom: 12 }}>
                <h3 style={{ margin: "0 0 8px 0" }}>{cls?.name || classId}</h3>

                {missing.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      className="small"
                      style={{
                        color: "var(--error, #c0392b)",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Missing ({missing.length})
                    </div>
                    {missing.map((a) => (
                      <div key={a.id} className="small" style={{ padding: "2px 0" }}>
                        &mdash; {a.name} (max: {a.maxScore})
                        {a.type && (
                          <span className="muted"> [{a.type.toUpperCase()}]</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="small muted">
                  Completed: {completed.length} &middot; Missing: {missing.length}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
