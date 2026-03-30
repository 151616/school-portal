import { useState, useEffect } from "react";
import { ref, get } from "firebase/database";
import { db } from "@/firebase";
import { addToast } from "@/shared/toastService";
import { getRecentDates } from "@/shared/utils/dateUtils";
import type { ClassRecord, RosterStudent, AttendanceRow } from "./index";

interface AttendanceSummaryProps {
  classes: ClassRecord[];
}

export default function AttendanceSummary({ classes }: AttendanceSummaryProps) {
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  useEffect(() => {
    if (!attendanceClassId) {
      setAttendanceSummary([]);
      return;
    }
    const loadAttendanceSummary = async () => {
      setAttendanceLoading(true);
      try {
        const snap = await get(ref(db, `attendance/${attendanceClassId}`));
        const data = snap.exists() ? snap.val() : {};
        const dates = new Set(getRecentDates(7));
        const summaryMap: Record<string, { present: number; tardy: number; absent: number; excused: number }> = {};
        Object.entries(data).forEach(([date, dayData]) => {
          if (!dates.has(date)) return;
          Object.entries((dayData as Record<string, string>) || {}).forEach(([uid, status]) => {
            if (!summaryMap[uid]) {
              summaryMap[uid] = { present: 0, tardy: 0, absent: 0, excused: 0 };
            }
            if (summaryMap[uid][status as keyof typeof summaryMap[string]] !== undefined) {
              summaryMap[uid][status as keyof typeof summaryMap[string]] += 1;
            }
          });
        });
        const classObj = classes.find((c) => c.id === attendanceClassId);
        const rosterList: RosterStudent[] = classObj?.students ? Object.values(classObj.students) : [];
        const list: AttendanceRow[] = rosterList.map((s) => ({
          uid: s.uid,
          name: `${s.firstName || "Student"} ${s.lastInitial ? `${s.lastInitial}.` : ""}`.trim(),
          email: s.email,
          studentId: s.studentId,
          ...summaryMap[s.uid],
        }));
        setAttendanceSummary(list);
      } catch (err) {
        console.error("Admin attendance summary error:", err);
        addToast("error", "Unable to load attendance summary");
      } finally {
        setAttendanceLoading(false);
      }
    };
    loadAttendanceSummary();
  }, [attendanceClassId, classes]);

  return (
    <div className="section">
      <h3>Attendance Summary</h3>
      <div className="small">Past 7 days per class.</div>
      <div className="form-row" style={{ marginTop: 8 }}>
        <select
          className="select"
          value={attendanceClassId}
          onChange={(e) => setAttendanceClassId(e.target.value)}
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} - {c.name || "Untitled"}
            </option>
          ))}
        </select>
      </div>
      {attendanceLoading && (
        <div className="small" style={{ marginTop: 6 }}>Loading attendance...</div>
      )}
      {!attendanceLoading && attendanceClassId && (
        <>
          {attendanceSummary.length === 0 ? (
            <div className="small" style={{ marginTop: 6 }}>No attendance data yet.</div>
          ) : (
            <ul className="card-list" style={{ marginTop: 8 }}>
              {attendanceSummary.map((row) => (
                <li key={row.uid}>
                  <div>
                    <div>{row.name}</div>
                    <div className="meta">
                      Present {row.present || 0} | Tardy {row.tardy || 0} | Absent{" "}
                      {row.absent || 0}
                      {(row.absent || 0) >= 2 ? " | Missed days flag" : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
