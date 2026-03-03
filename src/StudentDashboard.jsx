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

  const renderGrades = () => {
    if (!grades || Object.keys(grades).length === 0) {
      return <div className="small">No grades yet.</div>;
    }

    return Object.entries(grades).map(([classId, classData]) => {
      const assignments = classData?.assignments
        ? Object.values(classData.assignments)
        : [];
      const total = assignments.reduce((sum, assignment) => sum + Number(assignment.score || 0), 0);
      const max = assignments.reduce((sum, assignment) => sum + Number(assignment.maxScore || 0), 0);
      const avg = max > 0 ? Math.round((total / max) * 100) : null;
      const isOpen = openClassId === classId;

      return (
        <div
          key={classId}
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
          }}
        >
          <button
            className="btn btn-ghost"
            onClick={() => setOpenClassId(isOpen ? "" : classId)}
            style={{ width: "100%", textAlign: "left" }}
          >
            <strong>{classId}</strong>
            <span style={{ marginLeft: 10 }} className="small">
              {avg !== null ? `Avg: ${avg}%` : "Avg: N/A"}
            </span>
          </button>

          {isOpen && (
            <div style={{ marginTop: 8 }}>
              {assignments.length === 0 ? (
                <div className="small">No assignments yet.</div>
              ) : (
                assignments.map((assignment, index) => {
                  const key = `${classId}:${index}`;
                  const rubricOpen = !!openRubrics[key];

                  return (
                    <div key={key} className="small" style={{ marginTop: 6 }}>
                      <div>
                        {assignment.name}: {assignment.score}/{assignment.maxScore}
                      </div>
                      {assignment.rubric && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                            onClick={() =>
                              setOpenRubrics((prev) => ({
                                ...prev,
                                [key]: !prev[key],
                              }))
                            }
                          >
                            {rubricOpen ? "Hide rubric" : "Show rubric"}
                          </button>
                          {rubricOpen && (
                            <div className="small" style={{ marginTop: 6 }}>
                              {assignment.rubric}
                            </div>
                          )}
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
          <div className="form-row" style={{ marginTop: 6 }}>
            <div className="small">
              Overall average: {progressSummary.overallAvg !== null ? `${progressSummary.overallAvg}%` : "N/A"}
            </div>
            <div className="small">Assignments graded: {progressSummary.totalAssignments}</div>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            Recent grades
          </div>
          {progressSummary.recent.length === 0 ? (
            <div className="small">No grades yet.</div>
          ) : (
            <ul className="card-list" style={{ marginTop: 8 }}>
              {progressSummary.recent.map((item) => (
                <li key={item.id}>
                  <div>
                    <div>
                      {item.classId} | {item.name}
                    </div>
                    <div className="meta">
                      {item.score}/{item.maxScore}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="section">{loading ? <div>Loading grades...</div> : renderGrades()}</div>
      </div>
    </div>
  );
}
