const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.validateInviteOnCreate = functions.database.ref('/invites/{inviteId}').onCreate(async (snapshot, context) => {
  const invite = snapshot.val() || {};
  const inviteId = context.params.inviteId;

  // Only allow creation from authenticated admin users
  if (!context.auth || !context.auth.token || context.auth.token.admin !== true) {
    console.log('Invite created by non-admin or unauthenticated user. Removing invite.', context.auth);
    return snapshot.ref.remove();
  }

  const email = (invite.email || '').toLowerCase();
  const role = invite.role;
  const createdBy = invite.createdBy;

  // Basic validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !role || !createdBy || !emailRegex.test(email)) {
    console.log('Invalid invite data for', inviteId, invite);
    return snapshot.ref.remove();
  }

  const db = admin.database();

  // 1) Ensure no existing user has the email
  const usersSnap = await db.ref('Users').orderByChild('email').equalTo(email).once('value');
  if (usersSnap.exists()) {
    console.log('User already exists with email, removing invite:', email);
    return snapshot.ref.remove();
  }

  // 2) Ensure there are no other pending invites for the same email
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

  // Normalize stored email
  await snapshot.ref.update({ email });

  console.log('Invite validated for email:', email);
  return null;
});
