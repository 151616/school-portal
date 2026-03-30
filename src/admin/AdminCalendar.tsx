import { useState, useEffect } from "react";
import { ref, onValue, set } from "firebase/database";
import { db } from "@/firebase";
import { addToast } from "@/shared/toastService";
import type { AcademicConfig, AcademicSession, Term } from "@/types";

interface Props {
  mySchoolId: string | null;
}

export default function AdminCalendar({ mySchoolId }: Props) {
  const schoolId = mySchoolId || "default";
  const [config, setConfig] = useState<AcademicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // New session form
  const [newSessionLabel, setNewSessionLabel] = useState("");
  const [termCount, setTermCount] = useState<2 | 3>(3);
  const [termDates, setTermDates] = useState<Array<{ label: string; start: string; end: string }>>([
    { label: "1st Term", start: "", end: "" },
    { label: "2nd Term", start: "", end: "" },
    { label: "3rd Term", start: "", end: "" },
  ]);
  const [showNewSession, setShowNewSession] = useState(false);

  useEffect(() => {
    const configRef = ref(db, `academicConfig/${schoolId}`);
    const unsub = onValue(configRef, (snap) => {
      if (snap.exists()) {
        setConfig(snap.val() as AcademicConfig);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [schoolId]);

  const handleTermCountChange = (count: 2 | 3) => {
    setTermCount(count);
    if (count === 2) {
      setTermDates([
        { label: "1st Semester", start: "", end: "" },
        { label: "2nd Semester", start: "", end: "" },
      ]);
    } else {
      setTermDates([
        { label: "1st Term", start: "", end: "" },
        { label: "2nd Term", start: "", end: "" },
        { label: "3rd Term", start: "", end: "" },
      ]);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionLabel.trim()) {
      addToast("error", "Enter a session label (e.g. 2025/2026)");
      return;
    }
    const missingDates = termDates.some((t) => !t.start || !t.end);
    if (missingDates) {
      addToast("error", "Fill in all term start and end dates");
      return;
    }

    const sessionKey = newSessionLabel.trim().replace(/\//g, "-");
    const terms: Record<string, Term> = {};
    termDates.forEach((t, i) => {
      terms[`term${i + 1}`] = {
        label: t.label,
        startDate: t.start,
        endDate: t.end,
      };
    });

    const session: AcademicSession = {
      label: newSessionLabel.trim(),
      terms,
      activeTerm: "term1",
    };

    const updatedConfig: AcademicConfig = {
      termStructure: termDates.map((t) => t.label),
      sessions: {
        ...(config?.sessions || {}),
        [sessionKey]: session,
      },
      currentSession: sessionKey,
    };

    try {
      await set(ref(db, `academicConfig/${schoolId}`), updatedConfig);
      addToast("success", `Session "${newSessionLabel.trim()}" created`);
      setShowNewSession(false);
      setNewSessionLabel("");
    } catch (err) {
      addToast("error", "Failed to create session: " + (err as Error).message);
    }
  };

  const handleSetActiveTerm = async (sessionKey: string, termKey: string) => {
    try {
      await set(ref(db, `academicConfig/${schoolId}/sessions/${sessionKey}/activeTerm`), termKey);
      addToast("success", "Active term updated");
    } catch (err) {
      addToast("error", "Failed to update: " + (err as Error).message);
    }
  };

  const handleSetCurrentSession = async (sessionKey: string) => {
    try {
      await set(ref(db, `academicConfig/${schoolId}/currentSession`), sessionKey);
      addToast("success", "Current session updated");
    } catch (err) {
      addToast("error", "Failed to update: " + (err as Error).message);
    }
  };

  if (loading) return <p className="muted">Loading academic calendar...</p>;

  const sessions = config?.sessions || {};
  const sessionKeys = Object.keys(sessions);

  return (
    <div className="section">
      <h3>Academic Calendar</h3>

      {sessionKeys.length === 0 && !showNewSession && (
        <p className="muted">No academic sessions configured yet.</p>
      )}

      {sessionKeys.map((key) => {
        const session = sessions[key]!;
        const isCurrent = config?.currentSession === key;
        const termKeys = Object.keys(session.terms || {});

        return (
          <div key={key} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>{session.label}</strong>
              <div style={{ display: "flex", gap: 8 }}>
                {isCurrent ? (
                  <span className="app-role-chip">Current</span>
                ) : (
                  <button className="btn btn-ghost" onClick={() => handleSetCurrentSession(key)}>
                    Set as Current
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {termKeys.map((tk) => {
                const term = session.terms[tk]!;
                const isActive = session.activeTerm === tk;
                return (
                  <div
                    key={tk}
                    style={{
                      flex: 1,
                      minWidth: 150,
                      border: isActive ? "2px solid #1a365d" : "1px solid #ddd",
                      borderRadius: 6,
                      padding: 12,
                      background: isActive ? "#f0f7ff" : "transparent",
                    }}
                  >
                    <div style={{ fontWeight: "bold" }}>
                      {term.label}
                      {isActive && (
                        <span style={{ background: "#2ecc71", color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, marginLeft: 6 }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      {term.startDate} — {term.endDate}
                    </div>
                    {!isActive && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, marginTop: 6, padding: "2px 8px" }}
                        onClick={() => handleSetActiveTerm(key, tk)}
                      >
                        Set Active
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {showNewSession ? (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginTop: 12 }}>
          <h4>Create New Session</h4>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <input
              className="input"
              placeholder="Session label (e.g. 2025/2026)"
              value={newSessionLabel}
              onChange={(e) => setNewSessionLabel(e.target.value)}
            />
          </div>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 8 }}>Term structure:</label>
            <button
              className={`btn ${termCount === 3 ? "btn-primary" : "btn-ghost"}`}
              onClick={() => handleTermCountChange(3)}
            >
              3 Terms
            </button>
            <button
              className={`btn ${termCount === 2 ? "btn-primary" : "btn-ghost"}`}
              onClick={() => handleTermCountChange(2)}
            >
              2 Semesters
            </button>
          </div>
          {termDates.map((t, i) => (
            <div key={i} className="form-row" style={{ marginBottom: 8 }}>
              <span style={{ minWidth: 100 }}>{t.label}:</span>
              <input
                type="date"
                className="input"
                value={t.start}
                onChange={(e) => {
                  const updated = [...termDates];
                  updated[i] = { ...t, start: e.target.value };
                  setTermDates(updated);
                }}
              />
              <span>to</span>
              <input
                type="date"
                className="input"
                value={t.end}
                onChange={(e) => {
                  const updated = [...termDates];
                  updated[i] = { ...t, end: e.target.value };
                  setTermDates(updated);
                }}
              />
            </div>
          ))}
          <div className="form-row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleCreateSession}>
              Create Session
            </button>
            <button className="btn btn-ghost" onClick={() => setShowNewSession(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowNewSession(true)}>
          + New Session
        </button>
      )}
    </div>
  );
}
