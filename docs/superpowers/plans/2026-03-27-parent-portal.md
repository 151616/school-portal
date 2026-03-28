# Parent Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parent-facing portal where parents sign up via a student-generated code, view their children's grades/attendance/assignments, message teachers, and receive in-app + email notifications — with school-configurable CA/Exam grading weights.

**Architecture:** Parent accounts are a new role ("parent") in the existing Firebase RTDB + React SPA. Parents onboard via auto-generated parent codes (created when a student signs up), not the admin invite system. A parent can link to multiple children. The teacher grade entry flow gains a CA/Exam assignment type, and school-level weight configuration lives in `schoolSettings`. Email notifications are sent via Firebase Cloud Functions using Nodemailer/SendGrid triggered by RTDB writes.

**Tech Stack:** React 19, Firebase RTDB, Firebase Auth, Firebase Cloud Functions (Node 22), Vite, existing CSS variable theming system.

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `src/ParentDashboard.jsx` | Parent's main dashboard — child switcher, grades, attendance, assignments tabs |
| `src/ParentSignup.jsx` | Standalone signup page: enter parent code → create account → link to child |
| `src/AddChildModal.jsx` | Modal for existing parents to link additional children via code |

### Modified Files
| File | Changes |
|---|---|
| `functions/index.js` | Add `generateParentCode` (RTDB trigger), `claimParentCode` (callable), `linkAdditionalChild` (callable), `sendNotificationEmail` (RTDB trigger). Add "parent" to ALLOWED_ROLES. |
| `src/App.jsx` | Add `/parent-signup` route, add `ParentDashboard` to `RoleDashboardRoute`, lazy-import new components |
| `src/AppHeader.jsx` | Add "Parent Portal" label when role === "parent" |
| `src/MessagingPanel.jsx` | Add parent↔teacher to `roleTargets` and `allowedPairs` |
| `src/StudentDashboard.jsx` | Display auto-generated parent code so student can share it |
| `src/TeacherDashboard.jsx` | Add assignment type selector (CA/Exam) to grade entry form |
| `src/AdminDashboard.jsx` | Add "School Settings" section for CA/Exam weight configuration |
| `database.rules.json` | Add rules for `parentCodes`, `parents`, `schoolSettings`; extend `grades`/`attendance`/`classes` rules for parent read access |
| `src/index.css` | Add responsive mobile-first styles for ParentDashboard, parent signup |

---

## Task 1: Add "parent" Role to Cloud Functions & Database Rules

**Files:**
- Modify: `functions/index.js` (line 13)
- Modify: `database.rules.json` (add new paths, extend existing rules)

- [ ] **Step 1: Add "parent" to ALLOWED_ROLES in Cloud Functions**

In `functions/index.js`, change line 13:

```javascript
const ALLOWED_ROLES = new Set(['student', 'teacher', 'admin', 'parent']);
```

- [ ] **Step 2: Add new Firebase paths to database rules**

In `database.rules.json`, add these new top-level paths inside `"rules"`:

```json
"parentCodes": {
  ".read": "auth != null && auth.token.admin === true",
  "$code": {
    ".read": true,
    ".write": "auth != null && (auth.token.admin === true || auth.token.student === true)",
    ".validate": "newData.hasChildren(['studentUid','createdAt']) && newData.child('studentUid').isString() && newData.child('createdAt').isNumber()"
  }
},
"parents": {
  "$parentUid": {
    ".read": "auth != null && (auth.uid == $parentUid || auth.token.admin === true)",
    ".write": "auth != null && (auth.uid == $parentUid || auth.token.admin === true)",
    "children": {
      "$studentUid": {
        ".validate": "newData.val() === true"
      }
    }
  }
},
"schoolSettings": {
  ".read": "auth != null",
  "$schoolId": {
    ".write": "auth != null && auth.token.admin === true",
    ".validate": "newData.hasChildren(['caWeight','examWeight']) && newData.child('caWeight').isNumber() && newData.child('examWeight').isNumber()"
  }
}
```

- [ ] **Step 3: Extend grades rules for parent read access**

Replace the `grades` block in `database.rules.json` with:

```json
"grades": {
  "$studentUid": {
    ".read": "auth != null && (auth.token.admin === true || auth.uid === $studentUid || root.child('parents').child(auth.uid).child('children').child($studentUid).val() === true)",
    "$classId": {
      ".read": "auth != null && (auth.token.admin === true || auth.uid === $studentUid || root.child('classes').child($classId).child('teacherUid').val() == auth.uid || root.child('parents').child(auth.uid).child('children').child($studentUid).val() === true)",
      ".write": "auth != null && (auth.token.admin === true || auth.uid === $studentUid || root.child('classes').child($classId).child('teacherUid').val() == auth.uid)"
    }
  }
}
```

- [ ] **Step 4: Extend attendance rules for parent read access**

Replace the `attendance` block in `database.rules.json` with:

```json
"attendance": {
  "$classId": {
    ".read": "auth != null && (auth.token.admin === true || root.child('classes').child($classId).child('teacherUid').val() == auth.uid)",
    "$date": {
      ".read": "auth != null && (auth.token.admin === true || root.child('classes').child($classId).child('teacherUid').val() == auth.uid)",
      ".write": "auth != null && (auth.token.admin === true || root.child('classes').child($classId).child('teacherUid').val() == auth.uid)",
      "$studentUid": {
        ".read": "auth != null && (auth.token.admin === true || root.child('classes').child($classId).child('teacherUid').val() == auth.uid || auth.uid == $studentUid || root.child('parents').child(auth.uid).child('children').child($studentUid).val() === true)"
      }
    }
  }
}
```

- [ ] **Step 5: Extend classes rules for parent read access**

Replace the `classes` `$classId` `.read` rule:

```json
"$classId": {
  ".read": "auth != null && (auth.token.admin === true || data.child('teacherUid').val() == auth.uid || data.child('students').child(auth.uid).exists() || (root.child('parents').child(auth.uid).child('children').exists() && data.child('students').hasChildren()))",
  ".write": "auth != null && auth.token.admin === true && (auth.token.schoolId == null || !data.exists() || data.child('schoolId').val() === auth.token.schoolId)"
}
```

Note: The class read rule for parents is permissive — the ParentDashboard will filter client-side to only show classes containing the parent's linked children. A more precise rule would require checking each child individually, which RTDB rules can't do dynamically. This is acceptable because class metadata (name, teacher) is not sensitive.

- [ ] **Step 6: Extend notification write rules for parents**

Replace the notifications `$notifId` `.write` rule:

```json
"$notifId": {
  ".write": "auth != null && (auth.uid == $uid || auth.token.admin === true || root.child('Users').child(auth.uid).child('role').val() == 'teacher' || root.child('Users').child(auth.uid).child('role').val() == 'parent')",
  ".validate": "newData.hasChildren(['title','body','createdAt','read']) && newData.child('title').isString() && newData.child('body').isString() && newData.child('createdAt').isNumber() && newData.child('read').isBoolean()"
}
```

- [ ] **Step 7: Extend thread rules to allow parent↔teacher pairs**

In the `threads` `$threadId` `.write` rule, add the parent↔teacher role pairs to the existing validation. The full role pair check becomes (add these two OR clauses to the existing list):

```
|| (newData.child('roleA').val() == 'parent' && newData.child('roleB').val() == 'teacher')
|| (newData.child('roleA').val() == 'teacher' && newData.child('roleB').val() == 'parent')
```

Similarly update the `messages` `$threadId` `$messageId` `.write` rule to include those same two pairs.

- [ ] **Step 8: Deploy database rules**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only database
```

Expected: `Deploy complete!`

- [ ] **Step 9: Commit**

```bash
git add functions/index.js database.rules.json
git commit -m "feat: add parent role to allowed roles and database security rules

