# TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incrementally migrate the school-portal codebase from JavaScript to strict TypeScript with shared type definitions for the Firebase data model, and split the 2,800-line AdminDashboard into focused modules.

**Architecture:** Shared types in `src/types/` define every Firebase path's data shape. Frontend uses Vite's native TS support with `allowJs: true` so files convert one at a time. Cloud Functions compile TS → JS via a build step. AdminDashboard splits into `src/admin/` sub-components.

**Tech Stack:** TypeScript 5.x, React 19, Firebase SDK 12, Vite 7, Node 22 (Cloud Functions)

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `tsconfig.json` | Frontend TypeScript config (strict, allowJs) |
| `src/vite-env.d.ts` | Vite client type declarations + custom Window fields |
| `src/types/firebase.ts` | All Firebase RTDB data shape interfaces |
| `src/types/callable.ts` | Cloud Function callable request/response types |
| `src/types/index.ts` | Barrel re-export |
| `functions/tsconfig.json` | Cloud Functions TypeScript config |

### Renamed Files (each task converts JS→TS)
| From | To |
|---|---|
| `src/firebase.js` | `src/firebase.ts` |
| `src/toastService.js` | `src/toastService.ts` |
| `src/main.jsx` | `src/main.tsx` |
| `src/icons.jsx` | `src/icons.tsx` |
| `src/ConfirmModal.jsx` | `src/ConfirmModal.tsx` |
| `src/Toasts.jsx` | `src/Toasts.tsx` |
| `src/AddChildModal.jsx` | `src/AddChildModal.tsx` |
| `src/Settings.jsx` | `src/Settings.tsx` |
| `src/PrivacyPolicy.jsx` | `src/PrivacyPolicy.tsx` |
| `src/NotificationsMenu.jsx` | `src/NotificationsMenu.tsx` |
| `src/Login.jsx` | `src/Login.tsx` |
| `src/Signup.jsx` | `src/Signup.tsx` |
| `src/ParentSignup.jsx` | `src/ParentSignup.tsx` |
| `src/StudentDashboard.jsx` | `src/StudentDashboard.tsx` |
| `src/ParentDashboard.jsx` | `src/ParentDashboard.tsx` |
| `src/TeacherDashboard.jsx` | `src/TeacherDashboard.tsx` |
| `src/MessagingPanel.jsx` | `src/MessagingPanel.tsx` |
| `src/AppHeader.jsx` | `src/AppHeader.tsx` |
| `src/App.jsx` | `src/App.tsx` |
| `src/AdminDashboard.jsx` | `src/AdminDashboard.tsx` (+ split into `src/admin/`) |
| `functions/index.js` | `functions/index.ts` |

---

## Task 1: Install TypeScript & Create Config Files

**Files:**
- Create: `tsconfig.json`
- Create: `src/vite-env.d.ts`
- Modify: `package.json` (add typescript to devDependencies)

- [ ] **Step 1: Install TypeScript**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm install --save-dev typescript
```

Expected: `typescript` added to devDependencies in package.json.

- [ ] **Step 2: Create tsconfig.json**

Create `tsconfig.json` in the project root:

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
  "exclude": ["node_modules", "dist", "functions"]
}
```

- [ ] **Step 3: Create Vite environment declarations**

Create `src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_FIREBASE_EMULATORS: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR_HOST: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR_PORT: string;
  readonly VITE_FIREBASE_DATABASE_EMULATOR_HOST: string;
  readonly VITE_FIREBASE_DATABASE_EMULATOR_PORT: string;
  readonly VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST: string;
  readonly VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: string;
  readonly VITE_FIREBASE_FUNCTIONS_REGION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __KGRADES_FIREBASE_EMULATORS_CONNECTED__?: boolean;
}
```

- [ ] **Step 4: Verify build still works**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds (Vite ignores tsconfig for JS files but picks it up for any future TS files).

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json src/vite-env.d.ts package.json package-lock.json
git commit -m "chore: add TypeScript config with strict mode

