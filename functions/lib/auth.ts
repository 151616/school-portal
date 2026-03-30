import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  normalizeEmail,
  emailRegex,
  ALLOWED_ROLES,
  SCHOOL_ID_REGEX,
  generateUniqueStudentId,
  UserRecord,
  InviteRecord,
} from './validation';

// --- existing invite validation trigger ---
export const validateInviteOnCreate = functions.database
  .ref('/invites/{inviteId}')
  .onCreate(
    async (snapshot: functions.database.DataSnapshot, context: functions.EventContext) => {
      const invite = (snapshot.val() as InviteRecord) || {};
      const inviteId = context.params['inviteId'] as string;

      const email = normalizeEmail(invite.email);
      const role = invite.role;
      const createdBy = invite.createdBy;

      if (!email || !role || !createdBy || !emailRegex.test(email) || !ALLOWED_ROLES.has(role)) {
        console.log('Invalid invite data for', inviteId, invite);
        return snapshot.ref.remove();
      }

      const db = admin.database();
      const creatorSnap = await db.ref(`Users/${createdBy}`).once('value');
      const creatorRole = creatorSnap.child('role').val() as string | null;
      if (creatorRole !== 'admin') {
        console.log('Invite creator is not an admin. Removing invite:', createdBy);
        return snapshot.ref.remove();
      }

      const usersSnap = await db.ref('Users').orderByChild('email').equalTo(email).once('value');
      if (usersSnap.exists()) {
        console.log('User already exists with email, removing invite:', email);
        return snapshot.ref.remove();
      }

      const invitesSnap = await db
        .ref('invites')
        .orderByChild('email')
        .equalTo(email)
        .once('value');
      let pendingCount = 0;
      invitesSnap.forEach((childSnap) => {
        const childInvite = childSnap.val() as InviteRecord | null;
        if (childSnap.key !== inviteId && childInvite && !childInvite.used) {
          pendingCount += 1;
        }
      });

      if (pendingCount > 0) {
        console.log(
          'An existing pending invite exists for this email. Removing new invite:',
          email
        );
        return snapshot.ref.remove();
      }

      await snapshot.ref.update({ email });
      console.log('Invite validated for email:', email);
      return null;
    }
  );

interface CreateInviteData {
  email?: unknown;
  role?: unknown;
  firstName?: unknown;
  lastInitial?: unknown;
  studentId?: unknown;
  schoolId?: unknown;
}

export const createInvite = functions.https.onCall(
  async (data: CreateInviteData, context: functions.https.CallableContext) => {
    if (!context.auth || !context.auth.token || context.auth.token['admin'] !== true) {
      throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
    }

    const email = normalizeEmail(data?.email);
    const role = String(data?.role || 'student').trim().toLowerCase();
    const firstName = typeof data?.firstName === 'string' ? data.firstName.trim() : '';
    const lastInitial =
      typeof data?.lastInitial === 'string'
        ? data.lastInitial.trim().charAt(0).toUpperCase()
        : '';
    const requestedStudentId =
      typeof data?.studentId === 'string' ? data.studentId.trim() : '';
    const requestedSchoolId = String(data?.schoolId || '').trim();
    const callerSchoolId = (context.auth.token['schoolId'] as string | undefined) || null;
    const effectiveSchoolId =
      callerSchoolId ||
      (SCHOOL_ID_REGEX.test(requestedSchoolId) ? requestedSchoolId : null);

    if (!email || !emailRegex.test(email)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email format');
    }

    if (!ALLOWED_ROLES.has(role)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid role');
    }

    const db = admin.database();
    const [usersSnap, invitesSnap] = await Promise.all([
      db.ref('Users').once('value'),
      db.ref('invites').once('value'),
    ]);

    const usersData = (usersSnap.val() as Record<string, UserRecord>) || {};
    const invitesData = (invitesSnap.val() as Record<string, InviteRecord>) || {};
    const emailExistsInUsers = Object.values(usersData).some(
      (user) => normalizeEmail(user?.email) === email
    );
    if (emailExistsInUsers) {
      throw new functions.https.HttpsError('already-exists', 'This email already has an account');
    }

    const emailExistsInInvites = Object.values(invitesData).some(
      (invite) => normalizeEmail(invite?.email) === email && invite?.used !== true
    );
    if (emailExistsInInvites) {
      throw new functions.https.HttpsError(
        'already-exists',
        'An invite for this email already exists'
      );
    }

    const studentId =
      role === 'student'
        ? generateUniqueStudentId(usersData, invitesData, requestedStudentId)
        : requestedStudentId;

    const inviteRef = db.ref('invites').push();
    await inviteRef.set({
      email,
      role,
      studentId,
      createdAt: Date.now(),
      used: false,
      createdBy: context.auth.uid,
      firstName,
      lastInitial,
      schoolId: effectiveSchoolId || '',
    });

    return {
      success: true,
      inviteId: inviteRef.key,
      email,
      role,
      studentId,
    };
  }
);

interface AssignRoleData {
  inviteId?: unknown;
  firstName?: unknown;
  lastInitial?: unknown;
}

interface ClaimRecord {
  uid?: string;
  claimedAt?: number;
}

