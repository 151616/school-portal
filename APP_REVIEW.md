# School Portal Review

## App Overview

This repository is a role-based school portal and gradebook built with React and Vite on the frontend and Firebase on the backend.

The current product supports:

- email/password login
- Google sign-in
- invite-based signup
- separate student, teacher, and admin dashboards
- class creation and enrollment management
- grade entry by teachers and grade viewing by students
- attendance tracking
- in-app messaging
- student notifications
- admin diagnostics and audit logging

The current source of truth appears to be Firebase Realtime Database plus Cloud Functions. Firestore and Data Connect files exist in the repository, but they do not appear to be central to the current UI flows that were reviewed.

This report is documentation-only. It describes current behavior, likely bugs, and practical improvements. It does not change production code, config, or rules.

## Current Architecture

- Frontend: React 19 with Vite and React Router.
- Backend services: Firebase Authentication, Firebase Realtime Database, and Firebase Cloud Functions.
- Auth flow: users sign in with email/password or Google, and invite-based signup calls a callable Cloud Function to assign a role and create the user record.
- Routing: `src/App.jsx` decides whether to show login, settings, privacy, or a role-specific dashboard.
- Role model: users are assigned `student`, `teacher`, or `admin`.
- Teacher features: class selection, grade entry, assignment templates, attendance, and messaging.
- Student features: grade viewing, progress summary, notifications, and messaging.
- Admin features: user and invite management, class and roster operations, diagnostics, and audit log viewing.
- Data layer: most user, class, grade, attendance, thread, message, notification, and audit data is stored in Realtime Database.
- Security layer: authorization is primarily enforced with Realtime Database rules plus admin-only callable Cloud Functions.
- Deployment shape: the repo is configured for Firebase Hosting and Firebase Functions, while the frontend is built with Vite.

### Likely Future API / Interface Changes

- `package.json` will likely need a root dependency change to add the missing `firebase` client SDK package.
- `firebase.json` will likely need deployment config changes so Hosting serves built Vite assets instead of the placeholder `public` folder.
- `functions/index.js` will likely need a stricter `assignRoleFromInvite` callable contract that verifies the authenticated user's email and uses transaction-safe invite claiming.
- `database.rules.json` will likely need follow-up rule changes for attendance visibility, notification writes, and invite handling.
- The assignment data model will likely need new fields such as stable assignment IDs, categories, due dates, and weighting metadata.

## High-Priority Bugs / Risks

### 1. Missing client Firebase SDK dependency

- Severity: High
- Area: Build
- What is happening: The frontend imports `firebase/auth`, `firebase/database`, and `firebase/functions`, but the root `package.json` does not include the `firebase` package in dependencies.
- Why it matters: `npm run build` currently fails because Vite cannot resolve `firebase/auth`, which makes this a release blocker.
- Suggested fix: Add the `firebase` client SDK to the root app dependencies, reinstall packages, and rerun `npm run build` to confirm the frontend can bundle correctly.

### 2. Firebase Hosting is pointed at the wrong folder

- Severity: High
- Area: Hosting
- What is happening: `firebase.json` serves Hosting from `public`, while `public/index.html` is still the default Firebase Hosting placeholder page.
- Why it matters: A Vite app normally deploys compiled assets from `dist`, so the current Hosting config is likely to deploy the placeholder page instead of the actual app. This is a deployment blocker.
- Suggested fix: Update Hosting to serve the Vite build output folder and ensure deployment uses the generated production assets rather than the default Firebase starter page.

### 3. Invite claim flow has a security flaw

- Severity: High
- Area: Security
- What is happening: In `functions/index.js`, `assignRoleFromInvite` trusts `inviteId` but does not verify that the authenticated user's email matches the invited email. It also performs a read-check-write flow without a transaction when marking invites as used.
- Why it matters: Any authenticated user who obtains a valid invite ID could potentially consume that invite and receive the invited role. The non-transactional flow also creates a race condition if the same invite is used twice at nearly the same time.
- Suggested fix: Validate the authenticated user's verified email against the invite email on the server, and move invite consumption to a transaction or other atomic server-side claim flow.

### 4. Firestore rules are open and about to expire

- Severity: High
- Area: Rules
- What is happening: `firestore.rules` allows broad read and write access until `March 4, 2026`. Today is `March 2, 2026`, so the expiration is two days away.
- Why it matters: If any Firestore or Data Connect path is actually used, behavior may stop working immediately after the rule expiration. Even if Firestore is not currently central, open temporary rules are still a security and maintenance risk.
- Suggested fix: Audit whether Firestore is actively used, replace the temporary rule with explicit least-privilege rules, and remove or clarify unused Firestore/Data Connect dependencies if they are not part of the active app.

