# TypeScript Migration Design

## Goal

Incrementally migrate the school-portal codebase from JavaScript to strict TypeScript, establishing shared type definitions for the Firebase data model, converting all frontend components and Cloud Functions, and splitting the oversized AdminDashboard into focused modules.

## Motivation

- A new team member is joining and needs self-documenting code
- The app serves thousands of students/teachers — runtime type bugs are expensive
- Firebase RTDB is schemaless, so the data contract between Cloud Functions and React components is entirely implicit today
- TypeScript catches field name typos, missing properties, and wrong argument shapes at build time

## Constraints

- **Incremental** — existing JS continues to work throughout. No big-bang rewrite.
- **Strict mode** — `strict: true`, `noUncheckedIndexedAccess: true`, no implicit any.
- **Vite handles mixed JS/TS** natively, so each file can be converted independently.
- **No feature work blocked** — the new team member can write TS from day one, even before migration completes.

---

## Architecture

### Shared Type Definitions

All Firebase data shapes live in `src/types/firebase.ts`. Every component and Cloud Function imports from here. This is the single source of truth.

```typescript
// ── Roles ──
export type UserRole = "student" | "teacher" | "admin" | "parent";

// ── Users/{uid} ──
export interface User {
  email: string;
  role: UserRole;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
  parentCode?: string;
  createdAt: number;
  schoolId?: string;
}

// ── grades/{studentUid}/{classId}/assignments/{assignmentId} ──
export type AssignmentType = "ca" | "exam";

export interface Assignment {
  name: string;
  score: number;
  maxScore: number;
  rubric?: string;
  type?: AssignmentType;
  teacherUid: string;
  updatedAt: number;
}

// ── classes/{classId} ──
export interface ClassStudent {
  uid: string;
  email: string;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
}

export interface SchoolClass {
  name: string;
  teacherUid: string;
  students?: Record<string, ClassStudent>;
  createdAt: number;
  schoolId?: string;
}

// ── attendance/{classId}/{date}/{studentUid} ──
export type AttendanceStatus = "present" | "tardy" | "absent" | "excused";

// ── invites/{inviteId} ──
export interface Invite {
  email: string;
  role: UserRole;
  studentId: string;
  firstName?: string;
  lastInitial?: string;
  createdAt: number;
  used: boolean;
  usedBy?: string;
  usedAt?: number;
  createdBy: string;
  schoolId?: string;
}

// ── notifications/{uid}/{notifId} ──
export type NotificationType = "grade" | "average" | "attendance";

export interface Notification {
  type?: NotificationType;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  classId?: string;
  assignmentId?: string;
}

// ── threads/{threadId} ──
export interface Thread {
  userA: string;
  userB: string;
  roleA: UserRole;
  roleB: UserRole;
  updatedAt: number;
  lastMessage?: string;
  lastSender?: string;
  readBy?: Record<string, number>;
}

// ── messages/{threadId}/{messageId} ──
export interface Message {
  from: string;
  text: string;
  createdAt: number;
}

// ── parentCodes/{code} ──
export interface ParentCode {
  studentUid: string;
  studentEmail: string;
  studentName: string;
  createdAt: number;
}

// ── schoolSettings/{schoolId} ──
export interface SchoolSettings {
  caWeight: number;
  examWeight: number;
  updatedAt?: number;
}

// ── teacherTemplates/{uid}/{templateId} ──
export interface TeacherTemplate {
  name: string;
  maxScore: number;
  rubric?: string;
  createdAt: number;
}

// ── auditLogs/{logId} ──
export interface AuditLog {
  action: string;
  createdAt: number;
  actorUid: string;
  actorEmail: string;
  [key: string]: unknown;
}
```

A barrel file `src/types/index.ts` re-exports everything.

### Cloud Function Callable Types

Typed request/response shapes for each callable:

```typescript
// ── createInvite ──
export interface CreateInviteData {
  email: string;
  role: UserRole;
  studentId?: string;
  firstName?: string;
  lastInitial?: string;
  schoolId?: string;
}

export interface CreateInviteResult {
  success: boolean;
  inviteId: string;
  email: string;
  role: UserRole;
  studentId: string;
}

// ── assignRoleFromInvite ──
export interface AssignRoleData {
  inviteId: string;
  firstName?: string;
  lastInitial?: string;
}

export interface AssignRoleResult {
  success: boolean;
  role: UserRole;
}

// ── claimParentCode ──
export interface ClaimParentCodeData {
  code: string;
  firstName?: string;
  lastInitial?: string;
}

export interface ClaimParentCodeResult {
  success: boolean;
  studentName: string;
  studentId: string;
}

// ── linkAdditionalChild ──
export interface LinkChildData {
  code: string;
}

export interface LinkChildResult {
  success: boolean;
  studentName: string;
  studentId: string;
}

// ── deleteUserByAdmin ──
export interface DeleteUserData {
  uid: string;
}

// ── backfillParentCodes ──
export interface BackfillResult {
  success: boolean;
  generated: number;
  skipped: number;
}
```

