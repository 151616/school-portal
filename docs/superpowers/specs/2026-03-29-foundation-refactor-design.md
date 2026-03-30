# Foundation-First Refactor — Design Spec

**Date:** 2026-03-29
**Approach:** B — Foundation-First (establish shared infrastructure, then decompose large files)
**Scope:** Incremental, starting with worst offenders, aggressive refactoring with full-scale testing afterwards

---

## 1. Goals

- **Easier to find things** — files have one clear responsibility, predictable locations
- **Easier to add features** — shared hooks/utils eliminate copy-paste, new code follows established patterns
- **Easier to onboard** — a new developer can navigate the structure and understand boundaries
- **Future-proof** — structure supports a later transition to domain-driven organization (Approach C) at 20-30K+ lines

---

## 2. New Directory Structure

### Frontend (`src/`)

```
src/
  components/                    ← shared, reusable UI components
    ReportCardTrend.tsx
    AutocompleteInput.tsx
    ConfirmModal.tsx              (moved from src/)
    Toasts.tsx                    (moved from src/)
  hooks/                         ← shared custom React hooks
    useAcademicConfig.ts
    useReportCards.ts
    useAttendanceSummary.ts
    useAutocomplete.ts
  utils/                         ← pure functions, no React dependencies
    dateUtils.ts
    csvUtils.ts
    gradeUtils.ts
    formatters.ts
    roleUtils.ts
    auditUtils.ts
  admin/                         ← (existing directory, expanded)
    AdminClasses/                ← folder replaces single 1,898-line file
      ClassCreation.tsx
      EnrollmentManager.tsx
      RosterManager.tsx
      AttendanceSummary.tsx
      index.tsx
    AdminUsers.tsx
    AdminReportCards.tsx
    AdminCalendar.tsx
    AdminDiagnostics.tsx
    AdminSettings.tsx
  AdminDashboard.tsx             ← (stays, already 172 lines)
  TeacherDashboard.tsx           ← slimmed via shared hooks/utils
  ParentDashboard.tsx            ← slimmed via shared hooks/utils + components
  StudentDashboard.tsx           ← slimmed via shared hooks/utils + components
  MessagingPanel.tsx             ← slimmed via shared utils
  ReportCardView.tsx
  App.tsx
  Login.tsx
  Signup.tsx
  ParentSignup.tsx
  Settings.tsx
  AppHeader.tsx
  AddChildModal.tsx
  NotificationsMenu.tsx
  PrivacyPolicy.tsx
  icons.tsx
  firebase.ts
  toastService.ts
  main.tsx
  vite-env.d.ts
  types/                         ← (stays as-is, already well organized)
    index.ts
    firebase.ts
    callable.ts
    academic.ts
```

### Backend (`functions/`)

```
functions/
  index.ts                       ← re-exports only, no logic
  lib/
    auth.ts                      ← createInvite, assignRoleFromInvite, invite validation trigger
    parents.ts                   ← claimParentCode, linkAdditionalChild, backfillParentCodes, auto-generate trigger
    grades.ts                    ← onGradeUpdate notification trigger
    attendance.ts                ← onAttendanceUpdate notification trigger
    reportCards.ts               ← publishReportCards callable
    users.ts                     ← deleteUserByAdmin callable
    email.ts                     ← nodemailer setup, sendNotificationEmail, HTML templates
    validation.ts                ← normalizeEmail, regex patterns, generateUniqueStudentId, generateParentCode
```

---

## 3. Shared Utils — Detailed Extractions

### `utils/dateUtils.ts`

| Function | Currently in | Notes |
|----------|-------------|-------|
| `toISODate(date)` | AdminClasses, TeacherDashboard | Identical implementations |
| `getRecentDates(n)` | AdminClasses, TeacherDashboard | Identical implementations |
| `formatRelativeTime(ts)` | MessagingPanel, AdminUsers | Slightly different — unify into one |

### `utils/csvUtils.ts`

