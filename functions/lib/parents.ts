import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  normalizeEmail,
  generateParentCode,
  UserRecord,
  ParentCodeRecord,
} from './validation';

// --- auto-generate parent code on student creation ---
export const onStudentCreated = functions.database
  .ref('/Users/{uid}')
  .onCreate(
    async (snapshot: functions.database.DataSnapshot, context: functions.EventContext) => {
      const userData = (snapshot.val() as UserRecord) || {};
      const uid = context.params['uid'] as string;

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
    }
  );

interface ClaimParentCodeData {
  code?: unknown;
  firstName?: unknown;
  lastInitial?: unknown;
}

export const claimParentCode = functions.https.onCall(
  async (data: ClaimParentCodeData, context: functions.https.CallableContext) => {
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

    const codeData = (codeSnap.val() as ParentCodeRecord) || {};
    const studentUid = codeData.studentUid;

    if (!studentUid) {
      throw new functions.https.HttpsError('failed-precondition', 'Invalid parent code data');
    }

    const studentSnap = await db.ref(`Users/${studentUid}`).once('value');
    if (!studentSnap.exists()) {
      throw new functions.https.HttpsError('not-found', 'Student account not found');
    }

    const parentSnap = await db.ref(`Users/${uid}`).once('value');
    const existingUser = parentSnap.exists() ? (parentSnap.val() as UserRecord) : null;
    const existingRole = existingUser?.role || null;

    if (existingRole && existingRole !== 'parent') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Existing non-parent accounts cannot claim a parent code'
      );
    }

    const isExistingParent = existingRole === 'parent';

    if (!isExistingParent) {
      const firstName = typeof data?.firstName === 'string' ? data.firstName.trim() : '';
      const lastInitial =
        typeof data?.lastInitial === 'string'
          ? data.lastInitial.trim().charAt(0).toUpperCase()
          : '';

      const authUser = await admin.auth().getUser(uid);
      let wroteUserRecord = false;
      let linkedChild = false;

      try {
        await db.ref(`Users/${uid}`).set({
          email: normalizeEmail(authUser.email),
          role: 'parent',
          firstName,
          lastInitial,
          createdAt: Date.now(),
        });
        wroteUserRecord = true;

        await db.ref(`parents/${uid}/children/${studentUid}`).set(true);
        linkedChild = true;

        await admin.auth().setCustomUserClaims(uid, { parent: true });
      } catch (err) {
        const cleanup: Array<Promise<unknown>> = [];
        if (linkedChild) {
          cleanup.push(db.ref(`parents/${uid}/children/${studentUid}`).set(null));
        }
        if (wroteUserRecord) {
          cleanup.push(db.ref(`Users/${uid}`).set(null));
        }
        if (cleanup.length > 0) {
          await Promise.allSettled(cleanup);
        }
        throw err;
      }
    } else {
      await db.ref(`parents/${uid}/children/${studentUid}`).set(true);
    }

    const studentData = (studentSnap.val() as UserRecord) || {};
    return {
      success: true,
      studentName: `${studentData.firstName || ''} ${studentData.lastInitial || ''}`.trim(),
      studentId: studentData.studentId || '',
    };
  }
);

interface LinkChildData {
  code?: unknown;
}

export const linkAdditionalChild = functions.https.onCall(
  async (data: LinkChildData, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
    }

    const uid = context.auth.uid;
    const db = admin.database();

    const userSnap = await db.ref(`Users/${uid}`).once('value');
    if (!userSnap.exists() || (userSnap.val() as UserRecord)?.role !== 'parent') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only parent accounts can link children'
      );
    }

    const code = String(data?.code || '').trim().toUpperCase();

    if (!code || !/^KGR-[A-Z0-9]{4}$/.test(code)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid parent code format');
    }

    const codeSnap = await db.ref(`parentCodes/${code}`).once('value');
    if (!codeSnap.exists()) {
      throw new functions.https.HttpsError('not-found', 'Parent code not found');
    }

    const studentUid = (codeSnap.val() as ParentCodeRecord).studentUid;
    if (!studentUid) {
      throw new functions.https.HttpsError('failed-precondition', 'Invalid parent code data');
    }

    const studentSnap = await db.ref(`Users/${studentUid}`).once('value');
    if (!studentSnap.exists()) {
      throw new functions.https.HttpsError('not-found', 'Student account not found');
    }

    const existingLink = await db.ref(`parents/${uid}/children/${studentUid}`).once('value');
    if (existingLink.exists()) {
      throw new functions.https.HttpsError(
        'already-exists',
        'This child is already linked to your account'
      );
    }

    await db.ref(`parents/${uid}/children/${studentUid}`).set(true);

    const studentData = (studentSnap.val() as UserRecord) || {};
    return {
      success: true,
      studentName: `${studentData.firstName || ''} ${studentData.lastInitial || ''}`.trim(),
      studentId: studentData.studentId || '',
    };
  }
);

export const backfillParentCodes = functions.https.onCall(
  async (_data: unknown, context: functions.https.CallableContext) => {
    if (!context.auth || !context.auth.token || context.auth.token['admin'] !== true) {
      throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
    }

    const db = admin.database();
    const usersSnap = await db.ref('Users').once('value');
    const users = (usersSnap.val() as Record<string, UserRecord>) || {};

    let generated = 0;
    let skipped = 0;

    for (const [uid, userData] of Object.entries(users)) {
      if (userData.role !== 'student') continue;
      if (userData.parentCode) {
        skipped++;
        continue;
      }

      let code: string | null = null;
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
  }
);