---

## Migration Order

Each phase produces a working, deployable app. No phase depends on later phases.

### Phase 1: Tooling + Shared Types

Install TypeScript and type packages. Create `tsconfig.json` (frontend, strict), `functions/tsconfig.json` (Cloud Functions, strict). Create `src/types/firebase.ts` and `src/types/callable.ts` with all type definitions. Create barrel `src/types/index.ts`.

Files created:
- `tsconfig.json`
- `functions/tsconfig.json`
- `src/types/firebase.ts`
- `src/types/callable.ts`
- `src/types/index.ts`

### Phase 2: Core Infrastructure

Convert the foundation files that everything imports from:
- `src/firebase.js` → `src/firebase.ts` (typed db, auth, functions exports)
- `src/toastService.js` → `src/toastService.ts`
- `src/main.jsx` → `src/main.tsx`
- `src/icons.jsx` → `src/icons.tsx`
- Update `index.html` script src if it references main.jsx

### Phase 3: Small Components

Convert simple, self-contained components:
- `src/ConfirmModal.jsx` → `src/ConfirmModal.tsx`
- `src/AddChildModal.jsx` → `src/AddChildModal.tsx`
- `src/Settings.jsx` → `src/Settings.tsx`
- `src/PrivacyPolicy.jsx` → `src/PrivacyPolicy.tsx`
- `src/Toasts.jsx` → `src/Toasts.tsx`
- `src/NotificationsMenu.jsx` → `src/NotificationsMenu.tsx`

### Phase 4: Cloud Functions

Convert `functions/index.js` → `functions/index.ts`. Add typed callable payloads. Update `functions/package.json` build script to compile TS before deploy. This is the highest-risk code (writes to production DB), so typing it is high value.

### Phase 5: Auth Flows

Convert auth-related pages:
- `src/Login.jsx` → `src/Login.tsx`
- `src/Signup.jsx` → `src/Signup.tsx`
- `src/ParentSignup.jsx` → `src/ParentSignup.tsx`

### Phase 6: Dashboards

Convert dashboards:
- `src/StudentDashboard.jsx` → `src/StudentDashboard.tsx`
- `src/ParentDashboard.jsx` → `src/ParentDashboard.tsx`
- `src/TeacherDashboard.jsx` → `src/TeacherDashboard.tsx`
- `src/AppHeader.jsx` → `src/AppHeader.tsx`
- `src/MessagingPanel.jsx` → `src/MessagingPanel.tsx`
- `src/App.jsx` → `src/App.tsx`

### Phase 7: AdminDashboard Split + Convert

The AdminDashboard is 2,700+ lines. Convert and split into focused modules:

- `src/AdminDashboard.tsx` — main shell, tab navigation, shared state
- `src/admin/AdminUsers.tsx` — user invite, list, delete, CSV import/export
- `src/admin/AdminClasses.tsx` — class create, roster management, enrollment (single, bulk, multi)
- `src/admin/AdminSettings.tsx` — school settings (CA/Exam weights, parent code backfill)
- `src/admin/AdminDiagnostics.tsx` — diagnostics panel

Each sub-component receives typed props from the parent. Shared state (users, classes, invites) stays in AdminDashboard and is passed down.

---

## TypeScript Configuration

### Frontend (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "allowJs": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@/types/*": ["src/types/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Key: `allowJs: true` means unconverted JS files keep working.

### Cloud Functions (`functions/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "./lib",
    "rootDir": ".",
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["index.ts", "../src/types/**/*"],
  "exclude": ["node_modules"]
}
```

Functions compile to `lib/` and `package.json` `main` points to `lib/index.js`. The `include` pulls in shared types from `src/types/`.

---

## Testing Strategy

- **Build verification** after each file conversion: `npm run build` must succeed with no TS errors
- **No runtime behavior changes** — migration is purely additive type annotations, not logic changes
- **Cloud Functions**: deploy to emulator after conversion, test each callable with real payloads
- The app has no test suite today, so we rely on build-time type checking + manual verification

## Error Handling

No changes to error handling logic. TypeScript narrows error types but we keep the existing try/catch patterns. Firebase SDK errors remain typed as `unknown` and get narrowed with type guards where needed.

## What This Does NOT Include

- Adding a test framework (separate effort)
- Refactoring business logic
- Changing any feature behavior
- Modifying database rules or Firebase config
- Adding new dependencies beyond TypeScript tooling
