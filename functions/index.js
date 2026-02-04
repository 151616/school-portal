/* eslint-env node */
/* eslint-disable no-undef */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

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

    const email = (invite.email || '').toLowerCase();
    const role = invite.role;
    const createdBy = invite.createdBy;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !role || !createdBy || !emailRegex.test(email)) {
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
exports.assignRoleFromInvite = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in"
      );
    }

    const { inviteId, firstName, lastInitial } = data;
    const uid = context.auth.uid;

    if (!inviteId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing inviteId"
      );
    }

    const inviteRef = admin.database().ref(`invites/${inviteId}`);
    const inviteSnap = await inviteRef.get();

    if (!inviteSnap.exists()) {
      throw new functions.https.HttpsError("not-found", "Invite not found");
    }

    const invite = inviteSnap.val();

    if (invite.used) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Invite already used"
      );
    }

    const role = invite.role;
    const safeFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const safeLastInitial = typeof lastInitial === 'string' ? lastInitial.trim().charAt(0).toUpperCase() : '';

    // Set custom claim
    await admin.auth().setCustomUserClaims(uid, {
      [role]: true,
    });

    // Create user record
    await admin.database().ref(`Users/${uid}`).set({
      email: invite.email,
      role,
      firstName: safeFirstName,
      lastInitial: safeLastInitial,
      createdAt: Date.now(),
    });

    // Mark invite used
    await inviteRef.update({
      used: true,
      usedBy: uid,
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
