import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { sendNotificationEmail } from './email';
import type { UserRecord, ParentRecord, GradeData } from './validation';

export const notifyParentOnGrade = functions.database
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
