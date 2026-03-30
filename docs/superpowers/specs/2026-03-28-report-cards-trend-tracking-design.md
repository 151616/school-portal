# Report Card Generation & Academic Trend Tracking — Design Spec

## Goal

Add term-based academic structure, report card generation with bulk publish, and academic trend tracking to KGrades. Report cards follow the full traditional Nigerian format: subject breakdown with CA/Exam split, class position/ranking, attendance summary, teacher comment, principal comment, and school branding.

## Decisions

- **Term structure:** Configurable per school (2-term or 3-term)
- **Report card contents:** Full traditional Nigerian format (all elements)
- **Delivery:** Both in-app view and downloadable PDF (client-side generation)
- **Trend tracking:** Current session by default, expandable to full history
- **Publish flow:** Admin bulk-publishes per term for the whole school
- **Architecture:** Approach B+C — add `termId` to assignments for live filtering, snapshot into immutable `reportCards` collection on publish

## Data Model

### New Paths

#### `academicConfig/{schoolId}`

Stores per-school term structure and academic calendar.

```typescript
interface AcademicConfig {
  termStructure: string[];  // e.g. ["1st Term", "2nd Term", "3rd Term"]
  sessions: Record<string, AcademicSession>;
  currentSession: string;   // e.g. "2025-2026"
}

interface AcademicSession {
  label: string;            // e.g. "2025/2026"
  terms: Record<string, Term>;
  activeTerm: string;       // e.g. "term1"
}

interface Term {
  label: string;            // e.g. "1st Term"
  startDate: string;        // ISO date "2025-09-08"
  endDate: string;          // ISO date "2025-12-13"
}
```

#### `reportCards/{sessionId}/{termId}/{studentUid}`

Immutable snapshots created on admin bulk publish. Once written, never modified.

```typescript
interface ReportCard {
  studentName: string;
  studentId: string;
  className: string;
  classId: string;
  session: string;          // display label "2025/2026"
  term: string;             // display label "2nd Term"
  sessionId: string;
  termId: string;
  schoolId: string;
  publishedAt: number;
  publishedBy: string;      // admin UID

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
  nextTermResumes: string;  // ISO date or display string
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
```

#### `reportComments/{sessionId}/{termId}/{studentUid}`

Pre-publish comments entered by teachers and admin/principal.

```typescript
interface ReportComments {
  teacherComment?: string;
  principalComment?: string;
}
```

### Modified Paths

#### `grades/{studentUid}/{classId}/assignments/{assignmentId}`

Two new fields added to the existing `Assignment` interface:

```typescript
// Added to existing Assignment type
termId: string;       // e.g. "term2"
sessionId: string;    // e.g. "2025-2026"
```

Existing assignments without these fields are treated as "unassigned" — they still display but won't be included in report card generation. A backfill function can tag them if needed.

### Security Rules

```
academicConfig:
  - read: any authenticated user
  - write: admin only

reportCards:
  - read: admin, or student (own UID), or parent (linked child)
  - write: none (written by Cloud Function with admin SDK)

reportComments:
  - read: admin, teacher (own class students)
  - write: admin (principalComment), teacher (teacherComment for own class students)
```

## Cloud Functions

### `publishReportCards` (callable, admin-only)

**Request:** `{ sessionId: string, termId: string, schoolId: string }`

**Response:** `{ success: boolean, published: number, skipped: number, errors: string[] }`

**Logic:**

1. Verify caller has admin claim
2. Load academic config to get term date range and labels
3. Load all classes for the school
4. For each class, for each student:
   a. Pull all assignments matching `termId` + `sessionId`
   b. Separate into CA and Exam assignments per class (subject)
   c. Compute: `caScore` (sum of scores), `caMax` (sum of maxScores), same for exam
   d. Compute `total = caScore + examScore`, `totalMax = caMax + examMax`
   e. Compute percentage and letter grade (A: 70+, B: 60-69, C: 50-59, D: 45-49, E: 40-44, F: <40 — configurable later)
   f. Pull attendance records within term date range, count present/total
   g. Pull teacher comment and principal comment from `reportComments`
