import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "./firebase";
import { addToast } from "@/shared/toastService";
import type { User as FirebaseUser } from "firebase/auth";
import type { User, Assignment, ReportCard } from "./types";
import ReportCardView from "./ReportCardView";
import ReportCardTrend from "@/shared/components/ReportCardTrend";
import { letterGrade } from "@/shared/utils/gradeUtils";
import { formatUserName } from "@/shared/utils/formatters";
import { useAcademicConfig } from "@/shared/hooks/useAcademicConfig";
import { useReportCards } from "@/shared/hooks/useReportCards";

interface Props {
  user: FirebaseUser;
}

export default function StudentDashboard({ user }: Props) {
  const [profile, setProfile] = useState<User | null>(null);
  const [grades, setGrades] = useState<Record<string, { assignments?: Record<string, Assignment> }> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [openClassId, setOpenClassId] = useState<string>("");
  const [openRubrics, setOpenRubrics] = useState<Record<string, boolean>>({});
  const [parentCode, setParentCode] = useState<string | null>(null);
  const [activeReportCard, setActiveReportCard] = useState<ReportCard | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const {
    academicConfig, selectedSession, setSelectedSession,
    selectedTerm, setSelectedTerm,
  } = useAcademicConfig();

  const {
    reportCards, allSessionCards,
    showAllSessions, setShowAllSessions,
  } = useReportCards(user?.uid ?? null, selectedSession, academicConfig);

  useEffect(() => {
    if (!user) return undefined;

    const userRef = ref(db, `Users/${user.uid}`);
    const gradesRef = ref(db, `grades/${user.uid}`);

    const unsubscribeUser = onValue(
      userRef,
      (snapshot) => {
        const data: User | null = snapshot.exists() ? snapshot.val() : null;
        setProfile(data);
        setParentCode(data?.parentCode || null);
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

  const handleDownloadPdf = async () => {
    const element = document.getElementById("report-card-content");
    if (!element) return;
    const html2canvas = (await import("html2canvas")).default;
    const { default: jsPDF } = await import("jspdf");
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    const name = activeReportCard?.studentName || "student";
    pdf.save(`report-card-${name}-${activeReportCard?.term || ""}.pdf`);
  };

  const renderGrades = () => {
    if (!grades || Object.keys(grades).length === 0) {
      return <div className="small">No grades yet.</div>;
    }

    return Object.entries(grades).map(([classId, classData]) => {
      const allAssignments: Assignment[] = classData?.assignments
        ? Object.values(classData.assignments)
        : [];
      const assignments = selectedTerm && selectedSession
        ? allAssignments.filter((a) => a.termId === selectedTerm && a.sessionId === selectedSession)
        : allAssignments;
      const total = assignments.reduce((sum, a) => sum + Number(a.score || 0), 0);
      const max = assignments.reduce((sum, a) => sum + Number(a.maxScore || 0), 0);
      const avg = max > 0 ? Math.round((total / max) * 100) : null;
      const letter = letterGrade(avg);
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
    if (!grades) return { overallAvg: null as number | null, totalAssignments: 0, recent: [] as Array<{ id: string; classId: string; name: string; score: number; maxScore: number; updatedAt: number }> };

    let total = 0;
    let max = 0;
    const recent: Array<{ id: string; classId: string; name: string; score: number; maxScore: number; updatedAt: number }> = [];

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
              Welcome, {formatUserName(profile)}
              {profile?.studentId ? ` - Student ID: ${profile.studentId}` : ""}
            </div>
            {parentCode && (
              <div className="small" style={{ marginTop: 8 }}>
                <strong>Parent Code:</strong>{" "}
                <code
                  style={{
                    fontFamily: "monospace",
                    letterSpacing: "0.1em",
                    background: "var(--border)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                  title="Click to copy"
                  onClick={() => {
                    navigator.clipboard.writeText(parentCode);
                    addToast("info", "Parent code copied!");
                  }}
                >
                  {parentCode}
                </code>
                <div className="muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>
                  Share this code with your parent to connect their account.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="section">
          <h3>Progress Summary</h3>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value">
                {progressSummary.overallAvg !== null ? `${progressSummary.overallAvg}%` : "—"}
                {progressSummary.overallAvg !== null && (
                  <span className={`grade-badge ${letterGrade(progressSummary.overallAvg)}`}>
                    {letterGrade(progressSummary.overallAvg)}
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
                      {pct !== null && <span className={`grade-badge ${letterGrade(pct)}`}>{letterGrade(pct)}</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Session/Term Selector & Trend */}
        {academicConfig && (
          <div className="section">
            {(() => {
              const sessions = academicConfig.sessions || {};
              const sessionKeys = Object.keys(sessions);
              const currentSession = sessions[selectedSession];
              const termKeys = currentSession ? Object.keys(currentSession.terms) : [];
              return (
                <div className="form-row" style={{ marginBottom: 16 }}>
                  <select className="input" value={selectedSession} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSession(e.target.value)}>
                    {sessionKeys.map((k) => (
                      <option key={k} value={k}>{sessions[k]!.label}</option>
                    ))}
                  </select>
                  <select className="input" value={selectedTerm} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedTerm(e.target.value)}>
                    {termKeys.map((k) => (
                      <option key={k} value={k}>{currentSession!.terms[k]!.label}</option>
                    ))}
                  </select>
                </div>
              );
            })()}

            <ReportCardTrend
              reportCards={reportCards}
              allSessionCards={allSessionCards}
              showAllSessions={showAllSessions}
              onToggleAllSessions={() => { setShowAllSessions(!showAllSessions); setSelectedSubject(null); }}
              selectedSubject={selectedSubject}
              onSelectSubject={setSelectedSubject}
            />

            {reportCards.some((c) => c.termId === selectedTerm) && (
              <div className="form-row" style={{ marginBottom: 16 }}>
                <button className="btn btn-primary" onClick={() => setActiveReportCard(reportCards.find((c) => c.termId === selectedTerm) || null)}>
                  View Report Card
                </button>
              </div>
            )}
          </div>
        )}

        <div className="section">{loading ? <div>Loading grades...</div> : renderGrades()}</div>
      </div>

      {/* Report Card Modal */}
      {activeReportCard && (
        <div className="modal-backdrop" onClick={() => setActiveReportCard(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: "90vh", overflow: "auto" }}>
            <ReportCardView reportCard={activeReportCard} />
            <div className="form-row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleDownloadPdf}>Download PDF</button>
              <button className="btn btn-ghost" onClick={() => setActiveReportCard(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
