// scripts/setAdminClaim.js
// Usage: node scripts/setAdminClaim.js <USER_UID>
// This script assumes you've downloaded a service account JSON from
// Firebase Console -> Project settings -> Service accounts -> Generate new private key
// and saved it as `service-account.json` in the project root (DO NOT COMMIT).

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    console.error('Usage: node scripts/setAdminClaim.js <USER_UID>');
    process.exit(1);
  }

  const keyPath = path.resolve(process.cwd(), 'service-account.json');
  if (!fs.existsSync(keyPath)) {
    console.error('service-account.json not found in project root. Download it from Firebase Console > Project settings > Service accounts');
    process.exit(1);
  }

  const serviceAccount = require(keyPath);

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log(`✅ Successfully set admin claim for UID: ${uid}`);
    console.log('Note: the user may need to sign out and sign back in to get a fresh token.');
  } catch (err) {
    console.error('Error setting custom claim:', err);
    process.exit(1);
  }
}

main();
