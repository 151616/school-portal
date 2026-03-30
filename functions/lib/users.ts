import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { type UserRecord } from './validation';

interface DeleteUserData {
  uid?: unknown;
}

export const deleteUserByAdmin = functions.https.onCall(
  async (data: DeleteUserData, context: functions.https.CallableContext) => {
    if (!context.auth || !context.auth.token || context.auth.token['admin'] !== true) {
      throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
    }

    const { uid } = data || {};
    if (!uid) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing uid');
    }

    const targetUid = String(uid);

    if (targetUid === context.auth.uid) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Admins cannot delete their own account'
      );
    }

    const db = admin.database();

    const callerSchoolId = (context.auth.token['schoolId'] as string | undefined) || null;
    if (callerSchoolId) {
      const targetSnap = await db.ref(`Users/${targetUid}`).once('value');
      const targetSchoolId = (targetSnap.val() as UserRecord)?.schoolId || null;
      if (targetSchoolId !== callerSchoolId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot delete users from another school'
        );
      }
    }

    try {
      await admin.auth().deleteUser(targetUid);
    } catch (err) {
      const firebaseErr = err as { code?: string; message?: string };
      if (firebaseErr && firebaseErr.code !== 'auth/user-not-found') {
        throw new functions.https.HttpsError('internal', firebaseErr.message || String(err));
      }
    }

    await db.ref(`Users/${targetUid}`).set(null);
    await db.ref(`grades/${targetUid}`).set(null);
    await db.ref(`teachers/${targetUid}`).set(null);

    try {
      const classesSnap = await db.ref('classes').once('value');
      const classesData =
        (classesSnap.val() as Record<string, { students?: Record<string, boolean> }>) || {};
      const rosterRemovals = Object.keys(classesData)
        .filter((classId) => classesData[classId]?.students?.[targetUid])
        .map((classId) => db.ref(`classes/${classId}/students/${targetUid}`).set(null));
      await Promise.all(rosterRemovals);
    } catch (err) {
      console.warn('deleteUserByAdmin: class roster cleanup failed', {
        uid: targetUid,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await db.ref(`threadIndex/${targetUid}`).set(null);
    } catch (err) {
      console.warn('deleteUserByAdmin: threadIndex cleanup failed', {
        uid: targetUid,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await db.ref(`notifications/${targetUid}`).set(null);

    return { success: true };
  }
);