allowJs: true for incremental migration. Vite env types declared.
noUncheckedIndexedAccess for safer Firebase data access."
```

---

## Task 2: Create Shared Type Definitions

**Files:**
- Create: `src/types/firebase.ts`
- Create: `src/types/callable.ts`
- Create: `src/types/index.ts`

- [ ] **Step 1: Create firebase types**

Create `src/types/firebase.ts`:

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

// ── classes/{classId}/students/{uid} ──
export interface ClassStudent {
  uid: string;
  email: string;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
}

// ── classes/{classId} ──
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

- [ ] **Step 2: Create callable types**

Create `src/types/callable.ts`:

```typescript
import type { UserRole } from "./firebase";

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

export interface DeleteUserResult {
  success: boolean;
}

// ── backfillParentCodes ──
export interface BackfillResult {
  success: boolean;
  generated: number;
  skipped: number;
}
```

- [ ] **Step 3: Create barrel index**

Create `src/types/index.ts`:

```typescript
export type * from "./firebase";
export type * from "./callable";
```

- [ ] **Step 4: Verify build**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds. Type files are just declarations — they don't affect the JS bundle.

- [ ] **Step 5: Commit**

```bash
git add src/types/
git commit -m "feat: add shared TypeScript type definitions for Firebase data model

Types for User, Assignment, SchoolClass, Attendance, Invite,
Notification, Thread, Message, ParentCode, SchoolSettings,
TeacherTemplate, AuditLog. Callable request/response types for
all Cloud Functions."
```

---

## Task 3: Convert Core Infrastructure Files

**Files:**
- Rename+convert: `src/firebase.js` → `src/firebase.ts`
- Rename+convert: `src/toastService.js` → `src/toastService.ts`
- Rename+convert: `src/main.jsx` → `src/main.tsx`
- Rename+convert: `src/icons.jsx` → `src/icons.tsx`
- Modify: `index.html` (update script src)

For each file: use `git mv` to rename, then add type annotations. The conversion pattern is:
1. `git mv old.jsx new.tsx` (preserves git history)
2. Add type annotations to function parameters, state, and return types
3. Remove `import React from "react"` (not needed with react-jsx)
4. Fix any type errors

- [ ] **Step 1: Convert firebase.js → firebase.ts**

```bash
cd C:\Users\shiva\Code\school-portal && git mv src/firebase.js src/firebase.ts
```

Edit `src/firebase.ts`:
- Add type to `parsePort`: `const parsePort = (value: string | undefined, fallback: number): number =>`
- Add type to `firebaseConfig`: `const firebaseConfig: Record<string, string> =`
- Change `window.__KGRADES_FIREBASE_EMULATORS_CONNECTED__` access to use the Window interface declared in `vite-env.d.ts` (it already works because of the declaration)

- [ ] **Step 2: Convert toastService.js → toastService.ts**

```bash
cd C:\Users\shiva\Code\school-portal && git mv src/toastService.js src/toastService.ts
```

Edit `src/toastService.ts`:

```typescript
export type ToastType = "success" | "error" | "info";

export const addToast = (type: ToastType, message: string, timeout: number = 4000): void => {
  window.dispatchEvent(new CustomEvent("toast", { detail: { type, message, timeout } }));
};
```

- [ ] **Step 3: Convert icons.jsx → icons.tsx**

```bash
cd C:\Users\shiva\Code\school-portal && git mv src/icons.jsx src/icons.tsx
```

Edit `src/icons.tsx`:
- Remove `import React from 'react';` (not needed with react-jsx)
- Add props type to each icon component. They all share the same pattern:

```typescript
interface IconProps {
  className?: string;
}
```

Update each icon's signature from `({ className = '' })` to `({ className = '' }: IconProps)`. There are icons: CopyIcon, DeleteIcon, LinkIcon, PlusIcon, CheckIcon, AlertIcon, MessageIcon, LogoutIcon, GearIcon. Update all of them.

- [ ] **Step 4: Convert main.jsx → main.tsx**

```bash
cd C:\Users\shiva\Code\school-portal && git mv src/main.jsx src/main.tsx
```

Edit `src/main.tsx`:
- Remove `.jsx` from the App import: `import App from './App'` (Vite resolves both .jsx and .tsx)
- Add non-null assertion to root element: `document.getElementById('root')!`

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 5: Update index.html**

Change the script src in `index.html` from:
```html
<script type="module" src="/src/main.jsx"></script>
```
to:
```html
<script type="module" src="/src/main.tsx"></script>
```

- [ ] **Step 6: Verify build**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds. Vite resolves the new file extensions.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: convert core infrastructure to TypeScript

firebase.ts, toastService.ts, icons.tsx, main.tsx.
Updated index.html script src."
```