// --- callable function to assign role on signup ---
export const assignRoleFromInvite = functions.https.onCall(
  async (data: AssignRoleData, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
    }

    const { inviteId, firstName, lastInitial } = data || {};
    const uid = context.auth.uid;

    if (!inviteId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing inviteId');
    }

    const authUser = await admin.auth().getUser(uid);
    const authEmail = normalizeEmail(authUser.email);
    if (!authEmail) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Signed-in account is missing an email address'
      );
    }

    const inviteRef = admin.database().ref(`invites/${inviteId}`);
    const preSnap = await inviteRef.once('value');
    if (!preSnap.exists()) {
      console.warn('assignRoleFromInvite: invite missing', { inviteId });
      throw new functions.https.HttpsError('not-found', 'Invite not found');
    }

    const preInvite = (preSnap.val() as InviteRecord) || {};
    const preInviteEmail = normalizeEmail(preInvite.email);
    const preRole = preInvite.role;
    const preUsed = preInvite.used === true;

    if (!preInviteEmail || preInviteEmail !== authEmail) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Signed-in email does not match this invite'
      );
    }

    if (!preRole || !ALLOWED_ROLES.has(preRole)) {
      throw new functions.https.HttpsError('failed-precondition', 'Invite role is invalid');
    }

    const claimedAt = Date.now();
    const claimRef = admin.database().ref(`inviteClaims/${inviteId}`);
    let claimState = 'not-run';
    let claimOwnerUid: string | null = preInvite.usedBy || null;
    let claimTimestamp: number = preInvite.usedAt || claimedAt;

    if (preUsed) {
      claimState =
        preInvite.usedBy === uid ? 'already-claimed-by-caller' : 'already-used';
    } else {
      await claimRef.transaction((currentClaim: ClaimRecord | null) => {
        if (currentClaim && currentClaim.uid && currentClaim.uid !== uid) {
          claimState = 'claimed-by-other';
          return currentClaim;
        }

        if (currentClaim && currentClaim.uid === uid) {
          claimState = 'already-claimed-by-caller';
          return currentClaim;
        }

        claimState = 'claimed';
        return {
          uid,
          claimedAt,
        };
      });

      const claimSnap = await claimRef.once('value');
      if (!claimSnap.exists()) {
        console.error('assignRoleFromInvite: claim lock missing', { inviteId, claimState });
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Invite claim lock did not persist'
        );
      }

      const claim = (claimSnap.val() as ClaimRecord) || {};
      claimOwnerUid = claim.uid || null;
      claimTimestamp = claim.claimedAt || claimedAt;
    }

    if (claimOwnerUid !== uid) {
      throw new functions.https.HttpsError('failed-precondition', 'Invite already used');
    }

    const finalSnap = await inviteRef.once('value');
    if (!finalSnap.exists()) {
      console.error('assignRoleFromInvite: invite missing during finalize', {
        inviteId,
        claimState,
      });
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Invite became unavailable during claim'
      );
    }

    const invite = (finalSnap.val() as InviteRecord) || {};
    const inviteEmail = normalizeEmail(invite.email);
    if (!inviteEmail || inviteEmail !== authEmail) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Signed-in email does not match this invite'
      );
    }

    if (!invite.role || !ALLOWED_ROLES.has(invite.role)) {
      throw new functions.https.HttpsError('failed-precondition', 'Invite role is invalid');
    }

    if (invite.used === true && invite.usedBy && invite.usedBy !== uid) {
      throw new functions.https.HttpsError('failed-precondition', 'Invite already used');
    }

    const shouldFinalizeInvite =
      invite.used !== true ||
      invite.usedBy !== uid ||
      normalizeEmail(invite.email) !== preInviteEmail ||
      invite.usedAt !== claimTimestamp;

    if (shouldFinalizeInvite) {
      await inviteRef.update({
        email: preInviteEmail,
        used: true,
        usedBy: uid,
        usedAt: claimTimestamp,
      });
    }

    const persistedSnap = await inviteRef.once('value');
    if (!persistedSnap.exists()) {
      console.error('assignRoleFromInvite: invite missing after finalize', {
        inviteId,
        claimState,
      });
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Invite became unavailable during finalize'
      );
    }

    const persistedInvite = (persistedSnap.val() as InviteRecord) || {};
    const role = persistedInvite.role;
    const studentId = persistedInvite.studentId || '';
    const schoolId = persistedInvite.schoolId || null;
    const createdAt = persistedInvite.usedAt || claimTimestamp;
    const safeFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const safeLastInitial =
      typeof lastInitial === 'string' ? lastInitial.trim().charAt(0).toUpperCase() : '';

    if (persistedInvite.used !== true) {
      throw new functions.https.HttpsError('failed-precondition', 'Invite claim did not persist');
    }

    if (persistedInvite.usedBy !== uid) {
      throw new functions.https.HttpsError('failed-precondition', 'Invite already used');
    }

    await admin.auth().setCustomUserClaims(uid, {
      [role as string]: true,
      ...(schoolId ? { schoolId } : {}),
    });

    await admin.database().ref(`Users/${uid}`).set({
      email: normalizeEmail(persistedInvite.email),
      role,
      firstName: safeFirstName,
      lastInitial: safeLastInitial,
      studentId,
      createdAt,
      ...(schoolId ? { schoolId } : {}),
    });

    try {
      await claimRef.remove();
    } catch (err) {
      console.warn('assignRoleFromInvite: claim cleanup failed', {
        inviteId,
        uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { success: true, role };
  }
);
