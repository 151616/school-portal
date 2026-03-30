import { useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "@/firebase";
import { getRecentDates } from "@/shared/utils/dateUtils";

export interface AttendanceSummaryRow {
  uid: string;
  name: string;
  email?: string;
  studentId?: string;
  present: number;
  tardy: number;
  absent: number;
  excused: number;
}

interface RosterEntry {
  uid: string;
  firstName?: string;
  lastInitial?: string;
  email?: string;
  studentId?: string;
}

/**
 * Load and aggregate attendance data for a class over the last N days.
 */
export function useAttendanceSummary(
  classId: string,
  roster: RosterEntry[],
  days = 7
): { summary: AttendanceSummaryRow[]; loading: boolean } {
  const [summary, setSummary] = useState<AttendanceSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!classId) {
      setSummary([]);
      return;
    }

    const loadSummary = async () => {
      setLoading(true);
      try {
        const snap = await get(ref(db, `attendance/${classId}`));
        const data = snap.exists() ? snap.val() : {};
        const dates = new Set(getRecentDates(days));
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

        const list: AttendanceSummaryRow[] = roster.map((s) => ({
          uid: s.uid,
          name: `${s.firstName || "Student"} ${s.lastInitial ? `${s.lastInitial}.` : ""}`.trim(),
          email: s.email,
          studentId: s.studentId,
          present: summaryMap[s.uid]?.present || 0,
          tardy: summaryMap[s.uid]?.tardy || 0,
          absent: summaryMap[s.uid]?.absent || 0,
          excused: summaryMap[s.uid]?.excused || 0,
        }));
        setSummary(list);
      } catch (err) {
        console.error("Attendance summary error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, [classId, roster, days]);

  return { summary, loading };
}