---

## Task 4: Convert Small Components

**Files:**
- Rename+convert: `src/ConfirmModal.jsx` → `src/ConfirmModal.tsx`
- Rename+convert: `src/Toasts.jsx` → `src/Toasts.tsx`
- Rename+convert: `src/AddChildModal.jsx` → `src/AddChildModal.tsx`
- Rename+convert: `src/Settings.jsx` → `src/Settings.tsx`
- Rename+convert: `src/PrivacyPolicy.jsx` → `src/PrivacyPolicy.tsx`
- Rename+convert: `src/NotificationsMenu.jsx` → `src/NotificationsMenu.tsx`

For each file:
1. `git mv OldName.jsx NewName.tsx`
2. Remove `import React from "react"` if present (not needed with react-jsx)
3. Add typed props interface
4. Type all useState calls with explicit generics where the initial value doesn't infer correctly
5. Type event handlers

- [ ] **Step 1: Convert ConfirmModal**

```bash
git mv src/ConfirmModal.jsx src/ConfirmModal.tsx
```

Add props interface:
```typescript
interface ConfirmModalProps {
  open: boolean;
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmModal({ open, title = 'Confirm', description = '', onCancel, onConfirm }: ConfirmModalProps) {
```

- [ ] **Step 2: Convert Toasts**

```bash
git mv src/Toasts.jsx src/Toasts.tsx
```

Add toast type:
```typescript
import type { ToastType } from "./toastService";

interface Toast {
  id: number;
  type?: ToastType;
  message: string;
  timeout?: number;
}
```

Type the state: `useState<Toast[]>([])`. Type the event handler: `const handler = (e: Event) => {` and cast `(e as CustomEvent).detail`.

- [ ] **Step 3: Convert AddChildModal**

```bash
git mv src/AddChildModal.jsx src/AddChildModal.tsx
```

Add props interface:
```typescript
interface AddChildModalProps {
  onClose: () => void;
  onLinked?: () => void;
}
```

Type state: `useState<string>("")`, `useState<boolean>(false)`.

- [ ] **Step 4: Convert Settings**

```bash
git mv src/Settings.jsx src/Settings.tsx
```

Read the file first to understand its structure. Type all useState calls and event handlers. No props (it uses no props).

- [ ] **Step 5: Convert PrivacyPolicy**

```bash
git mv src/PrivacyPolicy.jsx src/PrivacyPolicy.tsx
```

This is a static component with no props or state. Just remove the React import if present.

- [ ] **Step 6: Convert NotificationsMenu**

```bash
git mv src/NotificationsMenu.jsx src/NotificationsMenu.tsx
```

Read the file first. Add props interface (it receives `currentUser`). Import `Notification` type from `./types` and use it for the notifications state. Type the Firebase `onValue` callback data.

- [ ] **Step 7: Verify build**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: convert small components to TypeScript

ConfirmModal, Toasts, AddChildModal, Settings, PrivacyPolicy,
NotificationsMenu — all with typed props and state."
```

---

## Task 5: Convert Cloud Functions

**Files:**
- Create: `functions/tsconfig.json`
- Rename+convert: `functions/index.js` → `functions/index.ts`
- Modify: `functions/package.json` (add typescript, update main and build script)

- [ ] **Step 1: Install TypeScript in functions**

```bash
cd C:\Users\shiva\Code\school-portal\functions && npm install --save-dev typescript @types/nodemailer
```

- [ ] **Step 2: Create functions/tsconfig.json**

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
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["index.ts"],
  "exclude": ["node_modules", "lib"]
}
```

