const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};

admin.initializeApp({
  ...firebaseConfig,
  databaseURL: 'https://kgrades-default-rtdb.firebaseio.com',
});

const ALLOWED_ROLES = new Set(['student', 'teacher', 'admin']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

// --- existing invite validation trigger ---
exports.validateInviteOnCreate = functions.database
  .ref('/invites/{inviteId}')
  .onCreate(async (snapshot, context) => {
    const invite = snapshot.val() || {};
    const inviteId = context.params.inviteId;

    if (!context.auth || !context.auth.token || context.auth.token.admin !== true) {
      console.log('Invite created by non-admin or unauthenticated user. Removing invite.', context.auth);
      return snapshot.ref.remove();
    }

    const email = normalizeEmail(invite.email);
    const role = invite.role;
    const createdBy = invite.createdBy;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !role || !createdBy || !emailRegex.test(email) || !ALLOWED_ROLES.has(role)) {
      console.log('Invalid invite data for', inviteId, invite);
      return snapshot.ref.remove();
    }

    const db = admin.database();

    const usersSnap = await db.ref('Users').orderByChild('email').equalTo(email).once('value');
    if (usersSnap.exists()) {
      console.log('User already exists with email, removing invite:', email);
      return snapshot.ref.remove();
    }

    const invitesSnap = await db.ref('invites').orderByChild('email').equalTo(email).once('value');
    let pendingCount = 0;
    invitesSnap.forEach(s => {
      const k = s.key;
      const v = s.val();
      if (k !== inviteId && v && !v.used) pendingCount++;
    });
    if (pendingCount > 0) {
      console.log('An existing pending invite exists for this email. Removing new invite:', email);
      return snapshot.ref.remove();
    }

    await snapshot.ref.update({ email });
    console.log('Invite validated for email:', email);
    return null;
  });