| Function | Currently in | Notes |
|----------|-------------|-------|
| `parseCSV(text)` | AdminClasses, AdminUsers | Verbatim duplicate |
| `parseCSVLine(line)` | AdminClasses, AdminUsers | Verbatim duplicate |
| `escapeCSV(value)` | AdminClasses, AdminUsers | Verbatim duplicate |
| `downloadCSV(filename, headers, rows)` | AdminClasses, AdminUsers | Verbatim duplicate |

### `utils/gradeUtils.ts`

| Function | Currently in | Notes |
|----------|-------------|-------|
| `letterGrade(pct)` | ParentDashboard, StudentDashboard, functions/index.ts | 3 copies — unify. Backend keeps its own copy since it can't import from src/ |
| `calculateWeightedAverage(grades, caWeight, examWeight)` | ParentDashboard, StudentDashboard, TeacherDashboard | CA/Exam weighting logic repeated 3x |
| `calculateClassAverage(grades)` | ParentDashboard, StudentDashboard | Overall average computation |

### `utils/formatters.ts`

| Function | Currently in | Notes |
|----------|-------------|-------|
| `formatStudentLabel(user)` | AdminClasses | Used by autocomplete inputs |
| `formatTeacherLabel(user)` | AdminClasses | Used by autocomplete inputs |
| `formatClassLabel(cls)` | AdminClasses | Used by autocomplete inputs |
| `renderName(user)` | StudentDashboard | Slight variant — unify |

### `utils/roleUtils.ts`

| Function | Currently in | Notes |
|----------|-------------|-------|
| `roleTargets` (lookup table) | MessagingPanel | Role → allowed target roles |
| `allowedPairs` (Set) | MessagingPanel | Valid role pair combinations |
| `isAllowedRolePair(a, b)` | MessagingPanel | Validates role combination |
| `normalizeRole(role)` | MessagingPanel | Lowercase/trim |

---

## 4. Shared Hooks — Detailed Extractions

### `hooks/useAcademicConfig.ts`
- **Subscribes to:** `academicConfig/default` via `onValue`
- **Returns:** `{ academicConfig, activeTerm, sessions, loading }`
- **Replaces duplication in:** TeacherDashboard, ParentDashboard, StudentDashboard

### `hooks/useReportCards.ts`
- **Two loading modes:**
  - Single session: loads report cards for each term in a session via `Promise.all`
  - All sessions: nested `flatMap` + `Promise.all` across all sessions/terms
- **Returns:** `{ reportCards, allSessionCards, loading }`
- **Replaces duplication in:** ParentDashboard, StudentDashboard

### `hooks/useAttendanceSummary.ts`
- **Fetches:** attendance for a class over N recent days
- **Aggregates:** present/absent/tardy/excused counts per student
- **Returns:** `{ summary, loading }`
- **Replaces duplication in:** AdminClasses, TeacherDashboard, ParentDashboard (variant)

### `hooks/useAutocomplete.ts`
- **Manages:** query string, filtered suggestions, selected item, clear/reset
- **Returns:** `{ query, setQuery, suggestions, selectedItem, select, clear }`
- **Replaces:** 6+ inline autocomplete patterns in AdminClasses, plus instances in AdminUsers

---

## 5. Shared Components — Detailed Extractions

### `components/ReportCardTrend.tsx`
- **What:** Trend chart + session/term selector + "show all sessions" toggle + subject drilldown
- **Props:** `reportCards`, `allSessionCards`, `academicConfig`, `onViewReportCard`
- **Replaces duplication in:** ParentDashboard, StudentDashboard (nearly identical rendering code)

### `components/AutocompleteInput.tsx`
- **What:** Generic searchable dropdown with suggestion list, keyboard navigation
- **Props:** `items`, `labelFn`, `filterFn`, `onSelect`, `placeholder`, `value`
- **Replaces:** 6+ inline autocomplete implementations in AdminClasses, plus similar patterns in AdminUsers

### `components/ConfirmModal.tsx`
- **Already exists** at `src/ConfirmModal.tsx` (24 lines) — move to `components/`

### `components/Toasts.tsx`
- **Already exists** at `src/Toasts.tsx` (43 lines) — move to `components/`

---

## 6. AdminClasses Decomposition