- [ ] **Step 3: Update functions/package.json**

Add build script and update main entry:

```json
{
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "serve": "npm run build && firebase emulators:start --only functions",
    "deploy": "npm run build && firebase deploy --only functions"
  }
}
```

Also add to `devDependencies`: `"typescript": "^5.x"` (already installed in step 1).

- [ ] **Step 4: Rename and convert functions/index.js → functions/index.ts**

```bash
cd C:\Users\shiva\Code\school-portal && git mv functions/index.js functions/index.ts
```

Read the full file and add types throughout:

Key changes:
- `import * as functions from 'firebase-functions/v1';`
- `import * as admin from 'firebase-admin';`
- `import * as nodemailer from 'nodemailer';`
- Type `ALLOWED_ROLES` as `Set<string>`
- Type `normalizeEmail` as `(value: unknown): string =>`
- Type all `onCall` data parameters with the callable types from the spec (CreateInviteData, ClaimParentCodeData, etc.) — duplicate the type definitions locally in the functions file since functions can't import from `src/types` without a shared package setup. Use the same interface shapes.
- Type all database snapshot `.val()` returns with appropriate interfaces
- Type `hasStudentIdCollision` params: `(usersData: Record<string, {studentId?: string}>, invitesData: Record<string, {studentId?: string; used?: boolean}>, candidate: string): boolean`
- Type `generateUniqueStudentId` params
- Type all `async (data, context)` handlers with proper Firebase types: `data: { email: string; role: string; ... }` and `context: functions.https.CallableContext`
- Type `generateParentCode` return as `string`
- Type RTDB trigger handlers: `(snapshot: functions.database.DataSnapshot, context: functions.EventContext)` and `(change: functions.Change<functions.database.DataSnapshot>, context: functions.EventContext)`
- Use `_` prefix for intentionally unused parameters (e.g. `_data` in backfillParentCodes) to satisfy `noUnusedParameters`

- [ ] **Step 5: Build functions**

```bash
cd C:\Users\shiva\Code\school-portal\functions && npm run build
```

Expected: TypeScript compiles to `functions/lib/index.js` with no errors.

- [ ] **Step 6: Add lib/ to functions .gitignore**

Create or update `functions/.gitignore`:
```
lib/
node_modules/
```

- [ ] **Step 7: Update firebase.json predeploy**

In the root `firebase.json`, ensure the functions section has a predeploy build step. Find the `"functions"` key and add:

```json
"predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
```

- [ ] **Step 8: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build && cd functions && npm run build
```

Expected: Both frontend and functions build successfully.

- [ ] **Step 9: Commit**

```bash
cd C:\Users\shiva\Code\school-portal
git add -A
git commit -m "refactor: convert Cloud Functions to TypeScript