// --- new callable function to assign role on signup ---
exports.assignRoleFromInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in");
  }

  const { inviteId, firstName, lastInitial } = data || {};
  const uid = context.auth.uid;

  if (!inviteId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing inviteId");
  }

  // High-signal runtime diagnostics (temporary but safe)
  try {
    const app = admin.app();
    console.log("assignRoleFromInvite runtime", {
      gcloudProject: process.env.GCLOUD_PROJECT,
      functionRegion: process.env.FUNCTION_REGION,
      adminProjectId: app?.options?.projectId,
      adminDatabaseURL: app?.options?.databaseURL,
      inviteId,
      uid,
    });
  } catch (e) {
    console.log("assignRoleFromInvite runtime log failed", String(e));
  }

  const authUser = await admin.auth().getUser(uid);
  const authEmail = normalizeEmail(authUser.email);
  if (!authEmail) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Signed-in account is missing an email address"
    );
  }

  const inviteRef = admin.database().ref(`invites/${inviteId}`);
  try {
    console.log("assignRoleFromInvite inviteRef", inviteRef.toString());
  } catch {
    // ignore
  }

  // Pre-read removes ambiguity between "invite missing" vs "transaction aborted"
  const preSnap = await inviteRef.once("value");
  if (!preSnap.exists()) {
    console.log("assignRoleFromInvite pre-read: invite missing at path", {
      inviteId,
      path: inviteRef.toString?.() || `invites/${inviteId}`,
    });
    throw new functions.https.HttpsError("not-found", "Invite not found");
  }

  const preInvite = preSnap.val() || {};
  const preInviteEmail = normalizeEmail(preInvite.email);
  const preRole = preInvite.role;
  const preUsed = preInvite.used === true;
  console.log("assignRoleFromInvite pre-read summary", {
    inviteId,
    used: preUsed,
    role: preRole,
    emailMatchesCaller: !!preInviteEmail && preInviteEmail === authEmail,
  });

  if (!preInviteEmail || preInviteEmail !== authEmail) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Signed-in email does not match this invite"
    );
  }

  if (!ALLOWED_ROLES.has(preRole)) {
    throw new functions.https.HttpsError("failed-precondition", "Invite role is invalid");
  }

  const claimedAt = Date.now();
  const claimRef = admin.database().ref(`inviteClaims/${inviteId}`);
  let claimState = "not-run";
  let claimOwnerUid = preInvite.usedBy || null;
  let claimTimestamp = preInvite.usedAt || claimedAt;

  if (preUsed) {
    claimState = preInvite.usedBy === uid ? "already-claimed-by-caller" : "already-used";
  } else {
    await claimRef.transaction((currentClaim) => {
      if (currentClaim && currentClaim.uid && currentClaim.uid !== uid) {
        claimState = "claimed-by-other";
        return currentClaim;
      }

      if (currentClaim && currentClaim.uid === uid) {
        claimState = "already-claimed-by-caller";
        return currentClaim;
      }

      claimState = "claimed";
      return {
        uid,
        claimedAt,
      };
    });

    const claimSnap = await claimRef.once("value");
    if (!claimSnap.exists()) {
      console.log("assignRoleFromInvite claim missing after transaction", {
        inviteId,
        claimState,
      });
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Invite claim lock did not persist"
      );
    }

    const claim = claimSnap.val() || {};
    claimOwnerUid = claim.uid || null;
    claimTimestamp = claim.claimedAt || claimedAt;

    console.log("assignRoleFromInvite claim summary", {
      inviteId,
      claimState,
      claimOwnerUidMatchesCaller: claimOwnerUid === uid,
    });
  }

  if (claimOwnerUid !== uid) {
    throw new functions.https.HttpsError("failed-precondition", "Invite already used");
  }

  const finalSnap = await inviteRef.once("value");
  if (!finalSnap.exists()) {
    console.log("assignRoleFromInvite finalize: invite missing", {
      inviteId,
      claimState,
    });
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Invite became unavailable during claim"
    );
  }

  const invite = finalSnap.val() || {};
  const inviteEmail = normalizeEmail(invite.email);
  if (!inviteEmail || inviteEmail !== authEmail) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Signed-in email does not match this invite"
    );
  }

  if (!ALLOWED_ROLES.has(invite.role)) {
    throw new functions.https.HttpsError("failed-precondition", "Invite role is invalid");
  }

  if (invite.used === true && invite.usedBy && invite.usedBy !== uid) {
    throw new functions.https.HttpsError("failed-precondition", "Invite already used");
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

  const persistedSnap = await inviteRef.once("value");
  if (!persistedSnap.exists()) {
    console.log("assignRoleFromInvite post-finalize: invite missing", {
      inviteId,
      claimState,
    });
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Invite became unavailable during finalize"
    );
  }

  const persistedInvite = persistedSnap.val() || {};
  console.log("assignRoleFromInvite post-claim summary", {
    inviteId,
    claimState,
    used: persistedInvite.used === true,
    usedByMatchesCaller: persistedInvite.usedBy === uid,
    role: persistedInvite.role || null,
  });

  const role = persistedInvite.role;
  const studentId = persistedInvite.studentId || "";
  const createdAt = persistedInvite.usedAt || claimTimestamp;
  const safeFirstName = typeof firstName === "string" ? firstName.trim() : "";
  const safeLastInitial =
    typeof lastInitial === "string" ? lastInitial.trim().charAt(0).toUpperCase() : "";

  if (persistedInvite.used !== true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Invite claim did not persist"
    );
  }

  if (persistedInvite.usedBy !== uid) {
    throw new functions.https.HttpsError("failed-precondition", "Invite already used");
  }

  // Set custom claim
  await admin.auth().setCustomUserClaims(uid, {
    [role]: true,
  });

    // Create user record
    await admin.database().ref(`Users/${uid}`).set({
      email: normalizeEmail(persistedInvite.email),
      role,
      firstName: safeFirstName,
      lastInitial: safeLastInitial,
      studentId,
      createdAt,
    });

    return { success: true, role };
  }
);

// --- callable admin delete (auth + RTDB) ---
exports.deleteUserByAdmin = functions.https.onCall(
  async (data, context) => {
    if (!context.auth || !context.auth.token || context.auth.token.admin !== true) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin privileges required"
      );
    }

    const { uid } = data || {};
    if (!uid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing uid"
      );
    }

    // Delete Auth user (ignore not-found)
    try {
      await admin.auth().deleteUser(uid);
    } catch (err) {
      if (err && err.code !== "auth/user-not-found") {
        throw new functions.https.HttpsError(
          "internal",
          err.message || String(err)
        );
      }
    }

    // Delete RTDB user record
    await admin.database().ref(`Users/${uid}`).set(null);

    return { success: true };
  }
);