The 1,898-line `admin/AdminClasses.tsx` becomes a folder with focused sub-components:

### `admin/AdminClasses/index.tsx` (~100 lines)
- Receives `users` and `classes` props (same interface as today)
- Renders the four sub-components
- Manages which section is active/expanded
- Passes shared data (users, classes) down to children

### `admin/AdminClasses/ClassCreation.tsx` (~200 lines)
- Class creation form with teacher autocomplete (uses `AutocompleteInput`)
- CSV import for bulk class creation (uses `csvUtils`)
- Class deletion with confirmation
- Handles: `handleCreateClass`, `handleImportClassesCSV`, `handleDeleteClass`

### `admin/AdminClasses/EnrollmentManager.tsx` (~400 lines)
- Three enrollment modes toggled by a mode selector:
  - Single: one student → one class
  - Bulk: one student → many classes
  - Multi-student: many students → one class or teacher's classes
- Uses `AutocompleteInput` for all search inputs
- Handles: `handleEnrollStudent`, `handleBulkEnroll`, `handleMultiEnroll`

### `admin/AdminClasses/RosterManager.tsx` (~400 lines)
- Class roster display with search/filter
- Remove, move, bulk-remove, bulk-move operations
- Gradebook CSV export (uses `csvUtils`)
- Handles: `handleRemoveFromClass`, `handleMoveStudent`, `handleBulkRemove`, `handleBulkMove`, `handleExportGradebook`

### `admin/AdminClasses/AttendanceSummary.tsx` (~150 lines)
- 7-day attendance grid per class
- Uses `useAttendanceSummary` hook
- Uses `dateUtils` for date formatting

**State distribution:** Each sub-component owns only its relevant state variables. The 50+ state variables in the current file get distributed to their owning components. Shared data (users, classes) flows from `index.tsx` via props.

---

## 7. Dashboard Slimming

Dashboards don't need structural decomposition — they shrink by using shared infrastructure.

### TeacherDashboard.tsx (825 → ~450 lines)

| What changes | How |
|-------------|-----|
| Academic config loading | → `useAcademicConfig` hook |
| Attendance 7-day aggregation | → `useAttendanceSummary` hook |
| `toISODate`, `getRecentDates` | → `dateUtils` imports |
| Grade math (if any CA/Exam weighting) | → `gradeUtils` imports |
| **What stays (~450 lines)** | Grade entry, assignment templates, report comments — unique to teacher role |

### ParentDashboard.tsx (830 → ~350 lines)

| What changes | How |
|-------------|-----|
| Report card trend chart + session/term UI | → `ReportCardTrend` component |
| Report card loading (single + all sessions) | → `useReportCards` hook |
| Academic config loading | → `useAcademicConfig` hook |
| `letterGrade`, weighted average, class average | → `gradeUtils` imports |
| **What stays (~350 lines)** | Child management, class-specific grade display, attendance view |

### StudentDashboard.tsx (492 → ~200 lines)

| What changes | How |
|-------------|-----|
| Report card trend chart + session/term UI | → `ReportCardTrend` component |
| Report card loading (single + all sessions) | → `useReportCards` hook |
| Academic config loading | → `useAcademicConfig` hook |
| `getLetter`, grade calculations | → `gradeUtils` imports |
| **What stays (~200 lines)** | Profile display, parent code, expandable class cards |

### MessagingPanel.tsx (719 → ~500 lines)

| What changes | How |
|-------------|-----|
| Role access control (roleTargets, allowedPairs, etc.) | → `roleUtils` imports |
| `formatRelativeTime` | → `dateUtils` import |
| **What stays (~500 lines)** | Thread management, message display, contact search — cohesive messaging logic. Candidate for future splitting if messaging grows. |

### AdminUsers.tsx (882 → ~550 lines)

| What changes | How |
|-------------|-----|
| `parseCSV`, `parseCSVLine`, `escapeCSV`, `downloadCSV` | → `csvUtils` imports |
| `logAudit` | → `utils/auditUtils.ts` (new, wraps Firebase audit log writes) |
| Time formatting | → `dateUtils` import |
| **What stays (~550 lines)** | Invite creation, user management, user export, pending invites, audit log — admin-specific |

