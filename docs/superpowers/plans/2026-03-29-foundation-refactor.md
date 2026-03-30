# Foundation-First Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared utils, hooks, and components from duplicated code; decompose the 1,898-line AdminClasses into focused sub-components; split the 1,407-line backend into domain modules; slim all dashboards.

**Architecture:** Foundation-first — build shared infrastructure (utils → hooks → components), then decompose large files to use it, then split the backend. Each task is independently committable.

**Tech Stack:** React 19, TypeScript, Firebase Realtime Database, Firebase Cloud Functions v1, Vite

---

## File Map

### New files to create:
- `src/utils/dateUtils.ts` — toISODate, getRecentDates, formatRelativeTime
- `src/utils/csvUtils.ts` — parseCSVLine, parseCSV, escapeCSV, downloadCSV
- `src/utils/gradeUtils.ts` — letterGrade, calculateWeightedAverage, calculateClassAverage
- `src/utils/formatters.ts` — formatStudentLabel, formatTeacherLabel, formatClassLabel, formatUserName
- `src/utils/roleUtils.ts` — roleTargets, allowedPairs, isAllowedRolePair, normalizeRole
- `src/utils/auditUtils.ts` — logAudit
- `src/hooks/useAcademicConfig.ts` — subscribe to academicConfig/default
- `src/hooks/useReportCards.ts` — load report cards for session + all sessions
- `src/hooks/useAttendanceSummary.ts` — aggregate attendance over N days
- `src/components/ReportCardTrend.tsx` — trend chart + session/term selector
- `src/admin/AdminClasses/index.tsx` — orchestrator
- `src/admin/AdminClasses/ClassCreation.tsx` — class CRUD + CSV import
- `src/admin/AdminClasses/EnrollmentManager.tsx` — 3 enrollment modes
- `src/admin/AdminClasses/RosterManager.tsx` — roster view + move/remove
- `src/admin/AdminClasses/AttendanceSummary.tsx` — 7-day attendance grid
- `functions/lib/email.ts` — nodemailer setup + sendNotificationEmail
- `functions/lib/validation.ts` — normalizeEmail, regex, ID generators, getLetterGrade
- `functions/lib/auth.ts` — createInvite, assignRoleFromInvite, validateInviteOnCreate
- `functions/lib/parents.ts` — claimParentCode, linkAdditionalChild, backfillParentCodes, onStudentCreated
- `functions/lib/users.ts` — deleteUserByAdmin
- `functions/lib/grades.ts` — notifyParentOnGrade
- `functions/lib/attendance.ts` — notifyParentOnAbsence
- `functions/lib/reportCards.ts` — publishReportCards, backfillAssignmentTerms

### Files to modify:
- `src/admin/AdminClasses.tsx` → deleted (replaced by folder)
- `src/TeacherDashboard.tsx` — swap inline helpers for shared imports
- `src/ParentDashboard.tsx` — swap inline helpers + report card trend for shared imports/component
- `src/StudentDashboard.tsx` — swap inline helpers + report card trend for shared imports/component
- `src/MessagingPanel.tsx` — swap role utils + time formatting for shared imports
- `src/admin/AdminUsers.tsx` — swap CSV/audit helpers for shared imports
- `src/App.tsx` — update lazy import path for AdminClasses → AdminClasses/index
- `functions/index.ts` — replace all logic with re-exports

### Files to move:
- `src/ConfirmModal.tsx` → `src/components/ConfirmModal.tsx`
- `src/Toasts.tsx` → `src/components/Toasts.tsx`

---

## Task 1: Extract `src/utils/dateUtils.ts`

**Files:**
- Create: `src/utils/dateUtils.ts`

- [ ] **Step 1: Create dateUtils.ts**

```ts
// src/utils/dateUtils.ts

/**
 * Format a Date as YYYY-MM-DD string.
 */
export const toISODate = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Return an array of YYYY-MM-DD strings for the most recent N days (today first).
 */
export const getRecentDates = (days = 7): string[] => {
  const list: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    list.push(toISODate(d));
  }
  return list;
};

/**
 * Format a timestamp as a relative time string ("2m ago", "3d ago", etc.).
 */
export const formatRelativeTime = (ts: number | undefined): string => {
  if (!ts) return "";

  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  return new Date(ts).toLocaleDateString();
};

/**
 * Format a timestamp for audit log display.
 */
export const formatAuditTime = (ts: number | undefined): string => {
  if (!ts) return "Unknown time";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
};
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/utils/dateUtils.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/dateUtils.ts
git commit -m "refactor: extract shared date utilities to src/utils/dateUtils.ts"
```

---

## Task 2: Extract `src/utils/csvUtils.ts`

**Files:**
- Create: `src/utils/csvUtils.ts`

- [ ] **Step 1: Create csvUtils.ts**