Add parentCodes, parents, schoolSettings paths. Extend grades,
attendance, classes, notifications, threads, messages rules for
parent read/write access."
```

---

## Task 2: Auto-Generate Parent Code on Student Creation

**Files:**
- Modify: `functions/index.js` (add new Cloud Function)

- [ ] **Step 1: Add parent code generation function**

Add this function to `functions/index.js` after the `assignRoleFromInvite` export:

```javascript
const generateParentCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KGR-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

exports.onStudentCreated = functions.database
  .ref('/Users/{uid}')
  .onCreate(async (snapshot, context) => {
    const userData = snapshot.val() || {};
    const uid = context.params.uid;

    if (userData.role !== 'student') {
      return null;
    }

    const db = admin.database();
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = generateParentCode();
      const codeRef = db.ref(`parentCodes/${code}`);
      const existing = await codeRef.once('value');

      if (!existing.exists()) {
        await codeRef.set({
          studentUid: uid,
          studentEmail: userData.email || '',
          studentName: `${userData.firstName || ''} ${userData.lastInitial || ''}`.trim(),
          createdAt: Date.now(),
        });

        await db.ref(`Users/${uid}/parentCode`).set(code);
        console.log(`Parent code ${code} generated for student ${uid}`);
        return null;
      }
    }

    console.error(`Failed to generate unique parent code for student ${uid}`);
    return null;
  });
```

- [ ] **Step 2: Update User validation rule to allow parentCode field**

In `database.rules.json`, update the `Users` `$uid` `.validate` rule to also accept `parentCode`:

```json
".validate": "newData.hasChildren(['email','role']) && newData.child('email').isString() && newData.child('role').isString() && (!newData.child('parentCode').exists() || newData.child('parentCode').isString())"
```

Note: The `parentCode` field is written by the Cloud Function (which uses admin SDK and bypasses rules), but we add the validation anyway for consistency.

- [ ] **Step 3: Deploy functions and rules**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions,database
```

Expected: `Deploy complete!` with the new `onStudentCreated` function listed.

- [ ] **Step 4: Verify by checking an existing student**

To backfill existing students (one-time), you can run a script via the Firebase console or create a temporary Cloud Function. For now, we'll test with new signups. Existing students without parent codes will need manual backfill (Task 12 covers showing the code in StudentDashboard — if no code exists, the student sees "Code generating..." or admin can trigger regeneration).

- [ ] **Step 5: Commit**

```bash
git add functions/index.js database.rules.json
git commit -m "feat: auto-generate parent code when student account is created

Trigger on Users/{uid} onCreate. Generates KGR-XXXX format code,
stores in parentCodes/{code} and Users/{uid}/parentCode."
```

---

## Task 3: Parent Signup Page (ClaimParentCode Cloud Function)

**Files:**
- Modify: `functions/index.js` (add `claimParentCode` callable)
- Create: `src/ParentSignup.jsx`
- Modify: `src/App.jsx` (add route)

- [ ] **Step 1: Add claimParentCode Cloud Function**

Add to `functions/index.js`:

```javascript
exports.claimParentCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }

  const uid = context.auth.uid;
  const code = String(data?.code || '').trim().toUpperCase();

  if (!code || !/^KGR-[A-Z0-9]{4}$/.test(code)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parent code format');
  }

  const db = admin.database();
  const codeSnap = await db.ref(`parentCodes/${code}`).once('value');

  if (!codeSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Parent code not found');
  }

  const codeData = codeSnap.val();
  const studentUid = codeData.studentUid;

  if (!studentUid) {
    throw new functions.https.HttpsError('failed-precondition', 'Invalid parent code data');
  }

  const studentSnap = await db.ref(`Users/${studentUid}`).once('value');
  if (!studentSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Student account not found');
  }

  const parentSnap = await db.ref(`Users/${uid}`).once('value');
  const isExistingParent = parentSnap.exists() && parentSnap.val()?.role === 'parent';

  if (!isExistingParent) {
    const firstName = typeof data?.firstName === 'string' ? data.firstName.trim() : '';
    const lastInitial = typeof data?.lastInitial === 'string' ? data.lastInitial.trim().charAt(0).toUpperCase() : '';

    const authUser = await admin.auth().getUser(uid);

    await admin.auth().setCustomUserClaims(uid, { parent: true });

    await db.ref(`Users/${uid}`).set({
      email: normalizeEmail(authUser.email),
      role: 'parent',
      firstName,
      lastInitial,
      createdAt: Date.now(),
    });
  }

  await db.ref(`parents/${uid}/children/${studentUid}`).set(true);

  const studentData = studentSnap.val();
  return {
    success: true,
    studentName: `${studentData.firstName || ''} ${studentData.lastInitial || ''}`.trim(),
    studentId: studentData.studentId || '',
  };
});
```

- [ ] **Step 2: Create ParentSignup.jsx**

Create `src/ParentSignup.jsx`:

```jsx
import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, functions } from "./firebase";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import Toasts from "./Toasts";
import { addToast } from "./toastService";
import { CheckIcon } from "./icons";

export default function ParentSignup() {
  const navigate = useNavigate();
  const [parentCode, setParentCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lastInitialRef = useRef(null);
  const passwordRef = useRef(null);
  const codeRef = useRef(null);

  const handleSignup = async () => {
    if (submitting) return;

    const code = parentCode.trim().toUpperCase();
    if (!code) {
      addToast("error", "Enter your child's parent code.");
      return;
    }
    if (!email.trim()) {
      addToast("error", "Enter your email address.");
      return;
    }
    if (password.length < 8) {
      addToast("error", "Password must be at least 8 characters.");
      return;
    }
    if (!firstName.trim()) {
      addToast("error", "Enter your first name.");
      return;
    }
    if (!lastInitial.trim()) {
      addToast("error", "Enter your last initial.");
      return;
    }

    setSubmitting(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      try {
        const claimParentCode = httpsCallable(functions, "claimParentCode");
        await claimParentCode({
          code,
          firstName: firstName.trim(),
          lastInitial: lastInitial.trim().charAt(0).toUpperCase(),
        });

        await auth.currentUser.getIdToken(true);

        try {
          await sendEmailVerification(auth.currentUser);
        } catch (verifyErr) {
          console.error("Verification email error:", verifyErr);
        }

        addToast("success", "Account created! You are now linked to your child.");
        navigate("/");
      } catch (claimErr) {
        console.error("Parent code claim error:", claimErr);

        if (
          auth.currentUser &&
          auth.currentUser.uid === userCredential.user.uid
        ) {
          try {
            await deleteUser(userCredential.user);
          } catch (rollbackErr) {
            console.error("Rollback failed:", rollbackErr);
          }
        }

        const msg =
          claimErr?.message?.includes("not-found")
            ? "Parent code not found. Check with your child or school."
            : claimErr?.message || "Signup failed. Please try again.";
        addToast("error", msg);
      }
    } catch (authErr) {
      console.error("Signup auth error:", authErr);
      const msg =
        authErr.code === "auth/email-already-in-use"
          ? "This email already has an account. Try logging in instead."
          : authErr.message || "Signup failed.";
      addToast("error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-container">
      <div className="card">
        <Toasts />
        <div className="card-header">
          <h2>Parent Signup</h2>
          <div className="muted">
            Create your parent account using the code from your child's student
            portal.
          </div>
        </div>

        <div className="section">
          <div className="auth-form-stack">
            <input
              ref={codeRef}
              className="input auth-field"
              type="text"
              placeholder="Parent code (e.g. KGR-A3X9)"
              value={parentCode}
              onChange={(e) => setParentCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  document.getElementById("parent-email")?.focus();
              }}
              maxLength={8}
              autoComplete="off"
              style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}
            />
            <input
              id="parent-email"
              className="input auth-field"
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  document.getElementById("parent-fname")?.focus();
              }}
              autoComplete="email"
            />
            <input
              id="parent-fname"
              className="input auth-field"
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lastInitialRef.current?.focus();
              }}
              autoComplete="given-name"
            />
            <input
              ref={lastInitialRef}
              className="input auth-field"
              type="text"
              placeholder="Last initial"
              value={lastInitial}
              onChange={(e) => setLastInitial(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") passwordRef.current?.focus();
              }}
              maxLength={1}
              autoComplete="family-name"
            />
            <input
              ref={passwordRef}
              className="input auth-field"
              type="password"
              placeholder="Set your password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) handleSignup();
              }}
              autoComplete="new-password"
            />
            <button
              className="btn btn-primary auth-form-submit auth-action"
              disabled={submitting}
              onClick={handleSignup}
            >
              <CheckIcon className="icon" />{" "}
              {submitting ? "Creating Account..." : "Create Parent Account"}
            </button>
            <div className="small muted" style={{ textAlign: "center" }}>
              Already have an account?{" "}
              <a href="/" style={{ color: "var(--accent)" }}>
                Log in
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add /parent-signup route to App.jsx**

In `src/App.jsx`, add the lazy import after the existing imports (around line 16):

```javascript
const ParentSignup = lazy(() => import("./ParentSignup.jsx"));
```

Add the route inside `<Routes>`, after the `/signup` route (around line 218):

```jsx
<Route path="/parent-signup" element={<ParentSignup />} />
```

- [ ] **Step 4: Add ParentDashboard to RoleDashboardRoute**

In `src/App.jsx`, add lazy import:

```javascript
const ParentDashboard = lazy(() => import("./ParentDashboard.jsx"));
```

Update `RoleDashboardRoute` to include parent:

```javascript
function RoleDashboardRoute() {
  const { user, role } = useOutletContext();

  if (role === "teacher") return <TeacherDashboard user={user} />;
  if (role === "student") return <StudentDashboard user={user} />;
  if (role === "admin") return <AdminDashboard user={user} />;
  if (role === "parent") return <ParentDashboard user={user} />;

  return null;
}
```

- [ ] **Step 5: Create a placeholder ParentDashboard.jsx**

Create `src/ParentDashboard.jsx` as a placeholder so the app doesn't crash:

```jsx
import React from "react";