Strict mode, typed callable payloads, typed RTDB triggers.
Compiles to lib/ with predeploy build step."
```

---

## Task 6: Convert Auth Flow Components

**Files:**
- Rename+convert: `src/Login.jsx` → `src/Login.tsx`
- Rename+convert: `src/Signup.jsx` → `src/Signup.tsx`
- Rename+convert: `src/ParentSignup.jsx` → `src/ParentSignup.tsx`

For each file:
1. `git mv OldName.jsx NewName.tsx`
2. Read the file to understand state variables and Firebase calls
3. Remove `import React from "react"` if present
4. Type all useState with explicit generics
5. Type all event handlers (`React.ChangeEvent<HTMLInputElement>`, `React.KeyboardEvent`, etc.)
6. Type Firebase snapshot data with types from `src/types`
7. Type `httpsCallable` with generics: `httpsCallable<RequestType, ResponseType>(functions, "name")`

- [ ] **Step 1: Convert Login**

```bash
cd C:\Users\shiva\Code\school-portal && git mv src/Login.jsx src/Login.tsx
```

Read the file. Key typing needs:
- No props (Login takes no props)
- `useState<string>` for email, password
- `useState<boolean>` for loading states
- Event handlers: `(e: React.FormEvent)` or `(e: React.KeyboardEvent<HTMLInputElement>)`
- Firebase auth calls are already typed by the Firebase SDK

- [ ] **Step 2: Convert Signup**

```bash
git mv src/Signup.jsx src/Signup.tsx
```

Read the file. Key typing needs:
- No props (reads inviteId from URL params)
- Import `Invite` type from `./types`
- `useState<Invite | null>(null)` for the invite state
- Type the `httpsCallable` call for `assignRoleFromInvite`

- [ ] **Step 3: Convert ParentSignup**

```bash
git mv src/ParentSignup.jsx src/ParentSignup.tsx
```

Read the file. Key typing needs:
- No props
- `useState<string>` for all form fields
- `useState<boolean>` for submitting
- Type `httpsCallable` for `claimParentCode`

- [ ] **Step 4: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: convert auth flow components to TypeScript

Login, Signup, ParentSignup — typed state, event handlers,
and Firebase callable invocations."
```

---

## Task 7: Convert Dashboard Components

**Files:**
- Rename+convert: `src/StudentDashboard.jsx` → `src/StudentDashboard.tsx`
- Rename+convert: `src/ParentDashboard.jsx` → `src/ParentDashboard.tsx`
- Rename+convert: `src/TeacherDashboard.jsx` → `src/TeacherDashboard.tsx`

These are medium-complexity components (237–655 lines). Each receives a `user` prop from App.jsx.

- [ ] **Step 1: Convert StudentDashboard**

```bash
cd C:\Users\shiva\Code\school-portal && git mv src/StudentDashboard.jsx src/StudentDashboard.tsx
```

Read the file. Key typing needs:
- Props: `{ user: import("firebase/auth").User }`
- Import types: `User`, `Assignment` from `./types`
- `useState<User | null>(null)` for profile
- Type the grades state as `Record<string, { assignments?: Record<string, Assignment> }>`
- Type `parentCode` as `useState<string | null>(null)`

- [ ] **Step 2: Convert ParentDashboard**

```bash
git mv src/ParentDashboard.jsx src/ParentDashboard.tsx
```

Read the file. Key typing needs:
- Props: `{ user: import("firebase/auth").User }`
- Import types: `User`, `Assignment`, `SchoolClass`, `AttendanceStatus`, `SchoolSettings`
- Type all state: `children` as `string[]`, `childProfiles` as `Record<string, User>`, `grades` as `Record<string, { assignments?: Record<string, Assignment> }>`, `classes` as `Record<string, SchoolClass>`, etc.
- Type the `classGrades` useMemo return shape

- [ ] **Step 3: Convert TeacherDashboard**

```bash
git mv src/TeacherDashboard.jsx src/TeacherDashboard.tsx
```

Read the file (655 lines). Key typing needs:
- Props: `{ user: import("firebase/auth").User }`
- Import types: `SchoolClass`, `ClassStudent`, `Assignment`, `AttendanceStatus`, `TeacherTemplate`
- Type all useState calls — there are many (class selection, grade entry form, attendance, templates)
- Type the grade save payload with `Assignment` fields
- Type `assignmentType` as `useState<"" | "ca" | "exam">("")`

- [ ] **Step 4: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: convert dashboard components to TypeScript

