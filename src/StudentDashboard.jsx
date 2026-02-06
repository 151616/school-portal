import React, { useEffect, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { db } from "./firebase";
import Toasts from "./Toasts";
import { addToast } from "./toastService";
import MessagingPanel from "./MessagingPanel";

export default function StudentDashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [grades, setGrades] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openClassId, setOpenClassId] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openRubrics, setOpenRubrics] = useState({});

  useEffect(() => {
    if (!user) return;

    const userRef = ref(db, `Users/${user.uid}`);
    const gradesRef = ref(db, `grades/${user.uid}`);
    const notificationsRef = ref(db, `notifications/${user.uid}`);

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

    const unsubscribeNotifications = onValue(
      notificationsRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.val() : {};
        const list = Object.entries(data)
          .map(([id, n]) => ({ id, ...n }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setNotifications(list);
        const unread = list.filter((n) => !n.read).length;
        setUnreadCount(unread);
      },
      (error) => {
        console.error("Notifications read error:", error);
      }
    );

    return () => {
      unsubscribeUser();
      unsubscribeGrades();
      unsubscribeNotifications();
    };
  }, [user]);

  const markAllRead = () => {
    if (!user) return;
    const updates = {};
    notifications.forEach((n) => {
      updates[`notifications/${user.uid}/${n.id}/read`] = true;
    });
    update(ref(db), updates);
    setUnreadCount(0);
  };

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
      const total = assignments.reduce((sum, a) => sum + Number(a.score || 0), 0);
      const max = assignments.reduce((sum, a) => sum + Number(a.maxScore || 0), 0);
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
                assignments.map((a, idx) => {
                  const key = `${classId}:${idx}`;
                  const isOpen = !!openRubrics[key];
                  return (
                  <div key={idx} className="small" style={{ marginTop: 6 }}>
                    <div>
                      {a.name}: {a.score}/{a.maxScore}
                    </div>
                    {a.rubric && (
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
                          {isOpen ? "Hide rubric" : "Show rubric"}
                        </button>
                        {isOpen && (
                          <div className="small" style={{ marginTop: 6 }}>
                            {a.rubric}
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
      assignments.forEach(([aid, a]) => {
        total += Number(a.score || 0);
        max += Number(a.maxScore || 0);
        recent.push({
          id: `${classId}:${aid}`,
          classId,
          name: a.name || "Assignment",
          score: Number(a.score || 0),
          maxScore: Number(a.maxScore || 0),
          updatedAt: a.updatedAt || 0,
        });
      });
    });
    recent.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const overallAvg = max > 0 ? Math.round((total / max) * 100) : null;
    return { overallAvg, totalAssignments: recent.length, recent: recent.slice(0, 5) };
  })();

  return (
    <div className="app-container">
      <div className="card" style={{ maxWidth: 640 }}>
        <Toasts />
        <div className="card-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h2>Student Dashboard</h2>
              <div className="muted">
                Welcome, {renderName()}
                {profile?.studentId ? ` • Student ID: ${profile.studentId}` : ""}
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const next = !showNotifications;
                  setShowNotifications(next);
                  if (next) markAllRead();
                }}
              >
                Notifications
              </button>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    background: "#d14343",
                    color: "#fff",
                    borderRadius: 999,
                    fontSize: 12,
                    padding: "2px 6px",
                    lineHeight: 1,
                  }}
                >
                  {unreadCount}
                </span>
              )}
              {showNotifications && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    marginTop: 6,
                    width: 320,
                    background: "var(--msg-panel-surface)",
                    border: "1px solid var(--msg-panel-border)",
                    borderRadius: 10,
                    boxShadow: "var(--msg-panel-shadow)",
                    zIndex: 50,
                    padding: 10,
                  }}
                >
                  {notifications.length === 0 ? (
                    <div className="small">No notifications yet.</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          padding: "6px 4px",
                          borderBottom: "1px solid rgba(73, 54, 34, 0.14)",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{n.title}</div>
                        <div className="small">{n.body}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="section">
          <h3>Progress Summary</h3>
          <div className="form-row" style={{ marginTop: 6 }}>
            <div className="small">
              Overall average: {progressSummary.overallAvg !== null ? `${progressSummary.overallAvg}%` : "N/A"}
            </div>
            <div className="small">
              Assignments graded: {progressSummary.totalAssignments}
            </div>
          </div>
          <div className="small" style={{ marginTop: 8 }}>Recent grades</div>
          {progressSummary.recent.length === 0 ? (
            <div className="small">No grades yet.</div>
          ) : (
            <ul className="card-list" style={{ marginTop: 8 }}>
              {progressSummary.recent.map((r) => (
                <li key={r.id}>
                  <div>
                    <div>{r.classId} · {r.name}</div>
                    <div className="meta">
                      {r.score}/{r.maxScore}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="section">
          {loading ? <div>Loading grades...</div> : renderGrades()}
        </div>

        <MessagingPanel currentUser={user} currentRole={profile?.role || "student"} />
      </div>
    </div>
  );
}
