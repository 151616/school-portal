import { useState, useEffect } from "react";
import { ref, onValue, get, set } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
import { addToast } from "@/shared/toastService";
import Combobox from "@/shared/components/Combobox";
import ReportCardView from "@/reportCards/ReportCardView";
import type { AcademicConfig, ReportCard, PublishReportCardsData, PublishReportCardsResult } from "@/types";

interface ClassRecord {
  id: string;
  name?: string;
  teacherUid?: string;
  students?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Props {
  classes: ClassRecord[];
  mySchoolId: string | null;
}

interface ClassReadiness {
  classId: string;
  className: string;
  studentCount: number;
  gradesComplete: number;
  commentsComplete: number;
  published: boolean;
  publishedCount: number;
}

export default function AdminReportCards({ classes, mySchoolId }: Props) {
  const schoolId = mySchoolId || "default";
  const scopedClasses = mySchoolId
    ? classes.filter((cls) => cls.schoolId === mySchoolId)
    : classes;
  const [config, setConfig] = useState<AcademicConfig | null>(null);
  const [selectedSession, setSelectedSession] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [readiness, setReadiness] = useState<ClassReadiness[]>([]);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewCard, setPreviewCard] = useState<ReportCard | null>(null);
  const [principalComments, setPrincipalComments] = useState<Record<string, string>>({});
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [readinessVersion, setReadinessVersion] = useState(0);

  // Load academic config
  useEffect(() => {
    const configRef = ref(db, `academicConfig/${schoolId}`);
    const unsub = onValue(configRef, (snap) => {
      if (snap.exists()) {
        const c = snap.val() as AcademicConfig;
        setConfig(c);
        if (!selectedSession && c.currentSession) {
          setSelectedSession(c.currentSession);
          const session = c.sessions?.[c.currentSession];
          if (session?.activeTerm) setSelectedTerm(session.activeTerm);
        }
      }
    });
    return () => unsub();
  }, [schoolId]);

  // Load readiness when session/term change
  useEffect(() => {
    if (!selectedSession || !selectedTerm || scopedClasses.length === 0) {
      setReadiness([]);
      setPrincipalComments({});
      return;
    }
    setLoadingReadiness(true);

    const checkReadiness = async () => {
      const results: ClassReadiness[] = [];

      for (const cls of scopedClasses) {
        const studentUids = cls.students ? Object.keys(cls.students) : [];
        if (studentUids.length === 0) continue;

        let gradesComplete = 0;
        let commentsComplete = 0;
        let publishedCount = 0;

        for (const uid of studentUids) {
          // Check grades
          const gradesSnap = await get(
            ref(db, `grades/${uid}/${cls.id}/assignments`)
          );
          const assignments = gradesSnap.val() || {};
          const hasTermGrades = Object.values(assignments).some(
            (a) => (a as { termId?: string; sessionId?: string }).termId === selectedTerm &&
                   (a as { termId?: string; sessionId?: string }).sessionId === selectedSession
          );
          if (hasTermGrades) gradesComplete++;

          // Check comments
          const commentSnap = await get(
            ref(db, `reportComments/${selectedSession}/${selectedTerm}/${uid}/teacherComment`)
          );
          if (commentSnap.exists() && (commentSnap.val() as string).trim()) commentsComplete++;

          // Check if published
          const reportSnap = await get(
            ref(db, `reportCards/${selectedSession}/${selectedTerm}/${uid}`)
          );
          if (reportSnap.exists()) publishedCount++;
        }

        results.push({
          classId: cls.id,
          className: cls.name || cls.id,
          studentCount: studentUids.length,
          gradesComplete,
          commentsComplete,
          published: studentUids.length > 0 && publishedCount === studentUids.length,
          publishedCount,
        });
      }

      setReadiness(results);

      // Load existing principal comments
      const allStudentUids = scopedClasses.flatMap(
        (cls) => (cls.students ? Object.keys(cls.students) : [])
      );
      const uniqueUids = [...new Set(allStudentUids)];
      const commentMap: Record<string, string> = {};
      for (const uid of uniqueUids) {
        const snap = await get(
          ref(db, `reportComments/${selectedSession}/${selectedTerm}/${uid}/principalComment`)
        );
        if (snap.exists()) commentMap[uid] = snap.val() as string;
      }
      setPrincipalComments(commentMap);

      setLoadingReadiness(false);
    };

    checkReadiness();
  }, [selectedSession, selectedTerm, scopedClasses, readinessVersion]);

