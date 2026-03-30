import type { ReportCard } from "./types";

interface Props {
  reportCard: ReportCard;
  schoolName?: string;
}

export default function ReportCardView({ reportCard, schoolName }: Props) {
  const rc = reportCard;
  const subjects = Object.values(rc.subjects);

  return (
    <div className="report-card" id="report-card-content">
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24, borderBottom: "2px solid #1a365d", paddingBottom: 16 }}>
        <h2 style={{ margin: 0, color: "#1a365d" }}>{schoolName || "KGrades"}</h2>
        <p style={{ margin: "4px 0", fontSize: 14, color: "#666" }}>Student Report Card</p>
        <p style={{ margin: 0, fontWeight: "bold" }}>{rc.session} — {rc.term}</p>
      </div>

      {/* Student Info */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, fontSize: 14 }}>
        <div>
          <p><strong>Name:</strong> {rc.studentName}</p>
          <p><strong>Student ID:</strong> {rc.studentId}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p><strong>Class:</strong> {rc.className}</p>
          <p><strong>Position:</strong> {rc.classPosition}{getOrdinalSuffix(rc.classPosition)} out of {rc.classSize}</p>
        </div>
      </div>

      {/* Subject Table */}
      <table className="grade-table" style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#1a365d", color: "white" }}>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>Subject</th>
            <th style={{ padding: "8px 12px", textAlign: "center" }}>CA</th>
            <th style={{ padding: "8px 12px", textAlign: "center" }}>Exam</th>
            <th style={{ padding: "8px 12px", textAlign: "center" }}>Total</th>
            <th style={{ padding: "8px 12px", textAlign: "center" }}>Grade</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>Remark</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px 12px" }}>{s.name}</td>
              <td style={{ padding: "8px 12px", textAlign: "center" }}>{s.caScore}/{s.caMax}</td>
              <td style={{ padding: "8px 12px", textAlign: "center" }}>{s.examScore}/{s.examMax}</td>
              <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: "bold" }}>{s.total}/{s.totalMax}</td>
              <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: "bold" }}>{s.grade}</td>
              <td style={{ padding: "8px 12px", fontSize: 12, color: "#666" }}>{s.teacherRemark}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, padding: 12, background: "#f8f9fa", borderRadius: 8, fontSize: 14 }}>
        <div><strong>Overall Average:</strong> {rc.overallAverage}%</div>
        <div><strong>Attendance:</strong> {rc.attendance.present}/{rc.attendance.total} days</div>
      </div>

      {/* Comments */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 8 }}>
          <strong style={{ fontSize: 12, color: "#666" }}>Teacher's Comment:</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14 }}>{rc.teacherComment || "—"}</p>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12 }}>
          <strong style={{ fontSize: 12, color: "#666" }}>Principal's Comment:</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14 }}>{rc.principalComment || "—"}</p>
        </div>
      </div>

      {/* Footer */}
      {rc.nextTermResumes && (
        <p style={{ fontSize: 13, color: "#666", textAlign: "center" }}>
          Next term resumes: <strong>{rc.nextTermResumes}</strong>
        </p>
      )}
    </div>
  );
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0]!;
}