StudentDashboard, ParentDashboard, TeacherDashboard — typed
props, state, Firebase data, and computed values."
```

---

## Task 8: Convert App Shell Components

**Files:**
- Rename+convert: `src/MessagingPanel.jsx` → `src/MessagingPanel.tsx`
- Rename+convert: `src/AppHeader.jsx` → `src/AppHeader.tsx`
- Rename+convert: `src/App.jsx` → `src/App.tsx`

- [ ] **Step 1: Convert MessagingPanel**

```bash
cd C:\Users\shiva\Code\school-portal && git mv src/MessagingPanel.jsx src/MessagingPanel.tsx
```

Read the file (675 lines). Key typing needs:
- Props: `{ currentUser: import("firebase/auth").User; currentRole: string }` (or use `UserRole` type)
- Import types: `UserRole`, `User`, `Thread`, `Message`
- Type `roleTargets` as `Record<UserRole, UserRole[]>`
- Type `allowedPairs` as `Set<string>`
- Type `threadIdFor` as `(a: string, b: string): string`
- Type `buildThreadRecord` params and return with `Thread` shape
- Type all useState calls for threads, messages, users

- [ ] **Step 2: Convert AppHeader**

```bash
git mv src/AppHeader.jsx src/AppHeader.tsx
```

Read the file. Key typing needs:
- Props interface:
```typescript
interface AppHeaderProps {
  currentUser: import("firebase/auth").User;
  currentRole: UserRole;
  onLogout: () => void;
}
```
- Import `UserRole` from `./types`

- [ ] **Step 3: Convert App**

```bash
git mv src/App.jsx src/App.tsx
```

Read the file. Key typing needs:
- Type `user` state: `useState<import("firebase/auth").User | null>(null)`
- Type `role` state: `useState<UserRole | null>(null)`
- Type the outlet context: `{ user: import("firebase/auth").User; role: UserRole }`
- Update lazy imports to use `.tsx` extensions (or remove extensions — Vite resolves both)

- [ ] **Step 4: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: convert App shell to TypeScript

MessagingPanel, AppHeader, App — typed props, routing context,
messaging thread types, and role-based navigation."
```

---

## Task 9: Split & Convert AdminDashboard

**Files:**
- Create: `src/admin/AdminUsers.tsx`
- Create: `src/admin/AdminClasses.tsx`
- Create: `src/admin/AdminSettings.tsx`
- Create: `src/admin/AdminDiagnostics.tsx`
- Rename+convert: `src/AdminDashboard.jsx` → `src/AdminDashboard.tsx`

This is the largest task. The current AdminDashboard.jsx is ~2,800 lines with three tab sections (users, classes, settings) plus diagnostics. Split it into focused sub-components.

- [ ] **Step 1: Read the full AdminDashboard**

Read `src/AdminDashboard.jsx` completely. Identify the boundaries:
- Lines ~1518–1456 + ~2458–2695: Users section (invite creation, user listing, CSV import/export, pending invites, audit logs)
- Lines ~1657–2456: Classes section (class creation, roster management, single/bulk/multi enrollment, attendance summary, gradebook export)
- Lines ~2695–2710 (approx): Settings section (CA/Exam weights, parent code backfill)
- Lines ~1528–1563: Diagnostics section

- [ ] **Step 2: Create AdminSettings.tsx**

Extract the `activePage === "settings"` content into `src/admin/AdminSettings.tsx`:

```typescript
import { ref, set, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { addToast } from "../toastService";
import type { SchoolSettings } from "../types";
import { useState, useEffect } from "react";

export default function AdminSettings() {
  const [caWeight, setCaWeight] = useState<number>(40);
  const [examWeight, setExamWeight] = useState<number>(60);
  const [settingsLoading, setSettingsLoading] = useState<boolean>(true);

  useEffect(() => {
    const settingsRef = ref(db, "schoolSettings/default");
    const unsub = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val() as SchoolSettings;
        setCaWeight(data.caWeight ?? 40);
        setExamWeight(data.examWeight ?? 60);
      }
      setSettingsLoading(false);
    });
    return () => unsub();
  }, []);

  // ... rest of the settings logic and JSX extracted from AdminDashboard
  // Include handleSaveSchoolSettings and the backfill button
}
```

Move the school settings useEffect, state variables, handler, and JSX into this component. Remove them from AdminDashboard.

- [ ] **Step 3: Create AdminDiagnostics.tsx**

