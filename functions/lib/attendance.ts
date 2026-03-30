import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { sendNotificationEmail } from './email';
import type { UserRecord, ParentRecord } from './validation';

export const notifyParentOnAbsence = functions.database
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
