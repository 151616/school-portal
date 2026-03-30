# Report Cards & Academic Trend Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable academic terms, immutable report card snapshots with bulk publish, client-side PDF download, and academic trend tracking to KGrades.

**Architecture:** Add `termId`/`sessionId` fields to assignments so grades are tagged to terms during entry. Admin configures academic calendar (sessions + terms). On bulk publish, a Cloud Function snapshots all term grades into immutable `reportCards` records with computed totals, positions, and comments. Trend tracking reads published report cards across terms. PDF generated client-side with jsPDF.

**Tech Stack:** TypeScript, React 19, Firebase RTDB, Cloud Functions v1 (Node 22), jsPDF + html2canvas

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `src/types/academic.ts` | Types for AcademicConfig, ReportCard, ReportComments |
| `src/admin/AdminCalendar.tsx` | Academic calendar management (sessions, terms, active term) |
| `src/admin/AdminReportCards.tsx` | Report card readiness dashboard, bulk publish, preview, download |
| `src/ReportCardView.tsx` | Shared report card renderer (in-app view + PDF capture target) |

### Modified Files
| File | Change |
|---|---|
| `src/types/firebase.ts` | Add `termId?`, `sessionId?` to Assignment |
| `src/types/index.ts` | Re-export academic types |
| `src/types/callable.ts` | Add PublishReportCardsData/Result, BackfillAssignmentTermsData/Result |
| `functions/index.ts` | Add `publishReportCards` and `backfillAssignmentTerms` Cloud Functions |
| `database.rules.json` | Add rules for `academicConfig`, `reportCards`, `reportComments` |
| `src/AdminDashboard.tsx` | Add "Calendar" and "Report Cards" tabs |
| `src/TeacherDashboard.tsx` | Load active term, tag grades with termId/sessionId, add report comments UI |
| `src/ParentDashboard.tsx` | Add term selector, trend chart, report card view/download |
| `src/StudentDashboard.tsx` | Add term selector, trend chart, report card view/download |
| `package.json` | Add jspdf, html2canvas dependencies |

---

## Task 1: Add Type Definitions & Dependencies

**Files:**
- Modify: `src/types/firebase.ts`
- Create: `src/types/academic.ts`
- Modify: `src/types/index.ts`
- Modify: `src/types/callable.ts`
- Modify: `package.json`

- [ ] **Step 1: Add termId/sessionId to Assignment**

In `src/types/firebase.ts`, add two optional fields to the `Assignment` interface:

```typescript
export interface Assignment {
  name: string;
  score: number;
  maxScore: number;
  rubric?: string;
  type?: AssignmentType;
  teacherUid: string;
  updatedAt: number;
  termId?: string;       // e.g. "term2"
  sessionId?: string;    // e.g. "2025-2026"
}
```

- [ ] **Step 2: Create academic types**

Create `src/types/academic.ts`:

```typescript
import type { UserRole } from "./firebase";

// ── academicConfig/{schoolId} ──
export interface Term {
  label: string;       // "1st Term"
  startDate: string;   // "2025-09-08"
  endDate: string;     // "2025-12-13"
}

export interface AcademicSession {
  label: string;                    // "2025/2026"
  terms: Record<string, Term>;     // { term1: {...}, term2: {...}, term3: {...} }
  activeTerm: string;              // "term1"
}

export interface AcademicConfig {
  termStructure: string[];                    // ["1st Term", "2nd Term", "3rd Term"]
  sessions: Record<string, AcademicSession>; // { "2025-2026": {...} }
  currentSession: string;                    // "2025-2026"
}

// ── reportCards/{sessionId}/{termId}/{studentUid} ──
export interface ReportCardSubject {
  name: string;
  caScore: number;
  caMax: number;
  examScore: number;
  examMax: number;
  total: number;
  totalMax: number;
  grade: string;
  teacherRemark: string;
}

export interface ReportCard {
  studentName: string;
  studentId: string;
  className: string;
  classId: string;
  session: string;        // display label "2025/2026"
  term: string;           // display label "2nd Term"
  sessionId: string;
  termId: string;
  schoolId: string;
  publishedAt: number;
  publishedBy: string;

  subjects: Record<string, ReportCardSubject>;

  classPosition: number;
  classSize: number;
  overallAverage: number;

  attendance: {
    present: number;
    total: number;
  };

  teacherComment: string;
  principalComment: string;
  nextTermResumes: string;
}

// ── reportComments/{sessionId}/{termId}/{studentUid} ──
export interface ReportComments {
  teacherComment?: string;
  principalComment?: string;
}
```

- [ ] **Step 3: Update barrel export**

In `src/types/index.ts`:

```typescript
export type * from "./firebase";
export type * from "./callable";
export type * from "./academic";
```

- [ ] **Step 4: Add callable types**

In `src/types/callable.ts`, add at the bottom:

```typescript
// ── publishReportCards ──
export interface PublishReportCardsData {
  sessionId: string;
  termId: string;
  schoolId: string;
}

export interface PublishReportCardsResult {
  success: boolean;
  published: number;
  skipped: number;
  errors: string[];
}

// ── backfillAssignmentTerms ──
export interface BackfillAssignmentTermsData {
  sessionId: string;
  schoolId: string;
}

export interface BackfillAssignmentTermsResult {
  success: boolean;
  updated: number;
  unmatched: number;
}
```

