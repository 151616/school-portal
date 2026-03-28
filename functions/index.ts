import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

// nodemailer is a CommonJS module; use require to avoid TS6 namespace import issues
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer') as {
  createTransport: (opts: {
    service: string;
    auth: { user: string; pass: string };
  }) => {
    sendMail: (opts: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }) => Promise<unknown>;
  };
};

type MailTransporter = ReturnType<typeof nodemailer.createTransport>;

// functions.config() was removed in firebase-functions v7 but is used here for legacy compatibility.
// Cast to any to avoid the `never` type error; runtime behavior is preserved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getFunctionsConfig = (): any => (functions as any).config();

const getMailTransport = (): MailTransporter => {
  const emailConfig = (getFunctionsConfig().email as { user?: string; pass?: string }) || {};
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailConfig.user || '',
      pass: emailConfig.pass || '',
    },
  });
};

const sendNotificationEmail = async (
  toEmail: string,
  subject: string,
  htmlBody: string
): Promise<void> => {
  const emailConfig =
    (getFunctionsConfig().email as { user?: string; pass?: string; from?: string }) || {};
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
    const message = err instanceof Error ? err.message : String(err);
    console.error('Email send failed:', message);
  }
};

const firebaseConfig: Record<string, unknown> = process.env.FIREBASE_CONFIG
  ? (JSON.parse(process.env.FIREBASE_CONFIG) as Record<string, unknown>)
  : {};
const databaseURL =
  (firebaseConfig['databaseURL'] as string | undefined) ||
  'https://kgrades-default-rtdb.firebaseio.com';

admin.initializeApp({
  ...firebaseConfig,
  databaseURL,
});

const ALLOWED_ROLES = new Set<string>(['student', 'teacher', 'admin', 'parent']);

const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STUDENT_ID_REGEX = /^\d{6}$/;
const SCHOOL_ID_REGEX = /^[a-zA-Z0-9_-]{1,40}$/;

interface UserRecord {
  studentId?: string;
  email?: string;
  role?: string;
  parentCode?: string;
  firstName?: string;
  lastInitial?: string;
  schoolId?: string;
}

interface InviteRecord {
  studentId?: string;
  used?: boolean;
  email?: string;
  role?: string;
  usedBy?: string;
  usedAt?: number;
  createdBy?: string;
  schoolId?: string;
}

interface ParentRecord {
  children?: Record<string, boolean>;
}

interface ParentCodeRecord {
  studentUid?: string;
  studentEmail?: string;
  studentName?: string;
  createdAt?: number;
}

interface GradeData {
  name?: string;
  score?: number;
  maxScore?: number;
  type?: string;
}

const hasStudentIdCollision = (
  usersData: Record<string, UserRecord>,
  invitesData: Record<string, InviteRecord>,
  candidate: string
): boolean => {
  const normalizedCandidate = String(candidate || '').trim();
  if (!normalizedCandidate) {
    return false;
  }

  const existsInUsers = Object.values(usersData).some(
    (user) => String(user?.studentId || '').trim() === normalizedCandidate
  );
  if (existsInUsers) {
    return true;
  }

  return Object.values(invitesData).some(
    (invite) =>
      String(invite?.studentId || '').trim() === normalizedCandidate &&
      invite?.used !== true
  );
};

const generateUniqueStudentId = (
  usersData: Record<string, UserRecord>,
  invitesData: Record<string, InviteRecord>,
  requestedStudentId = '',
  maxAttempts = 10
): string => {
  const normalizedRequested = String(requestedStudentId || '').trim();
  if (normalizedRequested) {
    if (!STUDENT_ID_REGEX.test(normalizedRequested)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Student ID must be exactly 6 digits'
      );
    }
    if (hasStudentIdCollision(usersData, invitesData, normalizedRequested)) {
      throw new functions.https.HttpsError(
        'already-exists',
        'This student ID already exists'
      );
    }
    return normalizedRequested;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    if (!hasStudentIdCollision(usersData, invitesData, candidate)) {
      return candidate;
    }
  }

  throw new functions.https.HttpsError(
    'resource-exhausted',
    'Unable to generate a unique student ID'
  );
};

// --- existing invite validation trigger ---
exports.validateInviteOnCreate = functions.database
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