5. Rank students within each class by overall average
6. Write each student's `ReportCard` to `reportCards/{sessionId}/{termId}/{studentUid}`
7. Send notifications to linked parents (in-app + email if configured)
8. Return count of published/skipped/errors

### `backfillAssignmentTerms` (callable, admin-only)

For existing assignments that lack `termId`/`sessionId`. Uses the assignment's `updatedAt` timestamp and the term date ranges to infer which term it belongs to.

**Request:** `{ sessionId: string, schoolId: string }`

**Response:** `{ success: boolean, updated: number, unmatched: number }`

## Frontend Changes

### Type Definitions (`src/types/firebase.ts`)

Add: `AcademicConfig`, `AcademicSession`, `Term`, `ReportCard`, `ReportCardSubject`, `ReportComments`.

Modify `Assignment`: add optional `termId?: string` and `sessionId?: string`.

### Admin Dashboard

**New tab: "Academic Calendar"** (`src/admin/AdminCalendar.tsx`)
- Create/edit sessions with term date ranges
- Set active term
- Choose term structure (2 or 3 terms)

**New tab: "Report Cards"** (`src/admin/AdminReportCards.tsx`)
- Session + term selectors
- Readiness table: per-class, shows grades completion count and comments completion count
- "Publish All Ready" button — calls `publishReportCards`
- "Preview" — shows sample report card for one student
- "Download All as ZIP" — client-side, generates PDFs for all students in bulk
- Principal comment entry per student (or delegate to a form)

### Teacher Dashboard (`src/TeacherDashboard.tsx`)

- Active term badge displayed near class selector
- New assignments auto-tagged with active `termId` + `sessionId` from `academicConfig`
- New "Report Comments" section: per-student text input for teacher remarks, saved to `reportComments/{sessionId}/{termId}/{studentUid}/teacherComment`

### Parent Dashboard (`src/ParentDashboard.tsx`)

- Session + term selector added to grades tab
- Grades filtered by selected term
- **Trend chart:** bar chart showing `overallAverage` from each published `reportCard` across terms. Default: current session. "View all sessions" expands to full history.
- "View Report Card" button — renders published report card in-app
- "Download PDF" button — client-side PDF generation from the report card view

### Student Dashboard (`src/StudentDashboard.tsx`)

- Same term selector and trend chart as parent dashboard
- Can view own published report cards

### Report Card View Component (`src/ReportCardView.tsx`)

Shared component used by parent, student, and admin dashboards. Renders a `ReportCard` object as a formatted document:

- School name/logo header area
- Student info block (name, ID, class, session, term)
- Subject table: Subject | CA | Exam | Total | Grade | Remark
- Summary row: overall average, class position (Xth out of Y)
- Attendance: X days present out of Y
- Teacher's comment
- Principal's comment
- Next term resumes date

### PDF Generation

Client-side using `jsPDF` + `html2canvas` (or `react-pdf` if cleaner). The `ReportCardView` component renders to a hidden div, then gets captured to PDF. No server cost.

**Dependency:** `npm install jspdf html2canvas`

## Trend Tracking

No separate data collection needed. Trend data is derived from published report cards:

1. Query `reportCards/{sessionId}/*/studentUid` for each term in the session
2. Extract `overallAverage` from each
3. Plot as bar chart (or line chart) with term labels on x-axis
4. Show % change between terms
5. "View all sessions" reads across multiple `sessionId` paths

For subject-level trends, drill into `subjects` within each report card to show per-subject performance over time.

## Migration Path

1. Add `academicConfig` — admin creates first session and terms
2. Add `termId`/`sessionId` to grade entry — teacher dashboard auto-tags new assignments
3. Run `backfillAssignmentTerms` for existing data
4. Add report comments UI for teachers
5. Build publish pipeline and report card view
6. Add trend charts to parent/student dashboards
7. Add PDF download

Existing data continues to work throughout — assignments without `termId` display normally, they just can't be included in report cards until backfilled.