- [ ] **Step 5: Install jsPDF and html2canvas**

```bash
cd C:\Users\shiva\Code\school-portal && npm install jspdf html2canvas
```

- [ ] **Step 6: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/types/ package.json package-lock.json
git commit -m "feat: add academic calendar and report card type definitions

AcademicConfig, ReportCard, ReportComments types. Added termId/sessionId
to Assignment. Callable types for publishReportCards and backfillAssignmentTerms.
Installed jspdf and html2canvas for client-side PDF generation."
```

---

## Task 2: Update Security Rules

**Files:**
- Modify: `database.rules.json`

- [ ] **Step 1: Add academicConfig rules**

Add after the `"schoolSettings"` block in `database.rules.json`:

```json
"academicConfig": {
  ".read": "auth != null",
  "$schoolId": {
    ".write": "auth != null && auth.token.admin === true"
  }
}
```

- [ ] **Step 2: Add reportCards rules**

```json
"reportCards": {
  "$sessionId": {
    "$termId": {
      ".read": "auth != null && auth.token.admin === true",
      "$studentUid": {
        ".read": "auth != null && (auth.token.admin === true || auth.uid === $studentUid || root.child('parents').child(auth.uid).child('children').child($studentUid).val() === true)"
      }
    }
  }
}
```

Note: No `.write` rules — `reportCards` are written exclusively by the admin SDK in Cloud Functions.

- [ ] **Step 3: Add reportComments rules**

```json
"reportComments": {
  "$sessionId": {
    "$termId": {
      ".read": "auth != null && (auth.token.admin === true || root.child('Users').child(auth.uid).child('role').val() === 'teacher')",
      "$studentUid": {
        ".write": "auth != null && (auth.token.admin === true || root.child('Users').child(auth.uid).child('role').val() === 'teacher')"
      }
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add database.rules.json
git commit -m "feat: add security rules for academicConfig, reportCards, reportComments

academicConfig: read all auth, write admin only.
reportCards: read by admin/student/parent, write by Cloud Functions only.
reportComments: read/write by admin and teachers."
```

---

## Task 3: Build Admin Academic Calendar

**Files:**
- Create: `src/admin/AdminCalendar.tsx`
- Modify: `src/AdminDashboard.tsx`

- [ ] **Step 1: Create AdminCalendar.tsx**

Create `src/admin/AdminCalendar.tsx`:

```typescript
import { useState, useEffect } from "react";
import { ref, onValue, set } from "firebase/database";
import { db } from "../firebase";
import { addToast } from "../toastService";
import type { AcademicConfig, AcademicSession, Term } from "../types";

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
```

- [ ] **Step 2: Add Calendar and Report Cards tabs to AdminDashboard**

In `src/AdminDashboard.tsx`:

1. Add imports:
```typescript
import AdminCalendar from "./admin/AdminCalendar";
import AdminReportCards from "./admin/AdminReportCards";
```

2. Update `ActivePage` type:
```typescript
type ActivePage = "users" | "classes" | "calendar" | "reportcards" | "settings" | "diagnostics";
```

3. Add two tab buttons after the "Classes & Scheduling" button:
```typescript
<button
  className={`btn ${activePage === "calendar" ? "btn-primary" : "btn-ghost"}`}
  onClick={() => setActivePage("calendar")}
>
  Academic Calendar
</button>
<button
  className={`btn ${activePage === "reportcards" ? "btn-primary" : "btn-ghost"}`}
  onClick={() => setActivePage("reportcards")}
>
  Report Cards
</button>
```

4. Add render blocks after the classes block:
```typescript
{activePage === "calendar" && <AdminCalendar mySchoolId={mySchoolId} />}
{activePage === "reportcards" && (
  <AdminReportCards classes={classes} mySchoolId={mySchoolId} />
)}
```

- [ ] **Step 3: Create placeholder AdminReportCards.tsx**

Create `src/admin/AdminReportCards.tsx` with a placeholder (we'll fill it in Task 6):

```typescript
import type { ReactElement } from "react";

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

export default function AdminReportCards({ classes: _classes, mySchoolId: _mySchoolId }: Props): ReactElement {
  return (
    <div className="section">
      <h3>Report Cards</h3>
      <p className="muted">Report card management coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminCalendar.tsx src/admin/AdminReportCards.tsx src/AdminDashboard.tsx
git commit -m "feat: add academic calendar management for admins

Create/edit sessions with configurable term structure (2 or 3 terms).
Set active term and current session. New Admin Dashboard tabs."
```

---

## Task 4: Tag Grades with Term Info (Teacher Dashboard)

**Files:**
- Modify: `src/TeacherDashboard.tsx`

- [ ] **Step 1: Add academic config state and loading**

In `src/TeacherDashboard.tsx`, add imports:

```typescript
import type { AcademicConfig } from "./types";
```

Add state after the existing state declarations (around line 87):

```typescript
const [academicConfig, setAcademicConfig] = useState<AcademicConfig | null>(null);
```

Add a useEffect to load the academic config (after the existing useEffect blocks):

```typescript
useEffect(() => {
  const configRef = ref(db, "academicConfig/default");
  const unsub = onValue(configRef, (snap) => {
    if (snap.exists()) {
      setAcademicConfig(snap.val() as AcademicConfig);
    }
  });
  return () => unsub();
}, []);
```

- [ ] **Step 2: Compute active term info**

Add a useMemo after the academic config state:

```typescript
const activeTerm = useMemo(() => {
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
```

- [ ] **Step 3: Display active term badge**

Add after the class selector in the JSX (find the `<select>` for class selection):

```typescript
{activeTerm && (
  <div style={{ border: "1px solid #1a365d", borderRadius: 6, padding: "6px 12px", background: "#f0f7ff", fontSize: 13 }}>
    <strong>Active:</strong> {activeTerm.termLabel} ({activeTerm.sessionLabel})
  </div>
)}
```

- [ ] **Step 4: Tag grade payload with termId/sessionId**

Find the `gradePayload` object (around line 254):

```typescript
const gradePayload: Omit<Assignment, "type"> & { type?: "ca" | "exam" } = {
  name: assignmentName.trim(),
  score: 0,
  maxScore: Number(maxScore),
  rubric: assignmentRubric.trim() || "",
  teacherUid: user.uid,
  updatedAt: Date.now(),
  ...(assignmentType ? { type: assignmentType } : {}),
};
```

Add `termId` and `sessionId`:

```typescript
const gradePayload: Omit<Assignment, "type"> & { type?: "ca" | "exam" } = {
  name: assignmentName.trim(),
  score: 0,
  maxScore: Number(maxScore),
  rubric: assignmentRubric.trim() || "",
  teacherUid: user.uid,
  updatedAt: Date.now(),
  ...(assignmentType ? { type: assignmentType } : {}),
  ...(activeTerm ? { termId: activeTerm.termId, sessionId: activeTerm.sessionId } : {}),
};
```

- [ ] **Step 5: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/TeacherDashboard.tsx
git commit -m "feat: tag grades with active term and session

Teachers see active term badge. New assignments auto-tagged with
termId and sessionId from academic config."
```

---

## Task 5: Add Teacher Report Comments

**Files:**
- Modify: `src/TeacherDashboard.tsx`

- [ ] **Step 1: Add report comments state**

Add state:

```typescript
const [reportComments, setReportComments] = useState<Record<string, string>>({});
const [commentsSaving, setCommentsSaving] = useState(false);
```

- [ ] **Step 2: Load existing comments when class changes**

Add a useEffect that loads comments when selectedClassId or activeTerm changes:

```typescript
useEffect(() => {
  if (!selectedClassId || !activeTerm) return;
  const selectedClass = classes.find((c) => c.id === selectedClassId);
  if (!selectedClass?.students) return;

  const studentUids = Object.keys(selectedClass.students);
  const comments: Record<string, string> = {};

  Promise.all(
    studentUids.map(async (uid) => {
      const snap = await get(
        ref(db, `reportComments/${activeTerm.sessionId}/${activeTerm.termId}/${uid}/teacherComment`)
      );
      if (snap.exists()) {
        comments[uid] = snap.val() as string;
      }
    })
  ).then(() => setReportComments(comments));
}, [selectedClassId, activeTerm, classes]);
```

- [ ] **Step 3: Add save comments handler**

```typescript
const handleSaveComments = async () => {
  if (!activeTerm || !selectedClassId) return;
  setCommentsSaving(true);
  try {
    const writes = Object.entries(reportComments)
      .filter(([_, comment]) => comment.trim())
      .map(([uid, comment]) =>
        set(
          ref(db, `reportComments/${activeTerm.sessionId}/${activeTerm.termId}/${uid}/teacherComment`),
          comment.trim()
        )
      );
    await Promise.all(writes);
    addToast("success", "Report comments saved");
  } catch (err) {
    addToast("error", "Failed to save comments: " + (err as Error).message);
  }
  setCommentsSaving(false);
};
```

- [ ] **Step 4: Add report comments UI section**

Add this JSX after the attendance section (before the closing `</div>` of the card), only when a class is selected and activeTerm exists:

```typescript
{selectedClassId && activeTerm && (() => {
  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const students = selectedClass?.students
    ? Object.values(selectedClass.students).sort((a, b) =>
        (a.firstName || a.email || "").localeCompare(b.firstName || b.email || "")
      )
    : [];
  if (students.length === 0) return null;

  return (
    <div className="section">
      <h3>Report Comments — {activeTerm.termLabel}</h3>
      <p className="muted">Write a remark for each student. These appear on the published report card.</p>
      {students.map((s) => (
        <div key={s.uid} className="form-row" style={{ marginBottom: 8 }}>
          <span style={{ minWidth: 160, fontSize: 13 }}>
            {s.firstName || ""} {s.lastInitial || ""} {s.studentId ? `(${s.studentId})` : ""}
          </span>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Write a remark..."
            value={reportComments[s.uid] || ""}
            onChange={(e) =>
              setReportComments((prev) => ({ ...prev, [s.uid]: e.target.value }))
            }
          />
        </div>
      ))}
      <button
        className="btn btn-primary"
        style={{ marginTop: 8 }}
        onClick={handleSaveComments}
        disabled={commentsSaving}
      >
        {commentsSaving ? "Saving..." : "Save Comments"}
      </button>
    </div>
  );
})()}
```

- [ ] **Step 5: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/TeacherDashboard.tsx
git commit -m "feat: add teacher report comments for term report cards

Teachers can write per-student remarks that get included in published
report cards. Comments saved to reportComments/{session}/{term}/{student}."
```

---

## Task 6: Build Publish Report Cards Cloud Function

**Files:**
- Modify: `functions/index.ts`

- [ ] **Step 1: Add type definitions in functions**

Add these interfaces near the top of `functions/index.ts` (after existing type definitions):

```typescript
interface TermInfo {
  label: string;
  startDate: string;
  endDate: string;
}

interface AcademicSessionInfo {
  label: string;
  terms: Record<string, TermInfo>;
  activeTerm: string;
}

interface AcademicConfigData {
  termStructure: string[];
  sessions: Record<string, AcademicSessionInfo>;
  currentSession: string;
}

interface ReportCardSubject {
  name: string;
  caScore: number;
  caMax: number;
  examScore: number;
  examMax: number;
  total: number;
  totalMax: number;
  grade: string;
  teacherRemark: string;
}

interface ReportCardData {
  studentName: string;
  studentId: string;
  className: string;
  classId: string;
  session: string;
  term: string;
  sessionId: string;
  termId: string;
  schoolId: string;
  publishedAt: number;
  publishedBy: string;
  subjects: Record<string, ReportCardSubject>;
  classPosition: number;
  classSize: number;
  overallAverage: number;
  attendance: { present: number; total: number };
  teacherComment: string;
  principalComment: string;
  nextTermResumes: string;
}
```

- [ ] **Step 2: Add grade letter helper**

```typescript
const getLetterGrade = (percentage: number): string => {
  if (percentage >= 70) return "A";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 45) return "D";
  if (percentage >= 40) return "E";
  return "F";
};
```

- [ ] **Step 3: Add publishReportCards callable**

```typescript
exports.publishReportCards = functions.https.onCall(
  async (
    data: { sessionId: string; termId: string; schoolId: string },
    context: functions.https.CallableContext
  ) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }

    const { sessionId, termId, schoolId } = data;
    if (!sessionId || !termId || !schoolId) {
      throw new functions.https.HttpsError("invalid-argument", "sessionId, termId, and schoolId required");
    }

    const dbRef = admin.database().ref();

    // Load academic config
    const configSnap = await dbRef.child(`academicConfig/${schoolId}`).once("value");
    const config = configSnap.val() as AcademicConfigData | null;
    if (!config?.sessions?.[sessionId]?.terms?.[termId]) {
      throw new functions.https.HttpsError("not-found", "Session or term not found");
    }

    const session = config.sessions[sessionId]!;
    const term = session.terms[termId]!;
    const termStart = term.startDate;
    const termEnd = term.endDate;

    // Find next term resumes date
    const termKeys = Object.keys(session.terms).sort();
    const currentTermIndex = termKeys.indexOf(termId);
    const nextTerm = currentTermIndex < termKeys.length - 1
      ? session.terms[termKeys[currentTermIndex + 1]!]
      : null;
    const nextTermResumes = nextTerm ? nextTerm.startDate : "";

    // Load all classes for this school
    const classesSnap = await dbRef.child("classes").once("value");
    const classesData = classesSnap.val() || {};

    let published = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Collect all student averages per class for ranking
    const classStudentAverages: Record<string, Array<{ uid: string; average: number }>> = {};

    for (const [classId, classVal] of Object.entries(classesData)) {
      const cls = classVal as { name?: string; teacherUid?: string; schoolId?: string; students?: Record<string, unknown> };
      if (cls.schoolId && cls.schoolId !== schoolId) continue;
      if (!cls.students) continue;

      const studentUids = Object.keys(cls.students);
      classStudentAverages[classId] = [];

      for (const studentUid of studentUids) {
        try {
          // Load assignments for this student in this class
          const gradesSnap = await dbRef
            .child(`grades/${studentUid}/${classId}/assignments`)
            .once("value");
          const assignments = gradesSnap.val() || {};

          // Filter to matching term
          let caScore = 0, caMax = 0, examScore = 0, examMax = 0;
          let hasGrades = false;

          for (const aVal of Object.values(assignments)) {
            const a = aVal as { termId?: string; sessionId?: string; type?: string; score?: number; maxScore?: number };
            if (a.termId !== termId || a.sessionId !== sessionId) continue;
            hasGrades = true;
            const score = Number(a.score || 0);
            const max = Number(a.maxScore || 0);
            if (a.type === "exam") {
              examScore += score;
              examMax += max;
            } else {
              caScore += score;
              caMax += max;
            }
          }

          if (!hasGrades) {
            skipped++;
            continue;
          }

          const total = caScore + examScore;
          const totalMax = caMax + examMax;
          const percentage = totalMax > 0 ? (total / totalMax) * 100 : 0;

          classStudentAverages[classId]!.push({ uid: studentUid, average: percentage });
        } catch (err) {
          errors.push(`Error processing ${studentUid} in ${classId}: ${(err as Error).message}`);
        }
      }
    }

    // Now rank and write report cards
    for (const [classId, classVal] of Object.entries(classesData)) {
      const cls = classVal as { name?: string; teacherUid?: string; schoolId?: string; students?: Record<string, { firstName?: string; lastInitial?: string; studentId?: string; email?: string }> };
      if (cls.schoolId && cls.schoolId !== schoolId) continue;
      if (!cls.students) continue;

      const rankings = (classStudentAverages[classId] || [])
        .sort((a, b) => b.average - a.average);
      const classSize = rankings.length;

      for (const studentUid of Object.keys(cls.students)) {
        try {
          const studentData = cls.students[studentUid];
          const ranking = rankings.findIndex((r) => r.uid === studentUid);
          if (ranking === -1) continue; // no grades, already skipped

          // Load student profile
          const userSnap = await dbRef.child(`Users/${studentUid}`).once("value");
          const userProfile = userSnap.val() as { firstName?: string; lastInitial?: string; studentId?: string } | null;

          // Load assignments again for detailed subject breakdown
          const gradesSnap = await dbRef
            .child(`grades/${studentUid}/${classId}/assignments`)
            .once("value");
          const assignments = gradesSnap.val() || {};

          let caScore = 0, caMax = 0, examScore = 0, examMax = 0;
          for (const aVal of Object.values(assignments)) {
            const a = aVal as { termId?: string; sessionId?: string; type?: string; score?: number; maxScore?: number };
            if (a.termId !== termId || a.sessionId !== sessionId) continue;
            const score = Number(a.score || 0);
            const max = Number(a.maxScore || 0);
            if (a.type === "exam") {
              examScore += score;
              examMax += max;
            } else {
              caScore += score;
              caMax += max;
            }
          }

          const total = caScore + examScore;
          const totalMax = caMax + examMax;
          const percentage = totalMax > 0 ? (total / totalMax) * 100 : 0;

          // Load comments
          const commentsSnap = await dbRef
            .child(`reportComments/${sessionId}/${termId}/${studentUid}`)
            .once("value");
          const comments = commentsSnap.val() as { teacherComment?: string; principalComment?: string } | null;

          // Load attendance within term date range
          const attendanceSnap = await dbRef.child(`attendance/${classId}`).once("value");
          const attendanceData = attendanceSnap.val() || {};
          let present = 0, totalDays = 0;
          for (const [dateStr, dateVal] of Object.entries(attendanceData)) {
            if (dateStr >= termStart && dateStr <= termEnd) {
              const studentAttendance = (dateVal as Record<string, string>)?.[studentUid];
              if (studentAttendance) {
                totalDays++;
                if (studentAttendance === "present" || studentAttendance === "tardy") {
                  present++;
                }
              }
            }
          }

          // Build subject entry (one per class for now)
          const subject: ReportCardSubject = {
            name: cls.name || classId,
            caScore,
            caMax,
            examScore,
            examMax,
            total,
            totalMax,
            grade: getLetterGrade(percentage),
            teacherRemark: comments?.teacherComment || "",
          };

          const studentName = [
            userProfile?.firstName || studentData?.firstName || "",
            userProfile?.lastInitial || studentData?.lastInitial || "",
          ].filter(Boolean).join(" ");

          const reportCard: ReportCardData = {
            studentName,
            studentId: userProfile?.studentId || studentData?.studentId || "",
            className: cls.name || classId,
            classId,
            session: session.label,
            term: term.label,
            sessionId,
            termId,
            schoolId,
            publishedAt: Date.now(),
            publishedBy: context.auth!.uid,
            subjects: { [classId]: subject },
            classPosition: ranking + 1,
            classSize,
            overallAverage: Math.round(percentage * 10) / 10,
            attendance: { present, total: totalDays },
            teacherComment: comments?.teacherComment || "",
            principalComment: comments?.principalComment || "",
            nextTermResumes,
          };

          // Check if this student already has a report card — merge subjects
          const existingSnap = await dbRef
            .child(`reportCards/${sessionId}/${termId}/${studentUid}`)
            .once("value");
          if (existingSnap.exists()) {
            const existing = existingSnap.val() as ReportCardData;
            reportCard.subjects = { ...existing.subjects, ...reportCard.subjects };
            // Recompute overall average across all subjects
            const allSubjects = Object.values(reportCard.subjects);
            const totalAll = allSubjects.reduce((s, sub) => s + sub.total, 0);
            const totalMaxAll = allSubjects.reduce((s, sub) => s + sub.totalMax, 0);
            reportCard.overallAverage = totalMaxAll > 0
              ? Math.round((totalAll / totalMaxAll) * 1000) / 10
              : 0;
          }

          await dbRef.child(`reportCards/${sessionId}/${termId}/${studentUid}`).set(reportCard);
          published++;
        } catch (err) {
          errors.push(`Error writing report for ${studentUid}: ${(err as Error).message}`);
        }
      }
    }

    // Notify parents
    try {
      const parentsSnap = await dbRef.child("parents").once("value");
      const parentsData = parentsSnap.val() || {};
      for (const [parentUid, parentVal] of Object.entries(parentsData)) {
        const children = (parentVal as { children?: Record<string, boolean> })?.children || {};
        for (const childUid of Object.keys(children)) {
          const reportExists = await dbRef
            .child(`reportCards/${sessionId}/${termId}/${childUid}`)
            .once("value");
          if (reportExists.exists()) {
            const notifRef = dbRef.child(`notifications/${parentUid}`).push();
            await notifRef.set({
              type: "grade",
              title: "Report Card Published",
              body: `${term.label} (${session.label}) report card is now available.`,
              createdAt: Date.now(),
              read: false,
            });
          }
        }
      }
    } catch (err) {
      errors.push(`Error sending notifications: ${(err as Error).message}`);
    }

    return { success: true, published, skipped, errors };
  }
);
```

- [ ] **Step 4: Add backfillAssignmentTerms callable**

```typescript
exports.backfillAssignmentTerms = functions.https.onCall(
  async (
    data: { sessionId: string; schoolId: string },
    context: functions.https.CallableContext
  ) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }

    const { sessionId, schoolId } = data;
    const dbRef = admin.database().ref();

    // Load config
    const configSnap = await dbRef.child(`academicConfig/${schoolId}`).once("value");
    const config = configSnap.val() as AcademicConfigData | null;
    if (!config?.sessions?.[sessionId]) {
      throw new functions.https.HttpsError("not-found", "Session not found");
    }

    const session = config.sessions[sessionId]!;
    const termRanges = Object.entries(session.terms).map(([key, t]) => ({
      key,
      start: new Date(t.startDate).getTime(),
      end: new Date(t.endDate).getTime() + 86400000, // include end date
    }));

    // Load all grades
    const gradesSnap = await dbRef.child("grades").once("value");
    const gradesData = gradesSnap.val() || {};

    let updated = 0;
    let unmatched = 0;
    const updates: Record<string, unknown> = {};

    for (const [studentUid, studentVal] of Object.entries(gradesData)) {
      const studentGrades = studentVal as Record<string, { assignments?: Record<string, { updatedAt?: number; termId?: string; sessionId?: string }> }>;
      for (const [classId, classVal] of Object.entries(studentGrades)) {
        const assignments = classVal?.assignments || {};
        for (const [assignmentId, assignment] of Object.entries(assignments)) {
          if (assignment.termId && assignment.sessionId) continue; // already tagged

          const timestamp = assignment.updatedAt || 0;
          const matchingTerm = termRanges.find(
            (t) => timestamp >= t.start && timestamp < t.end
          );

          if (matchingTerm) {
            updates[`grades/${studentUid}/${classId}/assignments/${assignmentId}/termId`] = matchingTerm.key;
            updates[`grades/${studentUid}/${classId}/assignments/${assignmentId}/sessionId`] = sessionId;
            updated++;
          } else {
            unmatched++;
          }
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await dbRef.update(updates);
    }

    return { success: true, updated, unmatched };
  }
);
```

- [ ] **Step 5: Build functions**

```bash
cd C:\Users\shiva\Code\school-portal\functions && npm run build
```

Fix any type errors until build passes.

- [ ] **Step 6: Verify frontend build too**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add functions/
git commit -m "feat: add publishReportCards and backfillAssignmentTerms Cloud Functions

publishReportCards: computes per-subject scores, ranks students,
snapshots attendance, merges teacher/principal comments into immutable
report cards. Notifies parents on publish.

backfillAssignmentTerms: tags existing assignments with termId/sessionId
based on updatedAt timestamp and term date ranges."
```

---

## Task 7: Build Report Card View Component

**Files:**
- Create: `src/ReportCardView.tsx`

- [ ] **Step 1: Create ReportCardView.tsx**

Create `src/ReportCardView.tsx`:

```typescript
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
```

- [ ] **Step 2: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/ReportCardView.tsx
git commit -m "feat: add ReportCardView component for in-app report card display

Renders student info, subject table with CA/Exam/Total/Grade,
attendance summary, teacher and principal comments, overall average."
```

---

## Task 8: Build Admin Report Cards Dashboard

**Files:**
- Modify: `src/admin/AdminReportCards.tsx`

- [ ] **Step 1: Replace placeholder with full implementation**

Replace the contents of `src/admin/AdminReportCards.tsx`:

```typescript
import { useState, useEffect } from "react";
import { ref, onValue, get, set } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { addToast } from "../toastService";
import ReportCardView from "../ReportCardView";
import type { AcademicConfig, ReportCard, PublishReportCardsData, PublishReportCardsResult } from "../types";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
}

export default function AdminReportCards({ classes, mySchoolId }: Props) {
  const schoolId = mySchoolId || "default";
  const [config, setConfig] = useState<AcademicConfig | null>(null);
  const [selectedSession, setSelectedSession] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [readiness, setReadiness] = useState<ClassReadiness[]>([]);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewCard, setPreviewCard] = useState<ReportCard | null>(null);
  const [principalComments, setPrincipalComments] = useState<Record<string, string>>({});

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
    if (!selectedSession || !selectedTerm || classes.length === 0) return;
    setLoadingReadiness(true);

    const checkReadiness = async () => {
      const results: ClassReadiness[] = [];

      for (const cls of classes) {
        const studentUids = cls.students ? Object.keys(cls.students) : [];
        if (studentUids.length === 0) continue;

        let gradesComplete = 0;
        let commentsComplete = 0;
        let published = false;

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
          if (reportSnap.exists()) published = true;
        }

        results.push({
          classId: cls.id,
          className: cls.name || cls.id,
          studentCount: studentUids.length,
          gradesComplete,
          commentsComplete,
          published,
        });
      }

      setReadiness(results);
      setLoadingReadiness(false);
    };

    checkReadiness();
  }, [selectedSession, selectedTerm, classes]);

  const handlePublish = async () => {
    if (!selectedSession || !selectedTerm) return;
    setPublishing(true);
    try {
      const publishFn = httpsCallable<PublishReportCardsData, PublishReportCardsResult>(
        functions, "publishReportCards"
      );
      const result = await publishFn({ sessionId: selectedSession, termId: selectedTerm, schoolId });
      addToast("success", `Published ${result.data.published} report cards (${result.data.skipped} skipped)`);
      if (result.data.errors.length > 0) {
        console.error("Publish errors:", result.data.errors);
        addToast("error", `${result.data.errors.length} errors occurred — check console`);
      }
    } catch (err) {
      addToast("error", "Publish failed: " + (err as Error).message);
    }
    setPublishing(false);
  };

  const handlePreview = async (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls?.students) return;
    const firstUid = Object.keys(cls.students)[0];
    if (!firstUid) return;
    const snap = await get(ref(db, `reportCards/${selectedSession}/${selectedTerm}/${firstUid}`));
    if (snap.exists()) {
      setPreviewCard(snap.val() as ReportCard);
    } else {
      addToast("error", "No published report card found. Publish first.");
    }
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById("report-card-content");
    if (!element) return;
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    pdf.save(`report-card-${previewCard?.studentName || "student"}.pdf`);
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
        <select className="input" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
          <option value="">Select Session</option>
          {sessionKeys.map((k) => (
            <option key={k} value={k}>{sessions[k]!.label}</option>
          ))}
        </select>
        <select className="input" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
          <option value="">Select Term</option>
          {termKeys.map((k) => (
            <option key={k} value={k}>{currentSession!.terms[k]!.label}</option>
          ))}
        </select>
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
                      ) : allReady ? (
                        <span style={{ color: "#2ecc71" }}>Ready</span>
                      ) : (
                        <span style={{ color: "#e67e22" }}>Incomplete</span>
                      )}
                    </td>
                    <td style={{ padding: 10, textAlign: "center" }}>
                      {r.published && (
                        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => handlePreview(r.classId)}>
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
```

- [ ] **Step 2: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/admin/AdminReportCards.tsx
git commit -m "feat: add admin report cards dashboard with readiness tracking and bulk publish

Shows per-class readiness (grades/comments completion), bulk publish
button, report card preview modal with PDF download."
```

---

## Task 9: Add Term Selector & Trend Chart to Parent Dashboard

**Files:**
- Modify: `src/ParentDashboard.tsx`

- [ ] **Step 1: Add new imports and state**

Add to imports:

```typescript
import type { AcademicConfig, ReportCard } from "./types";
import ReportCardView from "./ReportCardView";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
```

Add state after existing state declarations:

```typescript
const [academicConfig, setAcademicConfig] = useState<AcademicConfig | null>(null);
const [selectedSession, setSelectedSession] = useState("");
const [selectedTerm, setSelectedTerm] = useState("");
const [reportCards, setReportCards] = useState<ReportCard[]>([]);
const [activeReportCard, setActiveReportCard] = useState<ReportCard | null>(null);
```

- [ ] **Step 2: Add useEffect to load academic config**

```typescript
useEffect(() => {
  const configRef = ref(db, "academicConfig/default");
  const unsub = onValue(configRef, (snap) => {
    if (snap.exists()) {
      const c = snap.val() as AcademicConfig;
      setAcademicConfig(c);
      if (!selectedSession && c.currentSession) {
        setSelectedSession(c.currentSession);
        const session = c.sessions?.[c.currentSession];
        if (session?.activeTerm) setSelectedTerm(session.activeTerm);
      }
    }
  });
  return () => unsub();
}, []);
```

- [ ] **Step 3: Add useEffect to load report cards for trend**

```typescript
useEffect(() => {
  if (!activeChildUid || !selectedSession || !academicConfig) return;
  const session = academicConfig.sessions?.[selectedSession];
  if (!session) return;

  const termKeys = Object.keys(session.terms);
  Promise.all(
    termKeys.map(async (tk) => {
      const snap = await get(ref(db, `reportCards/${selectedSession}/${tk}/${activeChildUid}`));
      return snap.exists() ? (snap.val() as ReportCard) : null;
    })
  ).then((cards) => {
    setReportCards(cards.filter((c): c is ReportCard => c !== null));
  });
}, [activeChildUid, selectedSession, academicConfig]);
```

- [ ] **Step 4: Add PDF download handler**

```typescript
const handleDownloadPdf = async () => {
  const element = document.getElementById("report-card-content");
  if (!element) return;
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
```

- [ ] **Step 5: Add session/term selector and trend chart to JSX**

Add this after the child switcher, before the existing grades content in the grades tab:

```typescript
{/* Session/Term Selector */}
{academicConfig && (() => {
  const sessions = academicConfig.sessions || {};
  const sessionKeys = Object.keys(sessions);
  const currentSession = sessions[selectedSession];
  const termKeys = currentSession ? Object.keys(currentSession.terms) : [];

  return (
    <div className="form-row" style={{ marginBottom: 16 }}>
      <select className="input" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
        {sessionKeys.map((k) => (
          <option key={k} value={k}>{sessions[k]!.label}</option>
        ))}
      </select>
      <select className="input" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
        {termKeys.map((k) => (
          <option key={k} value={k}>{currentSession!.terms[k]!.label}</option>
        ))}
      </select>
    </div>
  );
})()}

{/* Trend Chart */}
{reportCards.length > 0 && (
  <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
    <strong>Academic Trend</strong>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 12, padding: "0 20px" }}>
      {(() => {
        const session = academicConfig?.sessions?.[selectedSession];
        if (!session) return null;
        const termKeys = Object.keys(session.terms);
        return termKeys.map((tk) => {
          const card = reportCards.find((c) => c.termId === tk);
          const avg = card?.overallAverage ?? 0;
          const maxAvg = Math.max(...reportCards.map((c) => c.overallAverage), 100);
          const height = avg > 0 ? (avg / maxAvg) * 100 : 0;
          const term = session.terms[tk]!;
          return (
            <div key={tk} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div
                style={{
                  background: card ? "#1a365d" : "#ddd",
                  width: "100%",
                  borderRadius: "4px 4px 0 0",
                  height: card ? height : 20,
                  minHeight: 4,
                  opacity: card ? 1 : 0.3,
                  border: card ? "none" : "1px dashed #ccc",
                }}
              />
              <span style={{ fontSize: 10, marginTop: 4, color: "#666" }}>{term.label.split(" ")[0]}</span>
              <span style={{ fontSize: 11, fontWeight: "bold" }}>{card ? `${avg}%` : "—"}</span>
            </div>
          );
        });
      })()}
    </div>
    {reportCards.length >= 2 && (() => {
      const sorted = [...reportCards].sort((a, b) => {
        const termKeys = Object.keys(academicConfig?.sessions?.[selectedSession]?.terms || {});
        return termKeys.indexOf(a.termId) - termKeys.indexOf(b.termId);
      });
      const latest = sorted[sorted.length - 1]!;
      const previous = sorted[sorted.length - 2]!;
      const change = latest.overallAverage - previous.overallAverage;
      return (
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: change >= 0 ? "#2ecc71" : "#e74c3c" }}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% {change >= 0 ? "improvement" : "decline"} from last term
        </div>
      );
    })()}
  </div>
)}

{/* Report Card View/Download */}
{reportCards.some((c) => c.termId === selectedTerm) && (
  <div className="form-row" style={{ marginBottom: 16 }}>
    <button
      className="btn btn-primary"
      onClick={() => setActiveReportCard(reportCards.find((c) => c.termId === selectedTerm) || null)}
    >
      View Report Card
    </button>
  </div>
)}
```

- [ ] **Step 6: Add report card modal at the end of the component JSX (before closing div)**

```typescript
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
```

- [ ] **Step 7: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/ParentDashboard.tsx
git commit -m "feat: add term selector, trend chart, and report card view to parent dashboard

Parents can filter by session/term, see academic trend bar chart,
view published report cards in-app, and download as PDF."
```

---

## Task 10: Add Term Selector & Trend to Student Dashboard

**Files:**
- Modify: `src/StudentDashboard.tsx`

- [ ] **Step 1: Add the same academic features to StudentDashboard**

This follows the exact same pattern as ParentDashboard (Task 9) but adapted for the student view. Read `src/StudentDashboard.tsx` first to understand the current structure, then add:

1. Import `AcademicConfig`, `ReportCard`, `ReportCardView`, `html2canvas`, `jsPDF`
2. Add state: `academicConfig`, `selectedSession`, `selectedTerm`, `reportCards`, `activeReportCard`
3. Add useEffect to load `academicConfig/default`
4. Add useEffect to load report cards for the student's own UID: `reportCards/${selectedSession}/${tk}/${user.uid}`
5. Add `handleDownloadPdf` (same as ParentDashboard)
6. Add session/term selector, trend chart, and report card view/download button to JSX
7. Add report card modal

The key difference from ParentDashboard: use `user.uid` directly instead of `activeChildUid`.

- [ ] **Step 2: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/StudentDashboard.tsx
git commit -m "feat: add term selector, trend chart, and report card view to student dashboard

Students can filter grades by term, see their academic trend,
view their published report cards, and download as PDF."
```

---

## Task 11: Final Build & Deploy

**Files:**
- Verify all files

- [ ] **Step 1: Run typecheck**

```bash
cd C:\Users\shiva\Code\school-portal && npm run typecheck
```

Fix any type errors.

- [ ] **Step 2: Run full build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build && cd functions && npm run build
```

Both must pass.

- [ ] **Step 3: Deploy**

```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions,database,hosting
```

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final fixes for report cards and trend tracking feature"
```