Extract the diagnostics panel into `src/admin/AdminDiagnostics.tsx`. This includes the diagnostics state, `runDiagnostics()`, `refreshTokenAndRun()`, and the diagnostics JSX. It needs `auth`, `db` from firebase.

```typescript
interface AdminDiagnosticsProps {
  mySchoolId: string | null;
}
```

- [ ] **Step 4: Create AdminUsers.tsx**

Extract the users tab content into `src/admin/AdminUsers.tsx`. This is the largest sub-component — it includes:
- Invite creation form
- CSV import for invites
- User listing with tabs (students/teachers/admins)
- User search, sort, export
- Pending invites listing
- Audit logs

Props it needs from the parent:
```typescript
interface AdminUsersProps {
  users: User[];
  invites: Invite[];
  classes: SchoolClass[];
  mySchoolId: string | null;
}
```

State that stays local: `email`, `role`, `searchQuery`, `userSection`, `userSort`, `userLimits`, `confirm` (delete modal).

- [ ] **Step 5: Create AdminClasses.tsx**

Extract the classes tab content into `src/admin/AdminClasses.tsx`. This includes:
- Class creation form
- CSV import for classes
- Class listing
- Single enrollment, bulk enrollment, multi enrollment
- Roster management (view, move, bulk move)
- Attendance summary
- Gradebook export

Props:
```typescript
interface AdminClassesProps {
  users: User[];
  classes: SchoolClass[];
  mySchoolId: string | null;
}
```

- [ ] **Step 6: Convert AdminDashboard to thin shell**

Rename and convert the main file:
```bash
git mv src/AdminDashboard.jsx src/AdminDashboard.tsx
```

The new `AdminDashboard.tsx` becomes a thin shell that:
- Loads shared data (users, invites, classes) via Firebase listeners
- Manages `activePage` tab state
- Renders the tab navigation
- Renders the active sub-component with appropriate props
- Renders the "Having a problem?" diagnostics trigger button

Should be ~100-200 lines instead of 2,800.

- [ ] **Step 7: Verify build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds with AdminDashboard split into 5 files.

- [ ] **Step 8: Verify app works**

Run the dev server and check that the admin dashboard still works — all three tabs render correctly, user management works, class management works, settings tab works.

```bash
cd C:\Users\shiva\Code\school-portal && npm run dev
```

Navigate to the admin dashboard and verify each tab loads without errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: split AdminDashboard into focused TypeScript modules

AdminDashboard.tsx — thin shell with tab navigation (~150 lines)
admin/AdminUsers.tsx — user management, invites, audit logs
admin/AdminClasses.tsx — class management, enrollment, roster
admin/AdminSettings.tsx — CA/Exam weights, parent code backfill
admin/AdminDiagnostics.tsx — diagnostics panel

Total: 2,800 lines split into 5 focused, typed modules."
```

---

## Task 10: Final Cleanup & Verify

**Files:**
- Modify: `package.json` (add typecheck script)
- Verify: all `.jsx` and `.js` files in `src/` are gone

- [ ] **Step 1: Add typecheck script**

In `package.json`, add to scripts:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 2: Run typecheck**

```bash
cd C:\Users\shiva\Code\school-portal && npm run typecheck
```

Expected: No type errors. If there are errors, fix them.

- [ ] **Step 3: Verify no JS/JSX files remain in src/**

```bash
ls src/*.js src/*.jsx 2>/dev/null
```

Expected: No output (all files converted). The only JS files should be in `src/dataconnect-admin-generated/` (auto-generated, don't touch).

- [ ] **Step 4: Full build**

```bash
cd C:\Users\shiva\Code\school-portal && npm run build && cd functions && npm run build
```

Expected: Both builds pass.

- [ ] **Step 5: Deploy**

```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions,database,hosting
```

Expected: Deploy complete.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add typecheck script, verify full TypeScript migration complete

All src/ files converted to TypeScript. Strict mode with
noUncheckedIndexedAccess. Zero type errors."
```
