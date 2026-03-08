const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
const databaseURL =
  firebaseConfig.databaseURL || 'https://kgrades-default-rtdb.firebaseio.com';

admin.initializeApp({
  ...firebaseConfig,
  databaseURL,
});

const ALLOWED_ROLES = new Set(['student', 'teacher', 'admin']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STUDENT_ID_REGEX = /^\d{6}$/;

const hasStudentIdCollision = (usersData, invitesData, candidate) => {
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

const generateUniqueStudentId = (usersData, invitesData, requestedStudentId = '', maxAttempts = 10) => {
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
  .onCreate(async (snapshot, context) => {
    const invite = snapshot.val() || {};
    const inviteId = context.params.inviteId;

    const email = normalizeEmail(invite.email);
    const role = invite.role;
    const createdBy = invite.createdBy;

    if (!email || !role || !createdBy || !emailRegex.test(email) || !ALLOWED_ROLES.has(role)) {
      console.log('Invalid invite data for', inviteId, invite);
      return snapshot.ref.remove();
    }

    const db = admin.database();
    const creatorSnap = await db.ref(`Users/${createdBy}`).once('value');
    const creatorRole = creatorSnap.child('role').val();
    if (creatorRole !== 'admin') {
      console.log('Invite creator is not an admin. Removing invite:', createdBy);
      return snapshot.ref.remove();
    }

    const usersSnap = await db.ref('Users').orderByChild('email').equalTo(email).once('value');
    if (usersSnap.exists()) {
      console.log('User already exists with email, removing invite:', email);
      return snapshot.ref.remove();
    }

    const invitesSnap = await db.ref('invites').orderByChild('email').equalTo(email).once('value');
    let pendingCount = 0;
    invitesSnap.forEach((childSnap) => {
      const childInvite = childSnap.val();
      if (childSnap.key !== inviteId && childInvite && !childInvite.used) {
        pendingCount += 1;
      }
    });

    if (pendingCount > 0) {
      console.log('An existing pending invite exists for this email. Removing new invite:', email);
      return snapshot.ref.remove();
    }

    await snapshot.ref.update({ email });
    console.log('Invite validated for email:', email);
    return null;
  });

exports.createInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin privileges required'
    );
  }

  const email = normalizeEmail(data?.email);
  const role = String(data?.role || 'student').trim().toLowerCase();
  const firstName = typeof data?.firstName === 'string' ? data.firstName.trim() : '';
  const lastInitial =
    typeof data?.lastInitial === 'string' ? data.lastInitial.trim().charAt(0).toUpperCase() : '';
  const requestedStudentId =
    typeof data?.studentId === 'string' ? data.studentId.trim() : '';

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

  const usersData = usersSnap.val() || {};
  const invitesData = invitesSnap.val() || {};
  const emailExistsInUsers = Object.values(usersData).some(
    (user) => normalizeEmail(user?.email) === email
  );
  if (emailExistsInUsers) {
    throw new functions.https.HttpsError(
      'already-exists',
      'This email already has an account'
    );
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
  });

  return {
    success: true,
    inviteId: inviteRef.key,
    email,
    role,
    studentId,
  };
});

// --- callable function to assign role on signup ---
exports.assignRoleFromInvite = functions.https.onCall(async (data, context) => {
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

  const preInvite = preSnap.val() || {};
  const preInviteEmail = normalizeEmail(preInvite.email);
  const preRole = preInvite.role;
  const preUsed = preInvite.used === true;

  if (!preInviteEmail || preInviteEmail !== authEmail) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Signed-in email does not match this invite'
    );
  }

  if (!ALLOWED_ROLES.has(preRole)) {
    throw new functions.https.HttpsError('failed-precondition', 'Invite role is invalid');
  }

  const claimedAt = Date.now();
  const claimRef = admin.database().ref(`inviteClaims/${inviteId}`);
  let claimState = 'not-run';
  let claimOwnerUid = preInvite.usedBy || null;
  let claimTimestamp = preInvite.usedAt || claimedAt;

  if (preUsed) {
    claimState = preInvite.usedBy === uid ? 'already-claimed-by-caller' : 'already-used';
  } else {
    await claimRef.transaction((currentClaim) => {
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

    const claim = claimSnap.val() || {};
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

  const invite = finalSnap.val() || {};
  const inviteEmail = normalizeEmail(invite.email);
  if (!inviteEmail || inviteEmail !== authEmail) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Signed-in email does not match this invite'
    );
  }

  if (!ALLOWED_ROLES.has(invite.role)) {
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

  const persistedInvite = persistedSnap.val() || {};
  const role = persistedInvite.role;
  const studentId = persistedInvite.studentId || '';
  const createdAt = persistedInvite.usedAt || claimTimestamp;
  const safeFirstName = typeof firstName === 'string' ? firstName.trim() : '';
  const safeLastInitial =
    typeof lastInitial === 'string' ? lastInitial.trim().charAt(0).toUpperCase() : '';

  if (persistedInvite.used !== true) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Invite claim did not persist'
    );
  }

  if (persistedInvite.usedBy !== uid) {
    throw new functions.https.HttpsError('failed-precondition', 'Invite already used');
  }

  await admin.auth().setCustomUserClaims(uid, {
    [role]: true,
  });

  await admin.database().ref(`Users/${uid}`).set({
    email: normalizeEmail(persistedInvite.email),
    role,
    firstName: safeFirstName,
    lastInitial: safeLastInitial,
    studentId,
    createdAt,
  });

  try {
    await claimRef.remove();
  } catch (err) {
    console.warn('assignRoleFromInvite: claim cleanup failed', {
      inviteId,
      uid,
      error: err && err.message ? err.message : String(err),
    });
  }

  return { success: true, role };
});

// --- callable admin delete (auth + RTDB) ---
exports.deleteUserByAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin privileges required'
    );
  }

  const { uid } = data || {};
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid');
  }

  // Prevent admins from deleting themselves
  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Admins cannot delete their own account');
  }

  const db = admin.database();

  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (err && err.code !== 'auth/user-not-found') {
      throw new functions.https.HttpsError('internal', err.message || String(err));
    }
  }

  // Remove user record
  await db.ref(`Users/${uid}`).set(null);

  // Remove grades
  await db.ref(`grades/${uid}`).set(null);

  // Remove teacher record (if they were a teacher)
  await db.ref(`teachers/${uid}`).set(null);

  // Remove from all class rosters
  try {
    const classesSnap = await db.ref('classes').once('value');
    const classesData = classesSnap.val() || {};
    const rosterRemovals = Object.keys(classesData)
      .filter((classId) => classesData[classId]?.students?.[uid])
      .map((classId) => db.ref(`classes/${classId}/students/${uid}`).set(null));
    await Promise.all(rosterRemovals);
  } catch (err) {
    console.warn('deleteUserByAdmin: class roster cleanup failed', { uid, error: err && err.message ? err.message : String(err) });
  }

  // Remove thread index (the user's own message thread lookup)
  try {
    await db.ref(`threadIndex/${uid}`).set(null);
  } catch (err) {
    console.warn('deleteUserByAdmin: threadIndex cleanup failed', { uid, error: err && err.message ? err.message : String(err) });
  }

  // Remove notifications
  await db.ref(`notifications/${uid}`).set(null);

  return { success: true };
});
