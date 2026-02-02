// scripts/cleanup_emails.js
// Back up the `emails` node and remove it from Realtime Database.
// Usage: node scripts/cleanup_emails.js
// Requires: service-account.json (DO NOT COMMIT)

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

async function main() {
  const keyPath = path.resolve(process.cwd(), 'service-account.json');
  if (!fs.existsSync(keyPath)) {
    console.error('service-account.json not found in project root. Download it from Firebase Console > Project settings > Service accounts');
    process.exit(1);
  }

  const serviceAccount = require(keyPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: process.env.FIREBASE_DB_URL });

  const db = admin.database();
  const ref = db.ref('emails');

  console.log('Reading /emails node...');
  const snapshot = await ref.once('value');
  const data = snapshot.val();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(process.cwd(), `scripts/emails-backup-${timestamp}.json`);

  fs.writeFileSync(backupPath, JSON.stringify(data || {}, null, 2));
  console.log(`Backed up /emails to ${backupPath}`);

  if (!data) {
    console.log('No /emails node present. Nothing to remove.');
    process.exit(0);
  }

  // Ask for confirmation via stdin
  process.stdout.write('Are you sure you want to delete /emails from the database? This is irreversible. (yes/no) ');
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', async (input) => {
    const answer = input.trim().toLowerCase();
    if (answer === 'yes' || answer === 'y') {
      try {
        await ref.remove();
        console.log('Deleted /emails from database.');
        process.exit(0);
      } catch (err) {
        console.error('Error deleting /emails:', err);
        process.exit(1);
      }
    } else {
      console.log('Aborted. /emails not deleted.');
      process.exit(0);
    }
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
