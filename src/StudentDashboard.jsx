import React, { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "./firebase";
import { addToast } from "./toastService";

export default function StudentDashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [grades, setGrades] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openClassId, setOpenClassId] = useState("");
  const [openRubrics, setOpenRubrics] = useState({});

  useEffect(() => {
    if (!user) return undefined;

    const userRef = ref(db, `Users/${user.uid}`);
    const gradesRef = ref(db, `grades/${user.uid}`);

    const unsubscribeUser = onValue(
      userRef,
      (snapshot) => {
        setProfile(snapshot.exists() ? snapshot.val() : null);
      },
      (error) => {
        console.error("Profile read error:", error);
        addToast("error", "Unable to load profile");
      }
    );

    const unsubscribeGrades = onValue(
      gradesRef,
      (snapshot) => {
        setGrades(snapshot.exists() ? snapshot.val() : {});
        setLoading(false);
      },
      (error) => {
        console.error("Grades read error:", error);
        addToast("error", "Unable to load grades");
        setLoading(false);
      }
    );

    return () => {
      unsubscribeUser();
      unsubscribeGrades();
    };
  }, [user]);

  const renderName = () => {
    if (!profile) return "Student";
    const first = profile.firstName || "";
    const lastInitial = profile.lastInitial ? `${profile.lastInitial}.` : "";
    const name = `${first} ${lastInitial}`.trim();
    return name || "Student";
  };

  const getLetter = (pct) => {
    if (pct === null) return null;
    if (pct >= 90) return "A";
    if (pct >= 80) return "B";
    if (pct >= 70) return "C";
    if (pct >= 60) return "D";
    return "F";
  };

  const renderGrades = () => {
    if (!grades || Object.keys(grades).length === 0) {
      return <div className="small">No grades yet.</div>;
    }

    return Object.entries(grades).map(([classId, classData]) => {
      const assignments = classData?.assignments
        ? Object.values(classData.assignments)
        : [];
      const total = assignments.reduce((sum, a) => sum + Number(a.score || 0), 0);
      const max = assignments.reduce((sum, a) => sum + Number(a.maxScore || 0), 0);
      const avg = max > 0 ? Math.round((total / max) * 100) : null;
      const letter = getLetter(avg);
      const isOpen = openClassId === classId;

      return (
        <div key={classId} style={{ marginTop: 12, border: "1px solid rgba(73,54,34,0.1)", borderRadius: 10, overflow: "hidden" }}>
          <button
            className="btn btn-ghost"
            onClick={() => setOpenClassId(isOpen ? "" : classId)}
            style={{ width: "100%", textAlign: "left", borderRadius: 0, padding: "12px 14px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <strong>{classId}</strong>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="small">{avg !== null ? `${avg}%` : "N/A"}</span>
                {letter && <span className={`grade-badge ${letter}`}>{letter}</span>}
              </span>
            </div>
            {avg !== null && (
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${avg}%` }} />
              </div>
            )}
          </button>

          {isOpen && (
            <div style={{ padding: "4px 14px 12px" }}>
              {assignments.length === 0 ? (
                <div className="small">No assignments yet.</div>
              ) : (
                assignments.map((assignment, index) => {
                  const key = `${classId}:${index}`;
                  const rubricOpen = !!openRubrics[key];
                  const pct = assignment.maxScore > 0 ? Math.round((assignment.score / assignment.maxScore) * 100) : null;

                  return (
                    <div key={key} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(73,54,34,0.07)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="small">{assignment.name}</span>
                        <span className="small" style={{ fontWeight: 600 }}>
                          {assignment.score}/{assignment.maxScore}
                          {pct !== null && <span style={{ marginLeft: 6, color: "var(--muted)" }}>({pct}%)</span>}
                        </span>
                      </div>
                      {assignment.rubric && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "2px 8px", fontSize: "0.82rem" }}
                            onClick={() => setOpenRubrics((prev) => ({ ...prev, [key]: !prev[key] }))}
                          >
                            {rubricOpen ? "Hide rubric" : "Show rubric"}
                          </button>
                          {rubricOpen && <div className="small" style={{ marginTop: 6, color: "var(--muted)" }}>{assignment.rubric}</div>}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      );
    });
  };

  const progressSummary = (() => {
    if (!grades) return { overallAvg: null, totalAssignments: 0, recent: [] };

    let total = 0;
    let max = 0;
    const recent = [];

    Object.entries(grades).forEach(([classId, classData]) => {
      const assignments = classData?.assignments
        ? Object.entries(classData.assignments)
        : [];

      assignments.forEach(([assignmentId, assignment]) => {
        total += Number(assignment.score || 0);
        max += Number(assignment.maxScore || 0);
        recent.push({
          id: `${classId}:${assignmentId}`,
          classId,
          name: assignment.name || "Assignment",
          score: Number(assignment.score || 0),
          maxScore: Number(assignment.maxScore || 0),
          updatedAt: assignment.updatedAt || 0,
        });
      });
    });

    recent.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const overallAvg = max > 0 ? Math.round((total / max) * 100) : null;
    return { overallAvg, totalAssignments: recent.length, recent: recent.slice(0, 5) };
  })();

  return (
    <div className="app-container">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Student Dashboard</h2>
            <div className="muted">
              Welcome, {renderName()}
              {profile?.studentId ? ` - Student ID: ${profile.studentId}` : ""}
            </div>
          </div>
        </div>

        <div className="section">
          <h3>Progress Summary</h3>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value">
                {progressSummary.overallAvg !== null ? `${progressSummary.overallAvg}%` : "—"}
                {progressSummary.overallAvg !== null && (
                  <span className={`grade-badge ${getLetter(progressSummary.overallAvg)}`}>
                    {getLetter(progressSummary.overallAvg)}
                  </span>
                )}
              </div>
              <div className="stat-card-label">Overall Average</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{progressSummary.totalAssignments}</div>
              <div className="stat-card-label">Assignments Graded</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{Object.keys(grades || {}).length}</div>
              <div className="stat-card-label">Classes Enrolled</div>
            </div>
          </div>

          {progressSummary.recent.length > 0 && (
            <>
              <div className="small" style={{ marginTop: 18, marginBottom: 6 }}>Recent grades</div>
              <ul className="card-list">
                {progressSummary.recent.map((item) => {
                  const pct = item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 100) : null;
                  return (
                    <li key={item.id}>
                      <div>
                        <div>{item.classId} — {item.name}</div>
                        <div className="meta">{item.score}/{item.maxScore}{pct !== null ? ` · ${pct}%` : ""}</div>
                      </div>
                      {pct !== null && <span className={`grade-badge ${getLetter(pct)}`}>{getLetter(pct)}</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="section">{loading ? <div>Loading grades...</div> : renderGrades()}</div>
      </div>
    </div>
  );
}