export default function ParentDashboard({ user }) {
  return (
    <div className="app-container">
      <div className="card">
        <div className="card-header">
          <h2>Parent Dashboard</h2>
          <div className="muted">Welcome! Your dashboard is loading...</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add "Parent Portal" to AppHeader**

In `src/AppHeader.jsx`, find the role label logic and add parent. Look for where it displays the role name (the heading next to the logo). Add:

```javascript
const roleLabel =
  currentRole === "teacher"
    ? "Teacher Workspace"
    : currentRole === "student"
    ? "Student Portal"
    : currentRole === "admin"
    ? "Admin Console"
    : currentRole === "parent"
    ? "Parent Portal"
    : "";
```

If the label is computed differently (inline), add the parent case in the same pattern.

- [ ] **Step 7: Add parent-signup link to Login page**

In `src/Login.jsx`, add a link below the existing login form so parents can find the signup page. Add after the sign-in button area:

```jsx
<div className="small muted" style={{ textAlign: "center", marginTop: 12 }}>
  Are you a parent?{" "}
  <a href="/parent-signup" style={{ color: "var(--accent)" }}>
    Sign up here
  </a>
</div>
```

- [ ] **Step 8: Deploy functions**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions
```

Expected: `Deploy complete!` with `claimParentCode` listed.

- [ ] **Step 9: Build and test locally**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
git add src/ParentSignup.jsx src/ParentDashboard.jsx src/App.jsx src/AppHeader.jsx src/Login.jsx functions/index.js
git commit -m "feat: add parent signup flow with parent code claiming

New /parent-signup route, claimParentCode cloud function, placeholder
ParentDashboard, Parent Portal label in header, login page link."
```

---

## Task 4: Parent Dashboard — Child Switcher & Grades View

**Files:**
- Modify: `src/ParentDashboard.jsx` (replace placeholder)

- [ ] **Step 1: Build the full ParentDashboard with child switcher and grades**

Replace `src/ParentDashboard.jsx` with:

```jsx
import React, { useEffect, useMemo, useState } from "react";
import { get, onValue, ref } from "firebase/database";
import { db } from "./firebase";
import { addToast } from "./toastService";

export default function ParentDashboard({ user }) {
  const [children, setChildren] = useState([]);
  const [activeChildUid, setActiveChildUid] = useState(null);
  const [childProfiles, setChildProfiles] = useState({});
  const [grades, setGrades] = useState({});
  const [classes, setClasses] = useState({});
  const [attendance, setAttendance] = useState({});
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [tab, setTab] = useState("grades");
  const [loading, setLoading] = useState(true);
  const [expandedClasses, setExpandedClasses] = useState({});

  // Load linked children
  useEffect(() => {
    if (!user) return;
    const parentsRef = ref(db, `parents/${user.uid}/children`);
    const unsub = onValue(parentsRef, (snap) => {
      const data = snap.val() || {};
      const childUids = Object.keys(data);
      setChildren(childUids);
      if (childUids.length > 0 && !activeChildUid) {
        setActiveChildUid(childUids[0]);
      }
      if (childUids.length === 0) {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [user]);

  // Load child profiles
  useEffect(() => {
    if (children.length === 0) return;
    const profiles = {};
    const promises = children.map(async (uid) => {
      const snap = await get(ref(db, `Users/${uid}`));
      if (snap.exists()) profiles[uid] = snap.val();
    });
    Promise.all(promises).then(() => setChildProfiles(profiles));
  }, [children]);

  // Load school settings
  useEffect(() => {
    if (!user) return;
    const settingsRef = ref(db, "schoolSettings/default");
    const unsub = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        setSchoolSettings(snap.val());
      } else {
        setSchoolSettings({ caWeight: 40, examWeight: 60 });
      }
    });
    return () => unsub();
  }, [user]);

  // Load active child's grades
  useEffect(() => {
    if (!activeChildUid) return;
    setLoading(true);
    const gradesRef = ref(db, `grades/${activeChildUid}`);
    const unsub = onValue(gradesRef, (snap) => {
      setGrades(snap.val() || {});
      setLoading(false);
    });
    return () => unsub();
  }, [activeChildUid]);

  // Load active child's classes
  useEffect(() => {
    if (!activeChildUid) return;
    const unsub = onValue(ref(db, "classes"), async (snap) => {
      const all = snap.val() || {};
      const enrolled = {};
      Object.entries(all).forEach(([classId, classData]) => {
        if (classData?.students?.[activeChildUid]) {
          enrolled[classId] = classData;
        }
      });
      setClasses(enrolled);
    }, (err) => {
      // If bulk read fails, try reading each class from grades
      const classIds = Object.keys(grades);
      const enrolled = {};
      Promise.all(
        classIds.map(async (classId) => {
          try {
            const snap = await get(ref(db, `classes/${classId}`));
            if (snap.exists()) enrolled[classId] = snap.val();
          } catch (e) {
            console.debug("Cannot read class", classId);
          }
        })
      ).then(() => setClasses(enrolled));
    });
    return () => unsub();
  }, [activeChildUid, grades]);

  // Load active child's attendance (last 7 days)
  useEffect(() => {
    if (!activeChildUid || Object.keys(classes).length === 0) return;
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const attendanceData = {};
    const promises = Object.keys(classes).flatMap((classId) =>
      dates.map(async (date) => {
        try {
          const snap = await get(
            ref(db, `attendance/${classId}/${date}/${activeChildUid}`)
          );
          if (snap.exists()) {
            if (!attendanceData[classId]) attendanceData[classId] = {};
            attendanceData[classId][date] = snap.val();
          }
        } catch (e) {
          // Parent may not have read access to full attendance node
        }
      })
    );

    Promise.all(promises).then(() => setAttendance(attendanceData));
  }, [activeChildUid, classes]);

  const activeChild = childProfiles[activeChildUid] || null;

  const classGrades = useMemo(() => {
    const result = {};
    Object.entries(grades).forEach(([classId, classData]) => {
      const assignments = classData?.assignments || {};
      const list = Object.entries(assignments).map(([id, a]) => ({
        id,
        ...a,
      }));
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const caAssignments = list.filter((a) => a.type === "ca");
      const examAssignments = list.filter((a) => a.type === "exam");
      const untyped = list.filter((a) => !a.type);

      let weightedAvg = null;
      if (
        schoolSettings &&
        (caAssignments.length > 0 || examAssignments.length > 0)
      ) {
        const caTotal = caAssignments.reduce((s, a) => s + (a.score || 0), 0);
        const caMax = caAssignments.reduce((s, a) => s + (a.maxScore || 0), 0);
        const examTotal = examAssignments.reduce(
          (s, a) => s + (a.score || 0),
          0
        );
        const examMax = examAssignments.reduce(
          (s, a) => s + (a.maxScore || 0),
          0
        );

        const caPercent = caMax > 0 ? (caTotal / caMax) * 100 : 0;
        const examPercent = examMax > 0 ? (examTotal / examMax) * 100 : 0;
        const caW = schoolSettings.caWeight / 100;
        const examW = schoolSettings.examWeight / 100;

        if (caMax > 0 && examMax > 0) {
          weightedAvg = caPercent * caW + examPercent * examW;
        } else if (caMax > 0) {
          weightedAvg = caPercent;
        } else if (examMax > 0) {
          weightedAvg = examPercent;
        }
      }

      const totalScore = list.reduce((s, a) => s + (a.score || 0), 0);
      const totalMax = list.reduce((s, a) => s + (a.maxScore || 0), 0);
      const simpleAvg = totalMax > 0 ? (totalScore / totalMax) * 100 : null;

      result[classId] = {
        assignments: list,
        caAssignments,
        examAssignments,
        untypedAssignments: untyped,
        weightedAvg,
        simpleAvg,
        average: weightedAvg !== null ? weightedAvg : simpleAvg,
      };
    });
    return result;
  }, [grades, schoolSettings]);

  const letterGrade = (pct) => {
    if (pct === null || pct === undefined) return "—";
    if (pct >= 90) return "A";
    if (pct >= 80) return "B";
    if (pct >= 70) return "C";
    if (pct >= 60) return "D";
    return "F";
  };

  const overallAverage = useMemo(() => {
    const avgs = Object.values(classGrades)
      .map((c) => c.average)
      .filter((a) => a !== null);
    if (avgs.length === 0) return null;
    return avgs.reduce((s, a) => s + a, 0) / avgs.length;
  }, [classGrades]);

  const toggleClass = (classId) => {
    setExpandedClasses((prev) => ({ ...prev, [classId]: !prev[classId] }));
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="card">Loading your dashboard...</div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="app-container">
        <div className="card">
          <div className="card-header">
            <h2>Parent Dashboard</h2>
            <div className="muted">
              No children linked yet. Use the "Add Child" button to link your
              child's account using their parent code.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Child Switcher */}
      {children.length > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {children.map((uid) => {
              const profile = childProfiles[uid];
              const name = profile
                ? `${profile.firstName || ""} ${profile.lastInitial || ""}`.trim()
                : uid.slice(0, 8);
              return (
                <button
                  key={uid}
                  className={`btn ${uid === activeChildUid ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setActiveChildUid(uid)}
                >
                  {name}
                  {profile?.studentId ? ` (${profile.studentId})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>
            {activeChild
              ? `${activeChild.firstName || ""} ${activeChild.lastInitial || ""}`.trim()
              : "Student"}
          </h2>
          <div className="muted">
            {activeChild?.studentId && <>ID: {activeChild.studentId} &middot; </>}
            {Object.keys(classes).length} class
            {Object.keys(classes).length !== 1 ? "es" : ""} &middot;{" "}
            Overall: {overallAverage !== null ? `${overallAverage.toFixed(1)}% (${letterGrade(overallAverage)})` : "No grades yet"}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="form-row" style={{ marginBottom: 16, gap: 8 }}>
        {["grades", "attendance", "assignments"].map((t) => (
          <button
            key={t}
            className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Grades Tab */}
      {tab === "grades" && (
        <div>
          {Object.entries(classGrades).length === 0 && (
            <div className="card">
              <div className="muted">No grades recorded yet.</div>
            </div>
          )}
          {Object.entries(classGrades).map(([classId, data]) => {
            const cls = classes[classId];
            const expanded = expandedClasses[classId];
            return (
              <div className="card" key={classId} style={{ marginBottom: 12 }}>
                <div
                  className="card-header"
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleClass(classId)}
                >
                  <h3 style={{ margin: 0 }}>
                    {cls?.name || classId}{" "}
                    <span className="muted" style={{ fontWeight: "normal" }}>
                      {data.average !== null
                        ? `${data.average.toFixed(1)}% (${letterGrade(data.average)})`
                        : "—"}
                    </span>
                  </h3>
                  <span className="muted">{expanded ? "▲" : "▼"}</span>
                </div>

                {/* Progress bar */}
                {data.average !== null && (
                  <div
                    style={{
                      background: "var(--border)",
                      borderRadius: 4,
                      height: 6,
                      margin: "8px 0",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(data.average, 100)}%`,
                        height: "100%",
                        background: "var(--accent)",
                        borderRadius: 4,
                      }}
                    />
                  </div>
                )}

                {expanded && (
                  <div style={{ marginTop: 12 }}>
                    {/* CA/Exam breakdown if weights are configured */}
                    {schoolSettings &&
                      (data.caAssignments.length > 0 ||
                        data.examAssignments.length > 0) && (
                        <div
                          className="muted small"
                          style={{ marginBottom: 8 }}
                        >
                          CA ({schoolSettings.caWeight}%):{" "}
                          {data.caAssignments.length} assignments &middot; Exam (
                          {schoolSettings.examWeight}%):{" "}
                          {data.examAssignments.length} assignments
                        </div>
                      )}

                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{ textAlign: "left", padding: "4px 8px" }}>
                            Assignment
                          </th>
                          <th style={{ textAlign: "left", padding: "4px 8px" }}>
                            Type
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 8px" }}>
                            Score
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 8px" }}>
                            %
                          </th>
                          <th style={{ textAlign: "center", padding: "4px 8px" }}>
                            Grade
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.assignments.map((a) => {
                          const pct =
                            a.maxScore > 0
                              ? (a.score / a.maxScore) * 100
                              : null;
                          return (
                            <tr
                              key={a.id}
                              style={{
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              <td style={{ padding: "4px 8px" }}>{a.name}</td>
                              <td
                                style={{ padding: "4px 8px" }}
                                className="muted small"
                              >
                                {a.type === "ca"
                                  ? "CA"
                                  : a.type === "exam"
                                  ? "Exam"
                                  : "—"}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "4px 8px",
                                }}
                              >
                                {a.score}/{a.maxScore}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "4px 8px",
                                }}
                              >
                                {pct !== null ? `${pct.toFixed(1)}%` : "—"}
                              </td>
                              <td
                                style={{
                                  textAlign: "center",
                                  padding: "4px 8px",
                                }}
                              >
                                {letterGrade(pct)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Attendance Tab */}
      {tab === "attendance" && (
        <div>
          {Object.keys(classes).length === 0 && (
            <div className="card">
              <div className="muted">No classes enrolled.</div>
            </div>
          )}
          {Object.entries(classes).map(([classId, cls]) => {
            const classAttendance = attendance[classId] || {};
            const dates = Object.keys(classAttendance).sort().reverse();
            const counts = { present: 0, tardy: 0, absent: 0, excused: 0 };
            dates.forEach((d) => {
              const status = classAttendance[d];
              if (counts[status] !== undefined) counts[status]++;
            });

            return (
              <div className="card" key={classId} style={{ marginBottom: 12 }}>
                <h3 style={{ margin: "0 0 8px 0" }}>{cls?.name || classId}</h3>

                {dates.length === 0 ? (
                  <div className="muted small">
                    No attendance data available.
                  </div>
                ) : (
                  <>
                    <div className="form-row" style={{ gap: 16, marginBottom: 8 }}>
                      <span className="small">
                        Present: <strong>{counts.present}</strong>
                      </span>
                      <span className="small">
                        Tardy: <strong>{counts.tardy}</strong>
                      </span>
                      <span className="small" style={{ color: counts.absent >= 2 ? "var(--error, #c0392b)" : "inherit" }}>
                        Absent: <strong>{counts.absent}</strong>
                        {counts.absent >= 2 && " ⚠"}
                      </span>
                      <span className="small">
                        Excused: <strong>{counts.excused}</strong>
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {dates.map((date) => {
                        const status = classAttendance[date];
                        const colors = {
                          present: "var(--accent)",
                          tardy: "#e67e22",
                          absent: "var(--error, #c0392b)",
                          excused: "#7f8c8d",
                        };
                        return (
                          <div
                            key={date}
                            title={`${date}: ${status}`}
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: colors[status] || "var(--border)",
                              color: "#fff",
                              fontSize: "0.75rem",
                            }}
                          >
                            {date.slice(5)}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assignments Tab */}
      {tab === "assignments" && (
        <div>
          {Object.entries(classGrades).length === 0 && (
            <div className="card">
              <div className="muted">No assignments yet.</div>
            </div>
          )}
          {Object.entries(classGrades).map(([classId, data]) => {
            const cls = classes[classId];
            const missing = data.assignments.filter(
              (a) => a.score === undefined || a.score === null
            );
            const completed = data.assignments.filter(
              (a) => a.score !== undefined && a.score !== null
            );

            return (
              <div className="card" key={classId} style={{ marginBottom: 12 }}>
                <h3 style={{ margin: "0 0 8px 0" }}>{cls?.name || classId}</h3>

                {missing.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      className="small"
                      style={{
                        color: "var(--error, #c0392b)",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Missing ({missing.length})
                    </div>
                    {missing.map((a) => (
                      <div key={a.id} className="small" style={{ padding: "2px 0" }}>
                        &mdash; {a.name} (max: {a.maxScore})
                        {a.type && (
                          <span className="muted"> [{a.type.toUpperCase()}]</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="small muted">
                  Completed: {completed.length} &middot; Missing: {missing.length}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ParentDashboard.jsx
git commit -m "feat: build parent dashboard with child switcher, grades, attendance, assignments

Three-tab layout. Grades tab shows CA/Exam weighted averages when
school settings are configured. Attendance tab shows 7-day history.
Assignments tab highlights missing work."
```

---

## Task 5: Add Child Modal for Existing Parents

**Files:**
- Create: `src/AddChildModal.jsx`
- Modify: `src/ParentDashboard.jsx` (add button to open modal)
- Modify: `functions/index.js` (add `linkAdditionalChild` callable)

- [ ] **Step 1: Add linkAdditionalChild Cloud Function**

Add to `functions/index.js`:

```javascript
exports.linkAdditionalChild = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }

  const uid = context.auth.uid;
  const db = admin.database();

  const userSnap = await db.ref(`Users/${uid}`).once('value');
  if (!userSnap.exists() || userSnap.val()?.role !== 'parent') {
    throw new functions.https.HttpsError('permission-denied', 'Only parent accounts can link children');
  }

  const code = String(data?.code || '').trim().toUpperCase();

  if (!code || !/^KGR-[A-Z0-9]{4}$/.test(code)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parent code format');
  }

  const codeSnap = await db.ref(`parentCodes/${code}`).once('value');
  if (!codeSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Parent code not found');
  }

  const studentUid = codeSnap.val().studentUid;
  const studentSnap = await db.ref(`Users/${studentUid}`).once('value');
  if (!studentSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Student account not found');
  }

  const existingLink = await db.ref(`parents/${uid}/children/${studentUid}`).once('value');
  if (existingLink.exists()) {
    throw new functions.https.HttpsError('already-exists', 'This child is already linked to your account');
  }

  await db.ref(`parents/${uid}/children/${studentUid}`).set(true);

  const studentData = studentSnap.val();
  return {
    success: true,
    studentName: `${studentData.firstName || ''} ${studentData.lastInitial || ''}`.trim(),
    studentId: studentData.studentId || '',
  };
});
```

- [ ] **Step 2: Create AddChildModal.jsx**

Create `src/AddChildModal.jsx`:

```jsx
import React, { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { addToast } from "./toastService";
import { CheckIcon } from "./icons";

export default function AddChildModal({ onClose, onLinked }) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLink = async () => {
    if (submitting) return;
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      addToast("error", "Enter a parent code.");
      return;
    }

    setSubmitting(true);
    try {
      const linkChild = httpsCallable(functions, "linkAdditionalChild");
      const result = await linkChild({ code: trimmed });
      const name = result.data?.studentName || "your child";
      addToast("success", `Linked to ${name}!`);
      if (onLinked) onLinked();
      onClose();
    } catch (err) {
      console.error("Link child error:", err);
      const msg = err?.message?.includes("already-exists")
        ? "This child is already linked to your account."
        : err?.message?.includes("not-found")
        ? "Parent code not found. Check with your child or school."
        : err?.message || "Failed to link child.";
      addToast("error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3>Add Another Child</h3>
          <button className="btn btn-ghost" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="section">
          <div className="muted small" style={{ marginBottom: 8 }}>
            Enter the parent code from your child's student portal.
          </div>
          <input
            className="input"
            type="text"
            placeholder="Parent code (e.g. KGR-A3X9)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !submitting) handleLink();
            }}
            maxLength={8}
            autoFocus
            style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}
          />
          <button
            className="btn btn-primary"
            disabled={submitting}
            onClick={handleLink}
            style={{ marginTop: 8, width: "100%" }}
          >
            <CheckIcon className="icon" />{" "}
            {submitting ? "Linking..." : "Link Child"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add "Add Child" button to ParentDashboard**

In `src/ParentDashboard.jsx`, add the import at the top:

```javascript
import AddChildModal from "./AddChildModal";
```

Add state inside the component:

```javascript
const [showAddChild, setShowAddChild] = useState(false);
```

Add the button and modal render in the JSX, right after the summary card:

```jsx
{/* Add Child Button */}
<div style={{ marginBottom: 16 }}>
  <button className="btn btn-ghost" onClick={() => setShowAddChild(true)}>
    + Add Child
  </button>
</div>

{showAddChild && (
  <AddChildModal
    onClose={() => setShowAddChild(false)}
    onLinked={() => {}}
  />
)}
```

- [ ] **Step 4: Deploy functions**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions
```

Expected: `Deploy complete!` with `linkAdditionalChild` listed.

- [ ] **Step 5: Build and verify**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/AddChildModal.jsx src/ParentDashboard.jsx functions/index.js
git commit -m "feat: add child linking for existing parent accounts

AddChildModal component, linkAdditionalChild cloud function.
Parents can link multiple children via parent codes."
```

---

## Task 6: Messaging — Parent↔Teacher Support

**Files:**
- Modify: `src/MessagingPanel.jsx` (lines 7-17)

- [ ] **Step 1: Add parent to roleTargets and allowedPairs**

In `src/MessagingPanel.jsx`, update the `roleTargets` object (around line 7):

```javascript
const roleTargets = {
  student: ["teacher"],
  teacher: ["student", "admin", "parent"],
  admin: ["teacher", "student"],
  parent: ["teacher"],
};
```

Update the `allowedPairs` set (around line 13):

```javascript
const allowedPairs = new Set([
  "admin:student",
  "admin:teacher",
  "student:teacher",
  "parent:teacher",
]);
```

- [ ] **Step 2: Build and verify**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/MessagingPanel.jsx
git commit -m "feat: enable parent-teacher messaging

Add parent to roleTargets and allowedPairs in MessagingPanel."
```

---

## Task 7: Student Dashboard — Show Parent Code

**Files:**
- Modify: `src/StudentDashboard.jsx`

- [ ] **Step 1: Add parent code display to StudentDashboard**

In `src/StudentDashboard.jsx`, the component reads from `Users/{uid}` for the profile. Add a state variable for the parent code and read it from the user profile data.

Find where the user profile data is loaded (look for `onValue` on `Users/${user.uid}` or similar). After the profile data is set, extract `parentCode`:

Add state:
```javascript
const [parentCode, setParentCode] = useState(null);
```

In the profile data loading effect, when the snapshot is read, add:
```javascript
setParentCode(data.parentCode || null);
```

Add this JSX block in the profile/summary area of the dashboard (near the student ID display):

```jsx
{parentCode && (
  <div className="small" style={{ marginTop: 8 }}>
    <strong>Parent Code:</strong>{" "}
    <code
      style={{
        fontFamily: "monospace",
        letterSpacing: "0.1em",
        background: "var(--border)",
        padding: "2px 6px",
        borderRadius: 4,
        cursor: "pointer",
      }}
      title="Click to copy"
      onClick={() => {
        navigator.clipboard.writeText(parentCode);
        addToast("info", "Parent code copied!");
      }}
    >
      {parentCode}
    </code>
    <div className="muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>
      Share this code with your parent to connect their account.
    </div>
  </div>
)}
```

Make sure `addToast` is imported at the top of the file:
```javascript
import { addToast } from "./toastService";
```

- [ ] **Step 2: Build and verify**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/StudentDashboard.jsx
git commit -m "feat: show parent code on student dashboard

Students can see and copy their parent code to share with parents."
```

---

## Task 8: Teacher Dashboard — CA/Exam Assignment Type

**Files:**
- Modify: `src/TeacherDashboard.jsx`

- [ ] **Step 1: Add assignment type selector to grade entry form**

In `src/TeacherDashboard.jsx`, find the grade entry form where the teacher enters: assignment name, max score, rubric. Add a `type` selector between the assignment name and max score fields.

Add state:
```javascript
const [assignmentType, setAssignmentType] = useState("");
```

Add this JSX in the grade entry form, after the assignment name input:

```jsx
<select
  className="input"
  value={assignmentType}
  onChange={(e) => setAssignmentType(e.target.value)}
  style={{ maxWidth: 200 }}
>
  <option value="">Type (optional)</option>
  <option value="ca">CA (Continuous Assessment)</option>
  <option value="exam">Exam</option>
</select>
```

- [ ] **Step 2: Include type in the grade save payload**

Find where grades are saved (the `set` or `update` call that writes to `grades/{studentUid}/{classId}/assignments/{assignmentId}`). The current payload is:

```javascript
{ name, score, maxScore, rubric, teacherUid, updatedAt }
```

Add `type` to the payload:

```javascript
{
  name,
  score,
  maxScore,
  rubric,
  teacherUid,
  updatedAt,
  ...(assignmentType ? { type: assignmentType } : {}),
}
```

- [ ] **Step 3: Reset assignmentType when changing class or clearing form**

Find where the form is reset (after successful save, or when switching classes). Add:

```javascript
setAssignmentType("");
```

- [ ] **Step 4: Include type when applying templates**

If the template apply function sets the assignment name and maxScore, it should also clear the type (or optionally store type in templates — but for now, just clear it):

```javascript
setAssignmentType("");
```

- [ ] **Step 5: Build and verify**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/TeacherDashboard.jsx
git commit -m "feat: add CA/Exam type selector to teacher grade entry

Teachers can tag assignments as CA or Exam. Type is stored in the
grade record and used for weighted average calculations."
```

---

## Task 9: Admin Dashboard — School Settings (CA/Exam Weights)

**Files:**
- Modify: `src/AdminDashboard.jsx`

- [ ] **Step 1: Add School Settings section**

In `src/AdminDashboard.jsx`, add a new section for school settings. Find where the tab/section navigation is defined (the admin dashboard has multiple sections like Users, Classes, Roster, etc.).

Add state variables near the top of the component:

```javascript
const [caWeight, setCaWeight] = useState(40);
const [examWeight, setExamWeight] = useState(60);
const [settingsLoading, setSettingsLoading] = useState(true);
```

Add a useEffect to load existing school settings:

```javascript
useEffect(() => {
  const settingsRef = ref(db, "schoolSettings/default");
  const unsub = onValue(settingsRef, (snap) => {
    if (snap.exists()) {
      const data = snap.val();
      setCaWeight(data.caWeight ?? 40);
      setExamWeight(data.examWeight ?? 60);
    }
    setSettingsLoading(false);
  });
  return () => unsub();
}, []);
```

Add a save handler:

```javascript
const handleSaveSchoolSettings = async () => {
  const ca = Number(caWeight);
  const exam = Number(examWeight);
  if (isNaN(ca) || isNaN(exam) || ca < 0 || exam < 0) {
    addToast("error", "Weights must be positive numbers.");
    return;
  }
  if (ca + exam !== 100) {
    addToast("error", "CA + Exam weights must equal 100%.");
    return;
  }
  try {
    await set(ref(db, "schoolSettings/default"), {
      caWeight: ca,
      examWeight: exam,
      updatedAt: Date.now(),
    });
    addToast("success", "School settings saved.");
  } catch (err) {
    console.error("Save settings error:", err);
    addToast("error", "Failed to save settings.");
  }
};
```

Add the JSX section (add as a new tab or section alongside existing ones):

```jsx
{/* School Settings Section */}
<div className="card" style={{ marginBottom: 16 }}>
  <div className="card-header">
    <h3>School Settings</h3>
  </div>
  <div className="section">
    <div className="small muted" style={{ marginBottom: 8 }}>
      Configure how CA and Exam scores are weighted for grade calculations.
    </div>
    <div className="form-row" style={{ gap: 12, alignItems: "center" }}>
      <label className="small">
        CA Weight (%):
        <input
          className="input"
          type="number"
          min="0"
          max="100"
          value={caWeight}
          onChange={(e) => {
            const val = Number(e.target.value);
            setCaWeight(val);
            setExamWeight(100 - val);
          }}
          style={{ width: 80, marginLeft: 8 }}
        />
      </label>
      <label className="small">
        Exam Weight (%):
        <input
          className="input"
          type="number"
          min="0"
          max="100"
          value={examWeight}
          onChange={(e) => {
            const val = Number(e.target.value);
            setExamWeight(val);
            setCaWeight(100 - val);
          }}
          style={{ width: 80, marginLeft: 8 }}
        />
      </label>
      <button className="btn btn-primary" onClick={handleSaveSchoolSettings}>
        Save
      </button>
    </div>
    <div className="muted small" style={{ marginTop: 4 }}>
      Current: CA {caWeight}% + Exam {examWeight}% = {Number(caWeight) + Number(examWeight)}%
    </div>
  </div>
</div>
```

Make sure `set` is imported from firebase/database at the top (it should already be, but verify):

```javascript
import { get, onValue, ref, set, update, push, remove, query, orderByChild, equalTo } from "firebase/database";
```

- [ ] **Step 2: Build and verify**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/AdminDashboard.jsx
git commit -m "feat: add school settings for CA/Exam weight configuration

Admins can set CA and Exam percentage weights. Stored in
schoolSettings/default. Used by parent and student dashboards
for weighted grade calculations."
```

---

## Task 10: In-App Notifications for Parents

**Files:**
- Modify: `functions/index.js` (add RTDB triggers for parent notifications)

- [ ] **Step 1: Add grade notification trigger for parents**

Add to `functions/index.js`:

```javascript
exports.notifyParentOnGrade = functions.database
  .ref('/grades/{studentUid}/{classId}/assignments/{assignmentId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists()) return null;

    const { studentUid, classId, assignmentId } = context.params;
    const gradeData = change.after.val();
    const db = admin.database();

    // Find all parents linked to this student
    const parentsSnap = await db.ref('parents').once('value');
    const parentsData = parentsSnap.val() || {};

    const parentUids = Object.entries(parentsData)
      .filter(([, parent]) => parent?.children?.[studentUid] === true)
      .map(([parentUid]) => parentUid);

    if (parentUids.length === 0) return null;

    // Get student name
    const studentSnap = await db.ref(`Users/${studentUid}`).once('value');
    const studentData = studentSnap.val() || {};
    const studentName = `${studentData.firstName || ''} ${studentData.lastInitial || ''}`.trim() || 'Your child';

    // Get class name
    const classSnap = await db.ref(`classes/${classId}/name`).once('value');
    const className = classSnap.val() || classId;

    const notification = {
      type: 'grade',
      title: `New Grade: ${gradeData.name || 'Assignment'}`,
      body: `${studentName} received ${gradeData.score}/${gradeData.maxScore} in ${className}`,
      classId,
      assignmentId,
      createdAt: Date.now(),
      read: false,
    };

    const writes = parentUids.map((parentUid) =>
      db.ref(`notifications/${parentUid}`).push(notification)
    );

    await Promise.all(writes);
    console.log(`Notified ${parentUids.length} parent(s) about grade for ${studentUid}`);
    return null;
  });
```

- [ ] **Step 2: Add attendance notification trigger for parents**

Add to `functions/index.js`:

```javascript
exports.notifyParentOnAbsence = functions.database
  .ref('/attendance/{classId}/{date}/{studentUid}')
  .onWrite(async (change, context) => {
    if (!change.after.exists()) return null;

    const status = change.after.val();
    if (status !== 'absent') return null;

    const { classId, date, studentUid } = context.params;
    const db = admin.database();

    // Find parents
    const parentsSnap = await db.ref('parents').once('value');
    const parentsData = parentsSnap.val() || {};

    const parentUids = Object.entries(parentsData)
      .filter(([, parent]) => parent?.children?.[studentUid] === true)
      .map(([parentUid]) => parentUid);

    if (parentUids.length === 0) return null;

    const studentSnap = await db.ref(`Users/${studentUid}`).once('value');
    const studentData = studentSnap.val() || {};
    const studentName = `${studentData.firstName || ''} ${studentData.lastInitial || ''}`.trim() || 'Your child';

    const classSnap = await db.ref(`classes/${classId}/name`).once('value');
    const className = classSnap.val() || classId;

    const notification = {
      type: 'attendance',
      title: 'Absence Alert',
      body: `${studentName} was marked absent in ${className} on ${date}`,
      classId,
      createdAt: Date.now(),
      read: false,
    };

    const writes = parentUids.map((parentUid) =>
      db.ref(`notifications/${parentUid}`).push(notification)
    );

    await Promise.all(writes);
    console.log(`Notified ${parentUids.length} parent(s) about absence for ${studentUid}`);
    return null;
  });
```

- [ ] **Step 3: Deploy functions**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions
```

Expected: `Deploy complete!` with `notifyParentOnGrade` and `notifyParentOnAbsence` listed.

- [ ] **Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat: add in-app notifications for parents on grade and absence

RTDB triggers notify all linked parents when a grade is posted or
their child is marked absent."
```

---

## Task 11: Email Notifications via Cloud Functions

**Files:**
- Modify: `functions/index.js` (add email sending)
- Modify: `functions/package.json` (add nodemailer dependency)

- [ ] **Step 1: Install nodemailer in functions**

Run:
```bash
cd C:\Users\shiva\Code\school-portal\functions && npm install nodemailer
```

- [ ] **Step 2: Set Firebase environment config for email**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase functions:config:set email.user="your-email@gmail.com" email.pass="your-app-password" email.from="StudentTrack <noreply@studenttrack.ng>"
```

Note: Replace with actual credentials. For Gmail, use an App Password (not the main password). For production, switch to SendGrid or a transactional email service.

- [ ] **Step 3: Add email sending helper to functions/index.js**

Add at the top of `functions/index.js`, after the existing requires:

```javascript
const nodemailer = require('nodemailer');

const getMailTransport = () => {
  const emailConfig = functions.config().email || {};
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailConfig.user || '',
      pass: emailConfig.pass || '',
    },
  });
};

const sendNotificationEmail = async (toEmail, subject, htmlBody) => {
  const emailConfig = functions.config().email || {};
  if (!emailConfig.user || !emailConfig.pass) {
    console.log('Email not configured, skipping email notification');
    return;
  }

  try {
    const transport = getMailTransport();
    await transport.sendMail({
      from: emailConfig.from || 'StudentTrack <noreply@studenttrack.ng>',
      to: toEmail,
      subject,
      html: htmlBody,
    });
    console.log('Email sent to:', toEmail);
  } catch (err) {
    console.error('Email send failed:', err.message || err);
  }
};
```

- [ ] **Step 4: Add email sending to notifyParentOnGrade**

In the `notifyParentOnGrade` function, after writing the in-app notification, add email sending. After the `await Promise.all(writes)` line, add:

```javascript
// Send email notifications
const emailPromises = parentUids.map(async (parentUid) => {
  const parentSnap = await db.ref(`Users/${parentUid}/email`).once('value');
  const parentEmail = parentSnap.val();
  if (!parentEmail) return;

  const pct = gradeData.maxScore > 0
    ? ((gradeData.score / gradeData.maxScore) * 100).toFixed(1)
    : '—';

  await sendNotificationEmail(
    parentEmail,
    `New Grade: ${gradeData.name || 'Assignment'} — ${className}`,
    `<div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #3a2f24;">New Grade Posted</h2>
      <p><strong>${studentName}</strong> received a grade in <strong>${className}</strong>:</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 4px 12px; border: 1px solid #ddd;">Assignment</td><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>${gradeData.name || '—'}</strong></td></tr>
        <tr><td style="padding: 4px 12px; border: 1px solid #ddd;">Score</td><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>${gradeData.score}/${gradeData.maxScore} (${pct}%)</strong></td></tr>
        ${gradeData.type ? `<tr><td style="padding: 4px 12px; border: 1px solid #ddd;">Type</td><td style="padding: 4px 12px; border: 1px solid #ddd;">${gradeData.type.toUpperCase()}</td></tr>` : ''}
      </table>
      <p style="color: #888; font-size: 0.85em;">Log in to the Parent Portal to view full details.</p>
    </div>`
  );
});

await Promise.all(emailPromises);
```

- [ ] **Step 5: Add email sending to notifyParentOnAbsence**

In the `notifyParentOnAbsence` function, after `await Promise.all(writes)`, add:

```javascript
// Send email notifications
const emailPromises = parentUids.map(async (parentUid) => {
  const parentSnap = await db.ref(`Users/${parentUid}/email`).once('value');
  const parentEmail = parentSnap.val();
  if (!parentEmail) return;

  await sendNotificationEmail(
    parentEmail,
    `Absence Alert: ${studentName} — ${className}`,
    `<div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #c0392b;">Absence Alert</h2>
      <p><strong>${studentName}</strong> was marked <strong>absent</strong> in <strong>${className}</strong> on <strong>${date}</strong>.</p>
      <p>If this is unexpected, please contact the school or your child's teacher through the Parent Portal.</p>
      <p style="color: #888; font-size: 0.85em;">Log in to the Parent Portal to view attendance history.</p>
    </div>`
  );
});

await Promise.all(emailPromises);
```

- [ ] **Step 6: Deploy functions**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions
```

Expected: `Deploy complete!`

- [ ] **Step 7: Commit**

```bash
git add functions/index.js functions/package.json functions/package-lock.json
git commit -m "feat: add email notifications for parents on grade and absence

Uses nodemailer with Gmail transport. Sends HTML formatted emails
alongside in-app notifications. Configured via Firebase functions config."
```

---

## Task 12: Backfill Parent Codes for Existing Students

**Files:**
- Modify: `functions/index.js` (add one-time backfill callable)

- [ ] **Step 1: Add backfill function**

Add to `functions/index.js`:

```javascript
exports.backfillParentCodes = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }

  const db = admin.database();
  const usersSnap = await db.ref('Users').once('value');
  const users = usersSnap.val() || {};

  let generated = 0;
  let skipped = 0;

  for (const [uid, userData] of Object.entries(users)) {
    if (userData.role !== 'student') continue;
    if (userData.parentCode) {
      skipped++;
      continue;
    }

    let code = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateParentCode();
      const existing = await db.ref(`parentCodes/${candidate}`).once('value');
      if (!existing.exists()) {
        code = candidate;
        break;
      }
    }

    if (code) {
      await db.ref(`parentCodes/${code}`).set({
        studentUid: uid,
        studentEmail: userData.email || '',
        studentName: `${userData.firstName || ''} ${userData.lastInitial || ''}`.trim(),
        createdAt: Date.now(),
      });
      await db.ref(`Users/${uid}/parentCode`).set(code);
      generated++;
    }
  }

  return { success: true, generated, skipped };
});
```

- [ ] **Step 2: Add a backfill trigger button in AdminDashboard**

In `src/AdminDashboard.jsx`, add a button in the School Settings section:

```jsx
<button
  className="btn btn-ghost"
  style={{ marginTop: 8 }}
  onClick={async () => {
    try {
      const backfill = httpsCallable(functions, "backfillParentCodes");
      const result = await backfill();
      addToast(
        "success",
        `Parent codes: ${result.data.generated} generated, ${result.data.skipped} already had codes.`
      );
    } catch (err) {
      console.error("Backfill error:", err);
      addToast("error", "Failed to backfill parent codes.");
    }
  }}
>
  Generate Parent Codes for Existing Students
</button>
```

Make sure `httpsCallable` is imported:
```javascript
import { httpsCallable } from "firebase/functions";
```

And `functions` is imported from firebase.js:
```javascript
import { auth, db, functions } from "./firebase";
```

- [ ] **Step 3: Deploy functions**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions
```

Expected: `Deploy complete!` with `backfillParentCodes` listed.

- [ ] **Step 4: Build and verify**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add functions/index.js src/AdminDashboard.jsx
git commit -m "feat: add parent code backfill for existing students

Admin-only callable function generates parent codes for students
that don't have one yet. Button added to admin school settings."
```

---

## Task 13: Responsive Mobile-First Styles

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add mobile-responsive styles**

Add the following at the end of `src/index.css`:

```css
/* ── Parent Portal & Mobile-First Responsive ── */

/* Parent code display */
.parent-code {
  font-family: monospace;
  letter-spacing: 0.1em;
  background: var(--border);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  user-select: all;
}

/* Tab navigation - mobile friendly */
.tab-nav {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.tab-nav .btn {
  flex: 1;
  min-width: 0;
  text-align: center;
}

/* Child switcher pills */
.child-switcher {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0;
}

.child-switcher .btn {
  flex: 0 0 auto;
}

/* Attendance color chips */
.attendance-chip {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 0.75rem;
}

.attendance-chip--present { background: var(--accent); }
.attendance-chip--tardy { background: #e67e22; }
.attendance-chip--absent { background: var(--error, #c0392b); }
.attendance-chip--excused { background: #7f8c8d; }

/* Modal backdrop */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-content {
  max-width: 420px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

/* Grade table responsive */
.grade-table {
  width: 100%;
  border-collapse: collapse;
}

.grade-table th,
.grade-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}

.grade-table th {
  font-weight: 600;
  font-size: 0.85rem;
}

/* Mobile breakpoint */
@media (max-width: 600px) {
  .app-container {
    padding: 8px;
  }

  .card {
    padding: 12px;
  }

  .card-header h2,
  .card-header h3 {
    font-size: 1.1rem;
  }

  .form-row {
    flex-direction: column;
    gap: 8px;
  }

  .tab-nav .btn {
    font-size: 0.85rem;
    padding: 8px 12px;
  }

  /* Stack grade table on mobile */
  .grade-table thead {
    display: none;
  }

  .grade-table tr {
    display: block;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }

  .grade-table td {
    display: block;
    border: none;
    padding: 2px 0;
    font-size: 0.9rem;
  }

  .grade-table td::before {
    content: attr(data-label);
    font-weight: 600;
    margin-right: 8px;
    font-size: 0.8rem;
    color: var(--muted);
  }

  /* Compact header on mobile */
  .app-header {
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px 12px;
  }

  .header-actions {
    gap: 4px;
  }

  .header-actions .btn {
    padding: 4px 8px;
    font-size: 0.8rem;
  }

  /* Summary card compact */
  .summary-stats {
    flex-direction: column;
    gap: 4px;
  }
}

@media (max-width: 400px) {
  .child-switcher .btn {
    flex: 1 1 calc(50% - 4px);
    font-size: 0.8rem;
  }

  .attendance-chip {
    font-size: 0.65rem;
    padding: 1px 4px;
  }
}
```

- [ ] **Step 2: Build and verify**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add responsive mobile-first styles for parent portal

Mobile breakpoints at 600px and 400px. Grade tables stack on mobile,
tabs fill width, modal centers with padding, attendance chips compact."
```

---

## Task 14: Final Build, Deploy, and Verify

**Files:** None new — deployment task.

- [ ] **Step 1: Run a full build**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npm run build
```

Expected: Build succeeds with all new components included in output.

- [ ] **Step 2: Deploy everything**

Run:
```bash
cd C:\Users\shiva\Code\school-portal && npx firebase deploy --only functions,database,hosting
```

Expected: `Deploy complete!` — functions, database rules, and hosting all deployed.

- [ ] **Step 3: Verify the deployment**

Open https://kgrades.web.app and verify:

1. Login page shows "Are you a parent? Sign up here" link
2. `/parent-signup` page loads with parent code input
3. Student dashboard shows parent code (for existing students, run backfill first)
4. Teacher grade entry form has CA/Exam type selector
5. Admin dashboard has School Settings section with CA/Exam weight inputs
6. Admin dashboard has "Generate Parent Codes for Existing Students" button

- [ ] **Step 4: Test the full parent flow**

1. Log in as admin → click "Generate Parent Codes for Existing Students"
2. Log in as a student → note the parent code shown on dashboard
3. Open incognito → go to `/parent-signup` → enter code, create parent account
4. Verify parent dashboard loads with child's grades, attendance, assignments
5. Test messaging: open messaging panel, verify teacher appears as contact option
6. Test notifications: log in as teacher, post a grade → verify parent sees notification

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete parent portal with all features

Parent signup via student codes, multi-child dashboard, CA/Exam
weighted grading, parent-teacher messaging, in-app + email
notifications, responsive mobile-first design."
```

---

## Summary of All New Firebase Paths

| Path | Purpose |
|---|---|
| `parentCodes/{code}` | Maps parent code → student UID |
| `parents/{parentUid}/children/{studentUid}` | Parent-child links |
| `schoolSettings/{schoolId}` | CA/Exam weight configuration |
| `Users/{uid}/parentCode` | Student's auto-generated parent code |

## Summary of All New Cloud Functions

| Function | Trigger | Purpose |
|---|---|---|
| `onStudentCreated` | RTDB onCreate `Users/{uid}` | Auto-generates parent code for new students |
| `claimParentCode` | HTTPS callable | Creates parent account and links to child |
| `linkAdditionalChild` | HTTPS callable | Links existing parent to another child |
| `notifyParentOnGrade` | RTDB onWrite `grades/{uid}/{class}/assignments/{id}` | In-app + email notification to parents |
| `notifyParentOnAbsence` | RTDB onWrite `attendance/{class}/{date}/{uid}` | In-app + email alert for absences |
| `backfillParentCodes` | HTTPS callable (admin) | Generates codes for existing students |