## Medium-Priority Issues

### 5. Signup can leave partial or orphaned accounts

- Severity: Medium
- Area: Auth
- What is happening: `src/Signup.jsx` creates the Firebase Auth user before the callable function assigns the role, writes the user record, and marks the invite as used.
- Why it matters: If the callable fails after Auth account creation, the user can be left with an account that exists in Auth but has no usable role or complete app profile.
- Suggested fix: Add rollback handling for failed post-signup steps or redesign onboarding so the server performs the critical account setup atomically.

### 6. Admin diagnostics helper contains a runtime bug and dead code

- Severity: Medium
- Area: Maintainability
- What is happening: `src/AdminDashboard.jsx` defines `runDiagnosticsHelper`, but that helper is not used. Inside the helper, `uid` is referenced without being defined.
- Why it matters: Dead debugging code increases confusion, and the undefined variable would cause runtime failure if the helper were ever invoked.
- Suggested fix: Remove the unused helper entirely or fix it and wire it into the live diagnostics flow so there is one supported path for troubleshooting.

### 7. ESLint configuration is mis-scoped

- Severity: Medium
- Area: Tooling
- What is happening: `eslint.config.js` treats all `js` and `jsx` files as browser code and does not properly exclude generated files and Node-only scripts.
- Why it matters: `npm run lint` currently fails on `require`, `module`, and `process` usage in `functions`, `scripts`, and generated CommonJS files, which creates noisy failures and hides real frontend issues.
- Suggested fix: Split ESLint config into browser and Node contexts, explicitly ignore generated artifacts, and update flat-config handling so lint results are meaningful.

### 8. Admin dashboard is overly large and high-risk to maintain

- Severity: Medium
- Area: Maintainability
- What is happening: `src/AdminDashboard.jsx` is a very large, state-heavy component that combines many unrelated admin workflows in one file.
- Why it matters: This makes behavior harder to reason about, increases regression risk, and raises the cost of future changes.
- Suggested fix: Break the admin surface into smaller feature-specific components and custom hooks before continuing to expand admin functionality.

### 9. Email verification is not enforced

- Severity: Medium
- Area: Auth
- What is happening: `src/App.jsx` shows a banner when `emailVerified` is false, but unverified users can still access their dashboards.
- Why it matters: If email verification is intended as an actual access requirement, the current implementation only warns users and does not enforce policy.
- Suggested fix: Decide whether verification is mandatory. If it is, gate dashboard access until verification is complete and make exceptions explicit for any allowed roles or flows.

### 10. Some client writes can fail silently or create noisy UX

- Severity: Medium
- Area: UX
- What is happening: Some client updates, such as notification read writes in `src/StudentDashboard.jsx`, are not awaited, and teacher grade saves can generate multiple notifications per student in one action.
- Why it matters: Unawaited writes can fail without clear user feedback, and high notification volume can make alerts less useful.
- Suggested fix: Await important client writes, add error handling where user-visible state changes depend on writes, and consider batching or summarizing grade notifications.

## Product Improvements / Features to Add

### 1. Gradebook structure improvements

- Idea: Add assignment categories, due dates, and weighted grading, and stop using same-name slug collisions as the primary assignment identity.
- User value: Teachers get a more realistic gradebook, and students see more accurate course progress.
- Suggested implementation direction: Introduce stable assignment IDs plus metadata fields for category, due date, weighting, and status, then compute averages from structured assignment records instead of relying only on slugified names.

### 2. Stronger onboarding and admin controls

- Idea: Add invite expiration, resend, revoke, and better failed-signup recovery.
- User value: Admins gain safer user provisioning, and invited users are less likely to get stuck in broken signup states.
- Suggested implementation direction: Extend invite records with expiration and resend metadata, add revoke actions in the admin UI, and add a server-managed re-claim or retry path for incomplete onboarding.

### 3. Student-facing attendance visibility

- Idea: Add a student attendance summary screen.
- User value: Students can track absences, tardies, and trends without needing staff intervention.
- Suggested implementation direction: Expose a student-friendly attendance view in the student dashboard, but redesign current attendance rules first so student access is intentionally scoped and secure.

### 4. Better reporting and export

