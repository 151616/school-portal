import * as admin from 'firebase-admin';

const firebaseConfig: Record<string, unknown> = process.env.FIREBASE_CONFIG
  ? (JSON.parse(process.env.FIREBASE_CONFIG) as Record<string, unknown>)
  : {};

const databaseURL =
  (firebaseConfig['databaseURL'] as string | undefined) ||
  'https://kgrades-default-rtdb.firebaseio.com';

if (!admin.apps.length) {
  admin.initializeApp({
    ...firebaseConfig,
    databaseURL,
  });
}

export {
  validateInviteOnCreate,
  createInvite,
  assignRoleFromInvite,
} from './lib/auth';
export {
  onStudentCreated,
  claimParentCode,
  linkAdditionalChild,
  backfillParentCodes,
} from './lib/parents';
export { deleteUserByAdmin } from './lib/users';
export { notifyParentOnGrade } from './lib/grades';
export { notifyParentOnAbsence } from './lib/attendance';
export {
  publishReportCards,
  backfillAssignmentTerms,
} from './lib/reportCards';