exports.createInvite = functions.https.onCall(
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
exports.assignRoleFromInvite = functions.https.onCall(
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

// --- auto-generate parent code on student creation ---
const generateParentCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KGR-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

exports.onStudentCreated = functions.database
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

exports.claimParentCode = functions.https.onCall(
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
    const isExistingParent =
      parentSnap.exists() && (parentSnap.val() as UserRecord)?.role === 'parent';

    if (!isExistingParent) {
      const firstName = typeof data?.firstName === 'string' ? data.firstName.trim() : '';
      const lastInitial =
        typeof data?.lastInitial === 'string'
          ? data.lastInitial.trim().charAt(0).toUpperCase()
          : '';

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

exports.linkAdditionalChild = functions.https.onCall(
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

interface DeleteUserData {
  uid?: unknown;
}

// --- callable admin delete (auth + RTDB) ---
exports.deleteUserByAdmin = functions.https.onCall(
  async (data: DeleteUserData, context: functions.https.CallableContext) => {
    if (!context.auth || !context.auth.token || context.auth.token['admin'] !== true) {
      throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
    }

    const { uid } = data || {};
    if (!uid) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing uid');
    }

    const targetUid = String(uid);

    // Prevent admins from deleting themselves
    if (targetUid === context.auth.uid) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Admins cannot delete their own account'
      );
    }

    const db = admin.database();

    // Prevent school-scoped admins from deleting users outside their school
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

    // Remove user record
    await db.ref(`Users/${targetUid}`).set(null);

    // Remove grades
    await db.ref(`grades/${targetUid}`).set(null);

    // Remove teacher record (if they were a teacher)
    await db.ref(`teachers/${targetUid}`).set(null);

    // Remove from all class rosters
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

    // Remove thread index (the user's own message thread lookup)
    try {
      await db.ref(`threadIndex/${targetUid}`).set(null);
    } catch (err) {
      console.warn('deleteUserByAdmin: threadIndex cleanup failed', {
        uid: targetUid,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Remove notifications
    await db.ref(`notifications/${targetUid}`).set(null);

    return { success: true };
  }
);

exports.backfillParentCodes = functions.https.onCall(
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

exports.notifyParentOnGrade = functions.database
  .ref('/grades/{studentUid}/{classId}/assignments/{assignmentId}')
  .onWrite(
    async (
      change: functions.Change<functions.database.DataSnapshot>,
      context: functions.EventContext
    ) => {
      if (!change.after.exists()) return null;

      const { studentUid, classId, assignmentId } = context.params as {
        studentUid: string;
        classId: string;
        assignmentId: string;
      };
      const gradeData = (change.after.val() as GradeData) || {};
      const db = admin.database();

      // Find all parents linked to this student
      const parentsSnap = await db.ref('parents').once('value');
      const parentsData = (parentsSnap.val() as Record<string, ParentRecord>) || {};

      const parentUids = Object.entries(parentsData)
        .filter(([, parent]) => parent?.children?.[studentUid] === true)
        .map(([parentUid]) => parentUid);

      if (parentUids.length === 0) return null;

      // Get student name
      const studentSnap = await db.ref(`Users/${studentUid}`).once('value');
      const studentData = (studentSnap.val() as UserRecord) || {};
      const studentName =
        `${studentData.firstName || ''} ${studentData.lastInitial || ''}`.trim() || 'Your child';

      // Get class name
      const classSnap = await db.ref(`classes/${classId}/name`).once('value');
      const className = (classSnap.val() as string | null) || classId;

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

      // Send email notifications
      const emailPromises = parentUids.map(async (parentUid) => {
        const parentSnap = await db.ref(`Users/${parentUid}/email`).once('value');
        const parentEmail = parentSnap.val() as string | null;
        if (!parentEmail) return;

        const pct =
          (gradeData.maxScore ?? 0) > 0
            ? (((gradeData.score ?? 0) / (gradeData.maxScore ?? 1)) * 100).toFixed(1)
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
      console.log(`Notified ${parentUids.length} parent(s) about grade for ${studentUid}`);
      return null;
    }
  );

exports.notifyParentOnAbsence = functions.database
  .ref('/attendance/{classId}/{date}/{studentUid}')
  .onWrite(
    async (
      change: functions.Change<functions.database.DataSnapshot>,
      context: functions.EventContext
    ) => {
      if (!change.after.exists()) return null;

      const status = change.after.val() as string | null;
      if (status !== 'absent') return null;

      const { classId, date, studentUid } = context.params as {
        classId: string;
        date: string;
        studentUid: string;
      };
      const db = admin.database();

      // Find parents
      const parentsSnap = await db.ref('parents').once('value');
      const parentsData = (parentsSnap.val() as Record<string, ParentRecord>) || {};

      const parentUids = Object.entries(parentsData)
        .filter(([, parent]) => parent?.children?.[studentUid] === true)
        .map(([parentUid]) => parentUid);

      if (parentUids.length === 0) return null;

      const studentSnap = await db.ref(`Users/${studentUid}`).once('value');
      const studentData = (studentSnap.val() as UserRecord) || {};
      const studentName =
        `${studentData.firstName || ''} ${studentData.lastInitial || ''}`.trim() || 'Your child';

      const classSnap = await db.ref(`classes/${classId}/name`).once('value');
      const className = (classSnap.val() as string | null) || classId;

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

      // Send email notifications
      const emailPromises = parentUids.map(async (parentUid) => {
        const parentSnap = await db.ref(`Users/${parentUid}/email`).once('value');
        const parentEmail = parentSnap.val() as string | null;
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
      console.log(`Notified ${parentUids.length} parent(s) about absence for ${studentUid}`);
      return null;
    }
  );