- Idea: Add CSV export for grades and attendance summaries, not just user lists.
- User value: Teachers and admins can use the portal for operational reporting, parent communication, and offline review.
- Suggested implementation direction: Add filtered export actions by class, date range, and student, and generate consistent CSV schemas for grades, attendance, and roster views.

### 5. Messaging improvements

- Idea: Improve unread tracking, search, timestamps, and eventually attachments.
- User value: Messaging becomes more reliable and easier to use as a real communication channel.
- Suggested implementation direction: Move unread state from localStorage-only tracking into backend data, add search and better message metadata, and plan attachments as a later phase once the core message model is stable.

### 6. Parent or guardian support

- Idea: Add guardian accounts or read-only guardian views.
- User value: Families can monitor student progress without sharing student credentials.
- Suggested implementation direction: Add a new role or linked-access model that can read student summaries without gaining edit access to teacher or admin workflows.

### 7. Reliability and quality improvements

- Idea: Add route protection tests, callable-function tests, and CI checks for build and lint.
- User value: Core flows become safer to change, and deployment blockers are caught before release.
- Suggested implementation direction: Add automated checks for role routing, signup flows, callable security, and basic build and lint verification in CI before deployment.

## Suggested Priority Order

1. Fix release blockers first: add the missing `firebase` dependency and correct the Hosting deploy target.
2. Fix backend security next: harden `assignRoleFromInvite` with email verification and transaction-safe invite claiming.
3. Stabilize rules and auth flows: address the `March 4, 2026` Firestore rule deadline, partial signup failures, and the email verification policy.
4. Clean up developer workflow: fix ESLint scoping and start decomposing the admin dashboard into smaller units.
5. Add product-value features after the platform is stable: improve the gradebook, attendance visibility, reporting, and messaging.

### Validation Checklist

1. Build validation: `npm run build` should succeed after dependency and config fixes.
2. Hosting validation: Firebase Hosting should serve the real Vite app instead of the placeholder page.
3. Invite security validation: a logged-in user whose auth email does not match the invite email must be rejected.
4. Invite race validation: reusing the same invite twice in parallel must not grant two accounts.
5. Signup failure handling: if role assignment fails after Auth creation, the system should not leave a stranded unusable account.
6. Role dashboard access: student, teacher, and admin users should land on the correct dashboard with only their allowed actions.
7. Rules validation: teachers should only write allowed class and student data, and students should only read their own grades and notifications.
8. Firestore validation: any active Firestore paths should continue to behave correctly after `March 4, 2026`.
9. Lint quality: `npm run lint` should no longer fail on Node scripts, generated files, or flat-config mismatches.

### Acceptance Criteria

- A new root `APP_REVIEW.md` file exists.
- The report clearly identifies the app as a role-based school portal and gradebook.
- The report lists prioritized bugs and risks based on actual code review.
- The report lists realistic product and reliability improvements.
- The report explicitly calls out the build failure and invite security issue as top priorities.
- The report cites the inspected files and the lint/build outcomes that support the findings.

### Assumptions and Defaults

- The report is written in Markdown.
- The file is intentionally placed at the repo root as `APP_REVIEW.md`.
- This pass is documentation-only and does not implement code fixes.
- Findings are prioritized by deployability, security, and data integrity before UX polish.
- Realtime Database appears to be the current primary data store, while Firestore and Data Connect are treated as secondary until proven otherwise.

## Evidence Used

- Reviewed `package.json` and confirmed the root app does not list the `firebase` client SDK.
- Reviewed `firebase.json` and confirmed Firebase Hosting currently serves `public`.
- Reviewed `public/index.html` and confirmed it is still the default Firebase Hosting placeholder page.
- Reviewed `database.rules.json` to understand current Realtime Database access rules.
- Reviewed `firestore.rules` and confirmed broad temporary access remains enabled until `March 4, 2026`.
- Reviewed `src/App.jsx`, `src/Login.jsx`, `src/Signup.jsx`, `src/TeacherDashboard.jsx`, `src/StudentDashboard.jsx`, `src/AdminDashboard.jsx`, `src/MessagingPanel.jsx`, `src/Settings.jsx`, and `src/firebase.js` to identify the current app shape and risky flows.
- Reviewed `functions/index.js` to inspect invite validation, role assignment, and admin delete behavior.
- Ran `npm run lint` and observed failures caused by mis-scoped flat config, generated CommonJS files, Node scripts, unused values, and a few real app issues.
- Ran `npm run build` and observed a hard failure because Vite could not resolve `firebase/auth` from `src/App.jsx`.