```ts
// src/utils/csvUtils.ts

/**
 * Parse a single CSV line respecting quoted fields.
 */
export const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

/**
 * Parse a CSV string into an array of header-keyed objects.
 */
export const parseCSV = (text: string): Record<string, string>[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] || "").trim();
    });
    return obj;
  });
};

/**
 * Escape a value for safe CSV output (prevents formula injection).
 */
export const escapeCSV = (value: unknown): string => {
  const text = String(value ?? "");
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",\n]/.test(safeText)) {
    return `"${safeText.replace(/"/g, '""')}"`;
  }
  return safeText;
};

/**
 * Build a CSV string from rows and trigger a browser download.
 */
export const downloadCSV = (filename: string, rows: string[][]): void => {
  const content = rows.map((row) => row.map(escapeCSV).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/csvUtils.ts
git commit -m "refactor: extract shared CSV utilities to src/utils/csvUtils.ts"
```

---

## Task 3: Extract `src/utils/gradeUtils.ts`

**Files:**
- Create: `src/utils/gradeUtils.ts`

- [ ] **Step 1: Create gradeUtils.ts**

```ts
// src/utils/gradeUtils.ts

import type { Assignment } from "../types";

/**
 * Convert a percentage to a letter grade.
 * Uses the scale from ParentDashboard/StudentDashboard (A/B/C/D/F).
 */
export const letterGrade = (pct: number | null | undefined): string => {
  if (pct === null || pct === undefined) return "—";
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
};

/**
 * Calculate weighted average from CA and Exam assignments.
 * Returns null if there are no graded assignments.
 */
export const calculateWeightedAverage = (
  assignments: Array<{ score: number; maxScore: number; type?: string }>,
  caWeight: number,
  examWeight: number
): number | null => {
  const caAssignments = assignments.filter((a) => a.type === "ca");
  const examAssignments = assignments.filter((a) => a.type === "exam");

  if (caAssignments.length === 0 && examAssignments.length === 0) return null;

  const caTotal = caAssignments.reduce((s, a) => s + (a.score || 0), 0);
  const caMax = caAssignments.reduce((s, a) => s + (a.maxScore || 0), 0);
  const examTotal = examAssignments.reduce((s, a) => s + (a.score || 0), 0);
  const examMax = examAssignments.reduce((s, a) => s + (a.maxScore || 0), 0);

  const caPercent = caMax > 0 ? (caTotal / caMax) * 100 : 0;
  const examPercent = examMax > 0 ? (examTotal / examMax) * 100 : 0;
  const caW = caWeight / 100;
  const examW = examWeight / 100;

  if (caMax > 0 && examMax > 0) {
    return caPercent * caW + examPercent * examW;
  } else if (caMax > 0) {
    return caPercent;
  } else if (examMax > 0) {
    return examPercent;
  }
  return null;
};

/**
 * Calculate simple average (total score / total max * 100).
 * Returns null if totalMax is 0.
 */
export const calculateSimpleAverage = (
  assignments: Array<{ score: number; maxScore: number }>
): number | null => {
  const totalScore = assignments.reduce((s, a) => s + (a.score || 0), 0);
  const totalMax = assignments.reduce((s, a) => s + (a.maxScore || 0), 0);
  return totalMax > 0 ? (totalScore / totalMax) * 100 : null;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/gradeUtils.ts
git commit -m "refactor: extract shared grade utilities to src/utils/gradeUtils.ts"
```

---

## Task 4: Extract `src/utils/formatters.ts`

**Files:**
- Create: `src/utils/formatters.ts`

- [ ] **Step 1: Create formatters.ts**

```ts
// src/utils/formatters.ts

interface UserLike {
  email?: string;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
}

interface ClassLike {
  id: string;
  name?: string;
}

/**
 * Format a teacher record for display in autocomplete dropdowns.
 */
export const formatTeacherLabel = (u: UserLike): string => {
  const first = u.firstName || "";
  const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
  const name = `${first} ${lastInitial}`.trim();
  return name ? `${name} - ${u.email}` : u.email || "";
};

/**
 * Format a student record for display in autocomplete dropdowns.
 */
export const formatStudentLabel = (u: UserLike): string => {
  const first = u.firstName || "";
  const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
  const name = `${first} ${lastInitial}`.trim();
  const id = u.studentId ? ` - ${u.studentId}` : "";
  return name ? `${name} - ${u.email}${id}`.trim() : `${u.email}${id}`.trim();
};

/**
 * Format a class record for display (e.g., "math101 - Mathematics").
 */
export const formatClassLabel = (c: ClassLike): string =>
  `${c.id} - ${c.name || "Untitled"}`;

/**
 * Format a user's display name (first + last initial).
 * Falls back to the provided fallback string.
 */
export const formatUserName = (u: UserLike | null | undefined, fallback = "Student"): string => {
  if (!u) return fallback;
  const first = u.firstName || "";
  const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
  const name = `${first} ${lastInitial}`.trim();
  return name || fallback;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/formatters.ts
git commit -m "refactor: extract shared formatters to src/utils/formatters.ts"
```

---

## Task 5: Extract `src/utils/roleUtils.ts`

**Files:**
- Create: `src/utils/roleUtils.ts`

- [ ] **Step 1: Create roleUtils.ts**

```ts
// src/utils/roleUtils.ts

/**
 * Mapping of each role to the roles it can message.
 */
export const roleTargets: Record<string, string[]> = {
  student: ["teacher"],
  teacher: ["student", "admin", "parent"],
  admin: ["teacher", "student"],
  parent: ["teacher"],
};

/**
 * Set of valid role-pair combinations (sorted alphabetically, colon-separated).
 */
export const allowedPairs: Set<string> = new Set([
  "admin:student",
  "admin:teacher",
  "student:teacher",
  "parent:teacher",
]);

/**
 * Normalize a role string (lowercase, trimmed).
 */
export const normalizeRole = (role: string | null | undefined): string =>
  String(role || "").trim().toLowerCase();

/**
 * Check whether two roles are allowed to communicate.
 */
export const isAllowedRolePair = (roleA: string, roleB: string): boolean => {
  const a = normalizeRole(roleA);
  const b = normalizeRole(roleB);
  const pair = [a, b].sort().join(":");
  return allowedPairs.has(pair);
};
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/roleUtils.ts
git commit -m "refactor: extract role utilities to src/utils/roleUtils.ts"
```

---

## Task 6: Extract `src/utils/auditUtils.ts`

**Files:**
- Create: `src/utils/auditUtils.ts`

- [ ] **Step 1: Create auditUtils.ts**

```ts
// src/utils/auditUtils.ts

import { ref, set, push } from "firebase/database";
import { db, auth } from "../firebase";

/**
 * Write an audit log entry to the database.
 */
export const logAudit = async (
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> => {
  if (!auth.currentUser) return;
  try {
    const entry = {
      action,
      createdAt: Date.now(),
      actorUid: auth.currentUser.uid,
      actorEmail: auth.currentUser.email || "",
      ...details,
    };
    await set(push(ref(db, "auditLogs")), entry);
  } catch (err) {
    console.error("Audit log error:", err);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/auditUtils.ts
git commit -m "refactor: extract audit logging to src/utils/auditUtils.ts"
```

---

## Task 7: Extract `src/hooks/useAcademicConfig.ts`

**Files:**
- Create: `src/hooks/useAcademicConfig.ts`

- [ ] **Step 1: Create useAcademicConfig.ts**

```ts
// src/hooks/useAcademicConfig.ts

import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "../firebase";
import type { AcademicConfig } from "../types";

interface ActiveTerm {
  sessionId: string;
  sessionLabel: string;
  termId: string;
  termLabel: string;
}

interface UseAcademicConfigResult {
  academicConfig: AcademicConfig | null;
  activeTerm: ActiveTerm | null;
  selectedSession: string;
  setSelectedSession: (session: string) => void;
  selectedTerm: string;
  setSelectedTerm: (term: string) => void;
  loading: boolean;
}

/**
 * Subscribe to academicConfig/default and manage session/term selection state.
 * Automatically selects the current session and active term on load.
 */
export function useAcademicConfig(): UseAcademicConfigResult {
  const [academicConfig, setAcademicConfig] = useState<AcademicConfig | null>(null);
  const [selectedSession, setSelectedSession] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const configRef = ref(db, "academicConfig/default");
    const unsub = onValue(configRef, (snap) => {
      if (snap.exists()) {
        const c = snap.val() as AcademicConfig;
        setAcademicConfig(c);
        if (!initialized && c.currentSession) {
          setSelectedSession(c.currentSession);
          const session = c.sessions?.[c.currentSession];
          if (session?.activeTerm) setSelectedTerm(session.activeTerm);
          setInitialized(true);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [initialized]);

  const activeTerm = useMemo((): ActiveTerm | null => {
    if (!academicConfig) return null;
    const sessionKey = academicConfig.currentSession;
    const session = academicConfig.sessions?.[sessionKey];
    if (!session) return null;
    const termKey = session.activeTerm;
    const term = session.terms?.[termKey];
    if (!term) return null;
    return {
      sessionId: sessionKey,
      sessionLabel: session.label,
      termId: termKey,
      termLabel: term.label,
    };
  }, [academicConfig]);

  return {
    academicConfig,
    activeTerm,
    selectedSession,
    setSelectedSession,
    selectedTerm,
    setSelectedTerm,
    loading,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAcademicConfig.ts
git commit -m "refactor: extract useAcademicConfig hook"
```

---

## Task 8: Extract `src/hooks/useReportCards.ts`

**Files:**
- Create: `src/hooks/useReportCards.ts`

- [ ] **Step 1: Create useReportCards.ts**

```ts
// src/hooks/useReportCards.ts

import { useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "../firebase";
import type { AcademicConfig, ReportCard } from "../types";

interface UseReportCardsResult {
  reportCards: ReportCard[];
  allSessionCards: ReportCard[];
  showAllSessions: boolean;
  setShowAllSessions: (show: boolean) => void;
  loading: boolean;
}

/**
 * Load report cards for a student — single session (by selected session) and all sessions.
 */
export function useReportCards(
  studentUid: string | null,
  selectedSession: string,
  academicConfig: AcademicConfig | null
): UseReportCardsResult {
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [allSessionCards, setAllSessionCards] = useState<ReportCard[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load report cards for selected session
  useEffect(() => {
    if (!studentUid || !selectedSession || !academicConfig) return;
    const session = academicConfig.sessions?.[selectedSession];
    if (!session) return;

    setLoading(true);
    const termKeys = Object.keys(session.terms);
    Promise.all(
      termKeys.map(async (tk) => {
        const snap = await get(ref(db, `reportCards/${selectedSession}/${tk}/${studentUid}`));
        return snap.exists() ? (snap.val() as ReportCard) : null;
      })
    ).then((cards) => {
      setReportCards(cards.filter((c): c is ReportCard => c !== null));
      setLoading(false);
    });
  }, [studentUid, selectedSession, academicConfig]);

  // Load report cards across ALL sessions
  useEffect(() => {
    if (!showAllSessions || !studentUid || !academicConfig) return;
    const allCards: ReportCard[] = [];
    const sessionKeys = Object.keys(academicConfig.sessions || {});

    Promise.all(
      sessionKeys.flatMap((sk) => {
        const session = academicConfig.sessions?.[sk];
        if (!session) return [];
        return Object.keys(session.terms).map(async (tk) => {
          const snap = await get(ref(db, `reportCards/${sk}/${tk}/${studentUid}`));
          if (snap.exists()) allCards.push(snap.val() as ReportCard);
        });
      })
    ).then(() => {
      allCards.sort((a, b) => {
        if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
        const sessionTerms = Object.keys(academicConfig.sessions?.[a.sessionId]?.terms || {});
        return sessionTerms.indexOf(a.termId) - sessionTerms.indexOf(b.termId);
      });
      setAllSessionCards(allCards);
    });
  }, [showAllSessions, studentUid, academicConfig]);

  return { reportCards, allSessionCards, showAllSessions, setShowAllSessions, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useReportCards.ts
git commit -m "refactor: extract useReportCards hook"
```

---

## Task 9: Extract `src/hooks/useAttendanceSummary.ts`

**Files:**
- Create: `src/hooks/useAttendanceSummary.ts`

- [ ] **Step 1: Create useAttendanceSummary.ts**

```ts
// src/hooks/useAttendanceSummary.ts

import { useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "../firebase";
import { getRecentDates } from "../utils/dateUtils";

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
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAttendanceSummary.ts
git commit -m "refactor: extract useAttendanceSummary hook"
```

---

## Task 10: Move `ConfirmModal.tsx` and `Toasts.tsx` to `src/components/`

**Files:**
- Move: `src/ConfirmModal.tsx` → `src/components/ConfirmModal.tsx`
- Move: `src/Toasts.tsx` → `src/components/Toasts.tsx`
- Modify: `src/App.tsx` — update Toasts import
- Modify: `src/admin/AdminUsers.tsx` — update ConfirmModal import

- [ ] **Step 1: Move files**

```bash
mkdir -p src/components
git mv src/ConfirmModal.tsx src/components/ConfirmModal.tsx
git mv src/Toasts.tsx src/components/Toasts.tsx
```

- [ ] **Step 2: Update import in App.tsx**

Change line 11 from:
```ts
import Toasts from "./Toasts";
```
to:
```ts
import Toasts from "./components/Toasts";
```

- [ ] **Step 3: Update import in AdminUsers.tsx**

Change line 6 from:
```ts
import ConfirmModal from "../ConfirmModal";
```
to:
```ts
import ConfirmModal from "../components/ConfirmModal";
```

- [ ] **Step 4: Update Toasts.tsx icon import path**

In `src/components/Toasts.tsx`, change line 2 from:
```ts
import { CheckIcon, AlertIcon } from './icons';
```
to:
```ts
import { CheckIcon, AlertIcon } from '../icons';
```

And change line 3 from:
```ts
import type { ToastType } from './toastService';
```
to:
```ts
import type { ToastType } from '../toastService';
```

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move ConfirmModal and Toasts to src/components/"
```

---

## Task 11: Wire shared utils into AdminClasses.tsx

**Files:**
- Modify: `src/admin/AdminClasses.tsx`

- [ ] **Step 1: Replace imports — add shared util imports at top**

Replace lines 1-4:
```ts
import { useState, useEffect, useRef } from "react";
import { ref, set, get, push } from "firebase/database";
import { db, auth } from "../firebase";
import { addToast } from "../toastService";
```
with:
```ts
import { useState, useEffect, useRef } from "react";
import { ref, set, get } from "firebase/database";
import { db } from "../firebase";
import { addToast } from "../toastService";
import { toISODate, getRecentDates } from "../utils/dateUtils";
import { parseCSV, downloadCSV } from "../utils/csvUtils";
import { formatTeacherLabel, formatStudentLabel, formatClassLabel } from "../utils/formatters";
import { logAudit } from "../utils/auditUtils";
```

- [ ] **Step 2: Remove inline helpers that are now imported**

Delete these function definitions from AdminClasses.tsx (lines 57-166):
- `toISODate` (lines 57-62)
- `getRecentDates` (lines 64-73)
- `formatTeacherLabel` (lines 75-80)
- `formatStudentLabel` (lines 82-88)
- `formatClassLabel` (line 90)
- `parseCSVLine` (lines 92-114)
- `parseCSV` (lines 116-128)
- `escapeCSV` (lines 130-137)
- `downloadCSV` (lines 139-150)
- `logAudit` (lines 152-166)

Keep `CLASS_ID_REGEX` — it's specific to this file.

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminClasses.tsx
git commit -m "refactor: wire shared utils into AdminClasses, remove inline duplicates"
```

---

## Task 12: Wire shared utils into AdminUsers.tsx

**Files:**
- Modify: `src/admin/AdminUsers.tsx`

- [ ] **Step 1: Replace imports — add shared util imports**

After line 4 (`import { addToast } from "../toastService";`), add:
```ts
import { formatAuditTime } from "../utils/dateUtils";
import { parseCSV, downloadCSV } from "../utils/csvUtils";
import { logAudit } from "../utils/auditUtils";
```

- [ ] **Step 2: Remove inline helpers**

Delete these function definitions from AdminUsers.tsx:
- `parseCSVLine` (lines 56-78)
- `parseCSV` (lines 80-92)
- `escapeCSV` (lines 94-101)
- `downloadCSV` (lines 103-114)
- `formatAuditTime` (lines 116-123)
- `logAudit` (lines 125-139)

Keep `isValidEmail` — it's specific to this file.

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminUsers.tsx
git commit -m "refactor: wire shared utils into AdminUsers, remove inline duplicates"
```

---

## Task 13: Wire shared utils + hooks into TeacherDashboard.tsx

**Files:**
- Modify: `src/TeacherDashboard.tsx`

- [ ] **Step 1: Update imports**

Replace lines 1-4:
```ts
import { useEffect, useMemo, useState } from "react";
import { ref, get, onValue, set, push } from "firebase/database";
import { db } from "./firebase";
import { addToast } from "./toastService";
```
with:
```ts
import { useEffect, useMemo, useState } from "react";
import { ref, get, onValue, set, push } from "firebase/database";
import { db } from "./firebase";
import { addToast } from "./toastService";
import { toISODate, getRecentDates } from "./utils/dateUtils";
import { useAcademicConfig } from "./hooks/useAcademicConfig";
```

- [ ] **Step 2: Remove inline date helpers**

Delete `toISODate` (lines 47-53) and `getRecentDates` (lines 55-64) from the file.

- [ ] **Step 3: Replace inline academicConfig loading with hook**

Remove the `academicConfig` state variable and its `useEffect` (lines 88 and 205-213). Replace with the hook at the top of the component:

```ts
const { academicConfig, activeTerm } = useAcademicConfig();
```

Remove the `activeTerm` useMemo block (lines 215-229) since the hook provides it.

Remove the `academicConfig` and `activeTerm`-related state declarations:
```ts
// Remove these:
const [academicConfig, setAcademicConfig] = useState<AcademicConfig | null>(null);
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/TeacherDashboard.tsx
git commit -m "refactor: wire shared date utils and useAcademicConfig into TeacherDashboard"
```

---

## Task 14: Wire shared utils + hooks into StudentDashboard.tsx

**Files:**
- Modify: `src/StudentDashboard.tsx`

- [ ] **Step 1: Update imports**

Add after the existing imports:
```ts
import { letterGrade } from "./utils/gradeUtils";
import { formatUserName } from "./utils/formatters";
import { useAcademicConfig } from "./hooks/useAcademicConfig";
import { useReportCards } from "./hooks/useReportCards";
```

- [ ] **Step 2: Replace inline academicConfig with hook**

Remove `academicConfig`, `selectedSession`, `selectedTerm` state variables and the academicConfig useEffect. Replace with:
```ts
const {
  academicConfig, selectedSession, setSelectedSession,
  selectedTerm, setSelectedTerm,
} = useAcademicConfig();
```

- [ ] **Step 3: Replace inline report card loading with hook**

Remove the two `useEffect` blocks that load report cards (single session + all sessions), and the `showAllSessions`, `allSessionCards`, `reportCards` state variables. Replace with:
```ts
const {
  reportCards, allSessionCards,
  showAllSessions, setShowAllSessions,
} = useReportCards(user?.uid ?? null, selectedSession, academicConfig);
```

- [ ] **Step 4: Replace inline helpers with imports**

- Replace `getLetter` function with imported `letterGrade`
- Replace `renderName` function with `formatUserName(profile)`

- [ ] **Step 5: Remove `selectedSubject` state — keep it (it's UI-local)**

`selectedSubject` stays as local state since it's UI-specific.

- [ ] **Step 6: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/StudentDashboard.tsx
git commit -m "refactor: wire shared hooks and utils into StudentDashboard"
```

---

## Task 15: Wire shared utils + hooks into ParentDashboard.tsx

**Files:**
- Modify: `src/ParentDashboard.tsx`

- [ ] **Step 1: Update imports**

Add after the existing imports:
```ts
import { letterGrade, calculateWeightedAverage, calculateSimpleAverage } from "./utils/gradeUtils";
import { useAcademicConfig } from "./hooks/useAcademicConfig";
import { useReportCards } from "./hooks/useReportCards";
```

- [ ] **Step 2: Replace inline academicConfig with hook**

Same pattern as StudentDashboard — remove the academicConfig state + useEffect, replace with:
```ts
const {
  academicConfig, selectedSession, setSelectedSession,
  selectedTerm, setSelectedTerm,
} = useAcademicConfig();
```

- [ ] **Step 3: Replace inline report card loading with hook**

Remove the two report card useEffects + state variables. Replace with:
```ts
const {
  reportCards, allSessionCards,
  showAllSessions, setShowAllSessions,
} = useReportCards(activeChildUid, selectedSession, academicConfig);
```

- [ ] **Step 4: Replace inline letterGrade and grade calculation**

Replace the inline `letterGrade` function with the imported one. Refactor the `classGrades` useMemo to use `calculateWeightedAverage` and `calculateSimpleAverage` from gradeUtils.

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/ParentDashboard.tsx
git commit -m "refactor: wire shared hooks and utils into ParentDashboard"
```

---

## Task 16: Wire shared utils into MessagingPanel.tsx

**Files:**
- Modify: `src/MessagingPanel.tsx`

- [ ] **Step 1: Update imports**

Add after existing imports:
```ts
import { formatRelativeTime } from "./utils/dateUtils";
import { roleTargets, allowedPairs, normalizeRole, isAllowedRolePair } from "./utils/roleUtils";
```

- [ ] **Step 2: Remove inline helpers**

Delete these from MessagingPanel.tsx:
- `roleTargets` (lines 19-24)
- `allowedPairs` (lines 26-31)
- `normalizeRole` (lines 35-36)
- `isAllowedRolePair` (lines 38-43)
- `formatRelativeTime` (lines 123-140)

Keep `threadIdFor`, `logMessagingDebug`, `sameParticipantPair`, `buildThreadRecord`, `threadNeedsRepair` — these are messaging-specific.

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/MessagingPanel.tsx
git commit -m "refactor: wire shared role and date utils into MessagingPanel"
```

---

## Task 17: Extract `src/components/ReportCardTrend.tsx`

**Files:**
- Create: `src/components/ReportCardTrend.tsx`
- Modify: `src/ParentDashboard.tsx` — replace inline trend chart
- Modify: `src/StudentDashboard.tsx` — replace inline trend chart

- [ ] **Step 1: Create ReportCardTrend.tsx**

Extract the trend chart JSX from ParentDashboard (the section between `{/* Trend Chart */}` and the closing `</div>` of the trend container). This includes the session/term selectors, the bar chart, and the change indicator.

```tsx
// src/components/ReportCardTrend.tsx

import { useState } from "react";
import type { AcademicConfig, ReportCard } from "../types";

interface ReportCardTrendProps {
  reportCards: ReportCard[];
  allSessionCards: ReportCard[];
  showAllSessions: boolean;
  onToggleAllSessions: () => void;
  selectedSubject: string | null;
  onSelectSubject: (subject: string | null) => void;
}

export default function ReportCardTrend({
  reportCards,
  allSessionCards,
  showAllSessions,
  onToggleAllSessions,
  selectedSubject,
  onSelectSubject,
}: ReportCardTrendProps) {
  const cards = showAllSessions ? allSessionCards : reportCards;
  if (cards.length === 0) return null;

  const subjectNames = [
    ...new Set(cards.flatMap((c) => Object.values(c.subjects).map((s) => s.name))),
  ];

  const getAvg = (card: ReportCard): number => {
    if (!selectedSubject) return card.overallAverage;
    const subj = Object.values(card.subjects).find((s) => s.name === selectedSubject);
    if (!subj || subj.totalMax === 0) return 0;
    return (subj.total / subj.totalMax) * 100;
  };

  const maxAvg = Math.max(...cards.map(getAvg), 100);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Academic Trend</strong>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "2px 8px" }}
          onClick={onToggleAllSessions}
        >
          {showAllSessions ? "Current session only" : "View all sessions"}
        </button>
      </div>

      {subjectNames.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <select
            className="input"
            style={{ fontSize: 12 }}
            value={selectedSubject || ""}
            onChange={(e) => onSelectSubject(e.target.value || null)}
          >
            <option value="">Overall Average</option>
            {subjectNames.sort().map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 12, padding: "0 20px" }}>
        {cards.map((card) => {
          const avg = getAvg(card);
          const height = avg > 0 ? (avg / maxAvg) * 100 : 0;
          return (
            <div key={`${card.sessionId}-${card.termId}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{ background: "#1a365d", width: "100%", borderRadius: "4px 4px 0 0", height, minHeight: 4 }} />
              <span style={{ fontSize: 9, marginTop: 4, color: "#999" }}>
                {showAllSessions ? `${card.session}` : ""}
              </span>
              <span style={{ fontSize: 10, color: "#666" }}>{card.term.split(" ")[0]}</span>
              <span style={{ fontSize: 11, fontWeight: "bold" }}>{avg > 0 ? `${Math.round(avg)}%` : "—"}</span>
            </div>
          );
        })}
      </div>

      {cards.length >= 2 && (() => {
        const latest = cards[cards.length - 1]!;
        const previous = cards[cards.length - 2]!;
        const change = getAvg(latest) - getAvg(previous);
        return (
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: change >= 0 ? "#2ecc71" : "#e74c3c" }}>
            {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% {change >= 0 ? "improvement" : "decline"} from last term
          </div>
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 2: Replace inline trend chart in ParentDashboard.tsx**

Import `ReportCardTrend` and replace the inline trend chart JSX block with:
```tsx
<ReportCardTrend
  reportCards={reportCards}
  allSessionCards={allSessionCards}
  showAllSessions={showAllSessions}
  onToggleAllSessions={() => { setShowAllSessions(!showAllSessions); setSelectedSubject(null); }}
  selectedSubject={selectedSubject}
  onSelectSubject={setSelectedSubject}
/>
```

- [ ] **Step 3: Replace inline trend chart in StudentDashboard.tsx**

Same replacement pattern.

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportCardTrend.tsx src/ParentDashboard.tsx src/StudentDashboard.tsx
git commit -m "refactor: extract ReportCardTrend shared component"
```

---

## Task 18: Decompose AdminClasses into folder

**Files:**
- Create: `src/admin/AdminClasses/index.tsx`
- Create: `src/admin/AdminClasses/ClassCreation.tsx`
- Create: `src/admin/AdminClasses/EnrollmentManager.tsx`
- Create: `src/admin/AdminClasses/RosterManager.tsx`
- Create: `src/admin/AdminClasses/AttendanceSummary.tsx`
- Delete: `src/admin/AdminClasses.tsx`
- Modify: `src/AdminDashboard.tsx` — update import path

This is the largest task. The agent should:

1. Read the current `AdminClasses.tsx` in full (it's already been slimmed of inline utils in Task 11)
2. Create each sub-component by moving the relevant state, handlers, and JSX
3. Create `index.tsx` that receives `users`, `classes`, `mySchoolId` props and renders all sub-components
4. Each sub-component receives only the props it needs from index
5. Delete the original `AdminClasses.tsx`
6. Update the import in `AdminDashboard.tsx` (likely `import AdminClasses from "./admin/AdminClasses"` — this path should work with the index.tsx)

- [ ] **Step 1: Create the AdminClasses folder and sub-components**

Create `src/admin/AdminClasses/` directory. Move the relevant sections:

- **ClassCreation.tsx**: class creation form, CSV import, export, class list, delete class — state variables: `classId`, `className`, `classTeacherUid`, `classTeacherQuery`, `showClassTeacherSuggestions`, `exportClassId`, `classListLimit`, `classSort`, `classSortDir`, refs. Handlers: `handleCreateClass`, `handleImportClassesCSV`, `handleExportGradebook`, `handleDeleteClass`.

- **EnrollmentManager.tsx**: all 3 enrollment modes — state variables: single enrollment (`enrollClassId`, `enrollClassQuery`, etc.), bulk enrollment (`bulkStudentId`, `bulkSelectedClasses`, etc.), multi-student enrollment (`multiEnrollMode`, `multiEnrollClassId`, etc.). Handlers: `handleEnrollStudent`, `handleBulkEnroll`, `handleMultiEnroll`. Resolvers: all resolve functions.

- **RosterManager.tsx**: roster display + move/remove — state variables: `rosterClassId`, `rosterClassQuery`, `showRosterClassSuggestions`, `moveTargets`, `rosterSearch`, `rosterLimit`, `rosterSelected`, `rosterBulkTarget`. Handlers: `handleRemoveFromClass`, `handleMoveStudent`, `handleBulkRemove`, `handleBulkMove`.

- **AttendanceSummary.tsx**: attendance display — state variables: `attendanceClassId`, `attendanceSummary`, `attendanceLoading`. Uses `useAttendanceSummary` hook.

- **index.tsx**: receives `AdminClassesProps`, renders all 4 sub-components. Computes `schoolScopedUsers` and `schoolScopedClasses` and passes them down.

- [ ] **Step 2: Delete original AdminClasses.tsx**

```bash
rm src/admin/AdminClasses.tsx
```

- [ ] **Step 3: Update AdminDashboard.tsx import**

The lazy import in `AdminDashboard.tsx` likely references `"./admin/AdminClasses"`. With the folder + `index.tsx`, this import path still works — verify.

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: decompose AdminClasses.tsx into focused sub-components"
```

---

## Task 19: Decompose backend `functions/index.ts` into `functions/lib/` modules

**Files:**
- Create: `functions/lib/email.ts`
- Create: `functions/lib/validation.ts`
- Create: `functions/lib/auth.ts`
- Create: `functions/lib/parents.ts`
- Create: `functions/lib/users.ts`
- Create: `functions/lib/grades.ts`
- Create: `functions/lib/attendance.ts`
- Create: `functions/lib/reportCards.ts`
- Modify: `functions/index.ts` — replace with re-exports

This is the second-largest task. The agent should:

1. Read the full `functions/index.ts`
2. Create each lib module by moving the relevant code
3. Each module imports `firebase-functions/v1` and `firebase-admin` as needed
4. Move `admin.initializeApp(...)` to a shared init — keep it in index.ts before the re-exports, or in a `functions/lib/init.ts`
5. Replace `functions/index.ts` with re-exports

Key module boundaries:

- **email.ts**: nodemailer require, emailConfig, getMailTransport, sendNotificationEmail
- **validation.ts**: normalizeEmail, emailRegex, STUDENT_ID_REGEX, SCHOOL_ID_REGEX, ALLOWED_ROLES, hasStudentIdCollision, generateUniqueStudentId, generateParentCode, getLetterGrade, all interface types (UserRecord, InviteRecord, etc.)
- **auth.ts**: validateInviteOnCreate, createInvite, assignRoleFromInvite. Imports from validation.ts
- **parents.ts**: onStudentCreated, claimParentCode, linkAdditionalChild, backfillParentCodes. Imports from validation.ts
- **users.ts**: deleteUserByAdmin
- **grades.ts**: notifyParentOnGrade. Imports from email.ts
- **attendance.ts**: notifyParentOnAbsence. Imports from email.ts
- **reportCards.ts**: publishReportCards, backfillAssignmentTerms. Imports from validation.ts

- [ ] **Step 1: Create all lib modules**

Create `functions/lib/` directory and all 8 files.

- [ ] **Step 2: Replace functions/index.ts with re-exports**

```ts
// functions/index.ts
import * as admin from 'firebase-admin';

const firebaseConfig: Record<string, unknown> = process.env.FIREBASE_CONFIG
  ? (JSON.parse(process.env.FIREBASE_CONFIG) as Record<string, unknown>)
  : {};
const databaseURL =
  (firebaseConfig['databaseURL'] as string | undefined) ||
  'https://kgrades-default-rtdb.firebaseio.com';

admin.initializeApp({
  ...firebaseConfig,
  databaseURL,
});

// Re-export all cloud functions
export { validateInviteOnCreate, createInvite, assignRoleFromInvite } from './lib/auth';
export { onStudentCreated, claimParentCode, linkAdditionalChild, backfillParentCodes } from './lib/parents';
export { deleteUserByAdmin } from './lib/users';
export { notifyParentOnGrade } from './lib/grades';
export { notifyParentOnAbsence } from './lib/attendance';
export { publishReportCards, backfillAssignmentTerms } from './lib/reportCards';
```

- [ ] **Step 3: Verify backend compiles**

Run from the functions directory:
```bash
cd functions && npx tsc --noEmit && cd ..
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: decompose functions/index.ts into domain modules under functions/lib/"
```

---

## Task 20: Final verification and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 2: Check for any remaining inline duplicates**

Search for functions that should have been removed:
```bash
grep -rn "const toISODate" src/ --include="*.tsx" --include="*.ts"
grep -rn "const parseCSVLine" src/ --include="*.tsx" --include="*.ts"
grep -rn "const letterGrade\|const getLetter" src/ --include="*.tsx" --include="*.ts"
```
Expected: Only matches in the utils/ files

- [ ] **Step 3: Verify Vite dev server starts**

```bash
npm run dev
```
Expected: Server starts without errors

- [ ] **Step 4: Verify functions build**

```bash
cd functions && npm run build && cd ..
```
Expected: Build succeeds

- [ ] **Step 5: Commit any cleanup**

```bash
git add -A
git commit -m "chore: final cleanup after foundation refactor"
```
