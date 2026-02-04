import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "./firebase";
import Toasts from "./Toasts";
import { addToast } from "./toastService";

export default function StudentDashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [grades, setGrades] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

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
          <strong>{classId}</strong>
          {assignments.length === 0 ? (
            <div className="small" style={{ marginTop: 6 }}>
              No assignments yet.
            </div>
          ) : (
            assignments.map((a, idx) => (
              <div key={idx} className="small" style={{ marginTop: 6 }}>
                {a.name}: {a.score}/{a.maxScore}
              </div>
            ))
          )}
        </div>
      );
    });
  };

  return (
    <div className="app-container">
      <div className="card" style={{ maxWidth: 640 }}>
        <Toasts />
        <div className="card-header">
          <h2>Student Dashboard</h2>
          <div className="muted">
            Welcome, {renderName()}
            {profile?.studentId ? ` • Student ID: ${profile.studentId}` : ""}
          </div>
        </div>

        <div className="section">
          {loading ? <div>Loading grades...</div> : renderGrades()}
        </div>
      </div>
    </div>
  );
}