  const handlePublish = async () => {
    if (!selectedSession || !selectedTerm) return;
    setPublishing(true);
    try {
      const publishFn = httpsCallable<PublishReportCardsData, PublishReportCardsResult>(
        functions, "publishReportCards"
      );
      const result = await publishFn({ sessionId: selectedSession, termId: selectedTerm, schoolId });
      addToast("success", `Published ${result.data.published} report cards (${result.data.skipped} skipped)`);
      setReadinessVersion((value) => value + 1);
      if (result.data.errors.length > 0) {
        console.error("Publish errors:", result.data.errors);
        addToast("error", `${result.data.errors.length} errors occurred — check console`);
      }
    } catch (err) {
      addToast("error", "Publish failed: " + (err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const handlePreview = async (classId: string) => {
    const cls = scopedClasses.find((c) => c.id === classId);
    if (!cls?.students) return;
    for (const uid of Object.keys(cls.students)) {
      const snap = await get(ref(db, `reportCards/${selectedSession}/${selectedTerm}/${uid}`));
      if (snap.exists()) {
        setPreviewCard(snap.val() as ReportCard);
        return;
      }
    }
    addToast("error", "No published report card found. Publish first.");
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById("report-card-content");
    if (!element) return;
    const html2canvasMod = (await import("html2canvas")).default;
    const { default: jsPDFMod } = await import("jspdf");
    const canvas = await html2canvasMod(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDFMod("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    pdf.save(`report-card-${previewCard?.studentName || "student"}.pdf`);
  };

  const handleDownloadAllZip = async () => {
    if (!selectedSession || !selectedTerm) return;
    setDownloadingZip(true);
    try {
      const JSZip = (await import("jszip")).default;
      const html2canvasMod = (await import("html2canvas")).default;
      const { default: jsPDFMod } = await import("jspdf");
      const zip = new JSZip();
      let downloadedCount = 0;

      const allStudentUids = scopedClasses.flatMap(
        (cls) => (cls.students ? Object.keys(cls.students) : [])
      );
      const uniqueUids = [...new Set(allStudentUids)];

      // Create a hidden container for rendering
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "0";
      document.body.appendChild(container);

      try {
        for (const uid of uniqueUids) {
          const snap = await get(ref(db, `reportCards/${selectedSession}/${selectedTerm}/${uid}`));
          if (!snap.exists()) continue;
          const card = snap.val() as ReportCard;

          const el = document.createElement("div");
          container.innerHTML = "";
          container.appendChild(el);

          const { createRoot } = await import("react-dom/client");
          const root = createRoot(el);
          await new Promise<void>((resolve) => {
            root.render(<ReportCardView reportCard={card} />);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });

          const canvas = await html2canvasMod(el, { scale: 2 });
          const imgData = canvas.toDataURL("image/png");
          const pdf = new jsPDFMod("p", "mm", "a4");
          const pageWidth = pdf.internal.pageSize.getWidth();
          const imgWidth = pageWidth - 20;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);

          const fileName = `${card.studentName || uid}-${card.className || "class"}.pdf`;
          zip.file(fileName, pdf.output("arraybuffer"));
          downloadedCount += 1;

          root.unmount();
        }
      } finally {
        document.body.removeChild(container);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-cards-${selectedSession}-${selectedTerm}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("success", `Downloaded ${downloadedCount} report cards as ZIP`);
    } catch (err) {
      addToast("error", "ZIP download failed: " + (err as Error).message);
    }
    setDownloadingZip(false);
  };

  const handleSavePrincipalComments = async () => {
    if (!selectedSession || !selectedTerm) return;
    try {
      const writes = Object.entries(principalComments)
        .filter(([_, c]) => c.trim())
        .map(([uid, comment]) =>
          set(
            ref(db, `reportComments/${selectedSession}/${selectedTerm}/${uid}/principalComment`),
            comment.trim()
          )
        );
      await Promise.all(writes);
      addToast("success", "Principal comments saved");
    } catch (err) {
      addToast("error", "Failed: " + (err as Error).message);
    }
  };

  const sessions = config?.sessions || {};
  const sessionKeys = Object.keys(sessions);
  const currentSession = sessions[selectedSession];
  const termKeys = currentSession ? Object.keys(currentSession.terms) : [];

  return (
    <div className="section">
      <h3>Report Cards</h3>

      {/* Session/Term selectors */}
      <div className="form-row" style={{ marginBottom: 16 }}>
        <Combobox
          options={[
            { value: "", label: "Select Session" },
            ...sessionKeys.map((k) => ({ value: k, label: sessions[k]!.label })),
          ]}
          value={selectedSession}
          onChange={(v) => setSelectedSession(v)}
          placeholder="Select Session"
        />
        <Combobox
          options={[
            { value: "", label: "Select Term" },
            ...termKeys.map((k) => ({ value: k, label: currentSession!.terms[k]!.label })),
          ]}
          value={selectedTerm}
          onChange={(v) => setSelectedTerm(v)}
          placeholder="Select Term"
        />
      </div>

      {/* Readiness Table */}
      {loadingReadiness ? (
        <p className="muted">Loading readiness...</p>
      ) : readiness.length > 0 ? (
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table className="grade-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                <th style={{ padding: 10, textAlign: "left" }}>Class</th>
                <th style={{ padding: 10, textAlign: "center" }}>Students</th>
                <th style={{ padding: 10, textAlign: "center" }}>Grades</th>
                <th style={{ padding: 10, textAlign: "center" }}>Comments</th>
                <th style={{ padding: 10, textAlign: "center" }}>Status</th>
                <th style={{ padding: 10, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {readiness.map((r) => {
                const allReady = r.gradesComplete === r.studentCount && r.commentsComplete === r.studentCount;
                return (
                  <tr key={r.classId} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: 10 }}>{r.className}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{r.studentCount}</td>
                    <td style={{ padding: 10, textAlign: "center", color: r.gradesComplete === r.studentCount ? "#2ecc71" : "#e67e22" }}>
                      {r.gradesComplete}/{r.studentCount}
                    </td>
                    <td style={{ padding: 10, textAlign: "center", color: r.commentsComplete === r.studentCount ? "#2ecc71" : "#e67e22" }}>
                      {r.commentsComplete}/{r.studentCount}
                    </td>
                    <td style={{ padding: 10, textAlign: "center" }}>
                      {r.published ? (
                        <span style={{ background: "#2ecc71", color: "white", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>Published</span>
                      ) : r.publishedCount > 0 ? (
                        <span style={{ color: "#e67e22" }}>Partially published</span>
                      ) : allReady ? (
                        <span style={{ color: "#2ecc71" }}>Ready</span>
                      ) : (
                        <span style={{ color: "#e67e22" }}>Incomplete</span>
                      )}
                    </td>
                    <td style={{ padding: 10, textAlign: "center" }}>
                      {r.publishedCount > 0 && (
                        <button className="btn btn-ghost btn-xs" onClick={() => handlePreview(r.classId)}>
                          Preview
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : selectedSession && selectedTerm ? (
        <p className="muted">No classes with enrolled students found.</p>
      ) : null}

      {/* Action buttons */}
      {selectedSession && selectedTerm && readiness.length > 0 && (
        <div className="form-row" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
            {publishing ? "Publishing..." : "Publish All Report Cards"}
          </button>
          <button className="btn btn-ghost" onClick={handleDownloadAllZip} disabled={downloadingZip}>
            {downloadingZip ? "Generating ZIP..." : "Download All as ZIP"}
          </button>
        </div>
      )}

      {/* Principal Comments */}
      {selectedSession && selectedTerm && readiness.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4>Principal Comments</h4>
          {scopedClasses.map((cls) => {
            const studentUids = cls.students ? Object.keys(cls.students) : [];
            if (studentUids.length === 0) return null;
            return (
              <div key={cls.id} style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>{cls.name || cls.id}</strong>
                {studentUids.map((uid) => (
                  <div key={uid} className="form-row" style={{ marginTop: 6, alignItems: "center" }}>
                    <span className="small" style={{ minWidth: 80 }}>{uid}</span>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="Principal comment..."
                      value={principalComments[uid] || ""}
                      onChange={(e) => setPrincipalComments((prev) => ({ ...prev, [uid]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            );
          })}
          <button className="btn btn-primary" onClick={handleSavePrincipalComments} style={{ marginTop: 8 }} type="button">
            Save Principal Comments
          </button>
        </div>
      )}

      {/* Preview modal */}
      {previewCard && (
        <div className="modal-backdrop" onClick={() => setPreviewCard(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: "90vh", overflow: "auto" }}>
            <ReportCardView reportCard={previewCard} />
            <div className="form-row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleDownloadPdf}>Download PDF</button>
              <button className="btn btn-ghost" onClick={() => setPreviewCard(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