---

## 8. Backend Decomposition (`functions/`)

### `functions/index.ts` — Re-exports Only

```ts
// All logic lives in lib/. This file just re-exports for Firebase.
export { createInvite, assignRoleFromInvite } from './lib/auth';
export { claimParentCode, linkAdditionalChild, backfillParentCodes } from './lib/parents';
export { onGradeUpdate } from './lib/grades';
export { onAttendanceUpdate } from './lib/attendance';
export { publishReportCards } from './lib/reportCards';
export { deleteUserByAdmin } from './lib/users';
// Database triggers are registered in their respective modules
```

### `functions/lib/auth.ts`
- `createInvite` — httpsCallable, creates invite record
- `assignRoleFromInvite` — httpsCallable, assigns role from claimed invite
- `validateInviteOnCreate` — database trigger, validates invite fields on write
- Imports: `email.ts` for sending invite emails, `validation.ts` for normalizeEmail

### `functions/lib/parents.ts`
- `claimParentCode` — httpsCallable
- `linkAdditionalChild` — httpsCallable
- `backfillParentCodes` — httpsCallable
- `autoGenerateParentCode` — database trigger on student creation
- Imports: `validation.ts` for generateParentCode

### `functions/lib/grades.ts`
- `onGradeUpdate` — database trigger (`grades/{uid}/{classId}/{assignmentId}`)
- Looks up parent, sends notification email
- Imports: `email.ts` for sendNotificationEmail

### `functions/lib/attendance.ts`
- `onAttendanceUpdate` — database trigger (`attendance/{classId}/{date}/{uid}`)
- Sends absence notification to parent
- Imports: `email.ts` for sendNotificationEmail

### `functions/lib/reportCards.ts`
- `publishReportCards` — httpsCallable
- Complex ranking and subject aggregation logic
- Imports: `validation.ts` for getLetterGrade

### `functions/lib/users.ts`
- `deleteUserByAdmin` — httpsCallable
- Cascading cleanup across database paths

### `functions/lib/email.ts`
- Nodemailer setup and `getMailTransport()`
- `sendNotificationEmail(to, subject, html)`
- HTML email templates (grade notification, absence notification)

### `functions/lib/validation.ts`
- `normalizeEmail(email)`
- Email/student ID regex patterns
- `generateUniqueStudentId(db)`
- `hasStudentIdCollision(db, id)`
- `generateParentCode()`
- `getLetterGrade(pct)` — backend copy (can't import from src/)

---

## 9. Migration Strategy

**Order of operations (incremental, each step is independently deployable):**

1. **Extract `utils/`** — pure functions, zero risk, no component changes needed yet
2. **Extract `hooks/`** — shared Firebase patterns, update dashboards to use them
3. **Extract `components/`** — ReportCardTrend, AutocompleteInput, move ConfirmModal/Toasts
4. **Decompose AdminClasses** — split into folder with sub-components
5. **Slim dashboards** — wire up shared hooks/utils/components, delete inline duplicates
6. **Slim MessagingPanel + AdminUsers** — lighter touch, just import shared utils
7. **Decompose backend** — split functions/index.ts into lib/ modules
8. **Update imports** — ensure all import paths are correct, remove dead code
9. **Full-scale testing** — manual testing of all features across all roles

Each step can be committed and verified independently. If something breaks, the blast radius is limited to that step.

---

## 10. Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Largest file | 1,898 lines (AdminClasses) | ~400 lines (EnrollmentManager) |
| Files > 700 lines | 5 | 0 |
| Duplicated CSV utils | 2 copies | 1 |
| Duplicated grade math | 3 copies | 1 |
| Duplicated report card loading | 2 copies | 1 |
| Shared hooks | 0 | 4 |
| Shared utils | 0 | 5 modules |
| Backend files | 1 (1,407 lines) | 8 focused modules |

**Total line count stays roughly the same** — this is a reorganization, not a rewrite. Code moves, duplication is deleted, but no features change.
