import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  getLetterGrade,
  type AcademicConfigData,
  type ReportCardData,
  type ReportCardSubject,
} from './validation';

interface ReportCardPublishData {
  sessionId: string;
  termId: string;
  schoolId: string;
}

interface ClassData {
  name?: string;
  teacherUid?: string;
  schoolId?: string;
  students?: Record<string, unknown>;
}

interface StudentClassData {
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
  email?: string;
}

interface AssignmentTermData {
  termId?: string;
  sessionId?: string;
  type?: string;
  score?: number;
  maxScore?: number;
}

interface CommentData {
  teacherComment?: string;
  principalComment?: string;
}

interface UserProfileData {
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
}

export const publishReportCards = functions.https.onCall(
  async (
    data: ReportCardPublishData,
    context: functions.https.CallableContext
  ) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const { sessionId, termId, schoolId } = data;
    if (!sessionId || !termId || !schoolId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'sessionId, termId, and schoolId required'
      );
    }

    const dbRef = admin.database().ref();
    const configSnap = await dbRef.child(`academicConfig/${schoolId}`).once('value');
    const config = configSnap.val() as AcademicConfigData | null;
    if (!config?.sessions?.[sessionId]?.terms?.[termId]) {
      throw new functions.https.HttpsError('not-found', 'Session or term not found');
    }

    const session = config.sessions[sessionId]!;
    const term = session.terms[termId]!;
    const termStart = term.startDate;
    const termEnd = term.endDate;
    const termKeys = Object.keys(session.terms).sort();
    const currentTermIndex = termKeys.indexOf(termId);
    const nextTermKey =
      currentTermIndex < termKeys.length - 1 ? termKeys[currentTermIndex + 1] : null;
    const nextTerm = nextTermKey != null ? session.terms[nextTermKey] : null;
    const nextTermResumes = nextTerm ? nextTerm.startDate : '';

    const classesSnap = await dbRef.child('classes').once('value');
    const classesData = (classesSnap.val() || {}) as Record<string, ClassData>;

    let published = 0;
    let skipped = 0;
    const errors: string[] = [];
    const classStudentAverages: Record<string, Array<{ uid: string; average: number }>> =
      {};
    const publishedStudentUids = new Set<string>();

    for (const [classId, classValue] of Object.entries(classesData)) {
      const classData = classValue as ClassData;
      if (classData.schoolId && classData.schoolId !== schoolId) continue;
      if (!classData.students) continue;

      classStudentAverages[classId] = [];
      for (const studentUid of Object.keys(classData.students)) {
        try {
          const gradesSnap = await dbRef
            .child(`grades/${studentUid}/${classId}/assignments`)
            .once('value');
          const assignments = (gradesSnap.val() || {}) as Record<string, AssignmentTermData>;

          let caScore = 0;
          let caMax = 0;
          let examScore = 0;
          let examMax = 0;
          let hasGrades = false;

          for (const assignmentValue of Object.values(assignments)) {
            const assignment = assignmentValue as AssignmentTermData;
            if (assignment.termId !== termId || assignment.sessionId !== sessionId) continue;

            hasGrades = true;
            const score = Number(assignment.score || 0);
            const maxScore = Number(assignment.maxScore || 0);
            if (assignment.type === 'exam') {
              examScore += score;
              examMax += maxScore;
            } else {
              caScore += score;
              caMax += maxScore;
            }
          }

          if (!hasGrades) {
            skipped += 1;
            continue;
          }

          const total = caScore + examScore;
          const totalMax = caMax + examMax;
          const average = totalMax > 0 ? (total / totalMax) * 100 : 0;

          classStudentAverages[classId]!.push({ uid: studentUid, average });
        } catch (err) {
          errors.push(
            `Error processing ${studentUid} in ${classId}: ${(err as Error).message}`
          );
        }
      }
    }

    for (const [classId, classValue] of Object.entries(classesData)) {
      const classData = classValue as ClassData & {
        students?: Record<string, StudentClassData>;
      };
      if (classData.schoolId && classData.schoolId !== schoolId) continue;
      if (!classData.students) continue;

      const rankings = (classStudentAverages[classId] || []).sort(
        (left, right) => right.average - left.average
      );
      const classSize = rankings.length;

      for (const studentUid of Object.keys(classData.students)) {
        try {
          const rosterStudent = classData.students[studentUid];
          const ranking = rankings.findIndex((entry) => entry.uid === studentUid);
          if (ranking === -1) continue;

          const userSnap = await dbRef.child(`Users/${studentUid}`).once('value');
          const userProfile = userSnap.val() as UserProfileData | null;

          const gradesSnap = await dbRef
            .child(`grades/${studentUid}/${classId}/assignments`)
            .once('value');
          const assignments = (gradesSnap.val() || {}) as Record<string, AssignmentTermData>;

          let caScore = 0;
          let caMax = 0;
          let examScore = 0;
          let examMax = 0;
          for (const assignmentValue of Object.values(assignments)) {
            const assignment = assignmentValue as AssignmentTermData;
            if (assignment.termId !== termId || assignment.sessionId !== sessionId) continue;

            const score = Number(assignment.score || 0);
            const maxScore = Number(assignment.maxScore || 0);
            if (assignment.type === 'exam') {
              examScore += score;
              examMax += maxScore;
            } else {
              caScore += score;
              caMax += maxScore;
            }
          }

          const total = caScore + examScore;
          const totalMax = caMax + examMax;
          const percentage = totalMax > 0 ? (total / totalMax) * 100 : 0;

          const commentsSnap = await dbRef
            .child(`reportComments/${sessionId}/${termId}/${studentUid}`)
            .once('value');
          const comments = commentsSnap.val() as CommentData | null;

          const attendanceSnap = await dbRef.child(`attendance/${classId}`).once('value');
          const attendanceData = (attendanceSnap.val() || {}) as Record<
            string,
            Record<string, string>
          >;
          let present = 0;
          let totalDays = 0;
          for (const [dateString, dayAttendance] of Object.entries(attendanceData)) {
            if (dateString < termStart || dateString > termEnd) continue;

            const studentAttendance = dayAttendance?.[studentUid];
            if (!studentAttendance) continue;

            totalDays += 1;
            if (studentAttendance === 'present' || studentAttendance === 'tardy') {
              present += 1;
            }
          }

          const subject: ReportCardSubject = {
            name: classData.name || classId,
            caScore,
            caMax,
            examScore,
            examMax,
            total,
            totalMax,
            grade: getLetterGrade(percentage),
            teacherRemark: comments?.teacherComment || '',
          };

          const studentName = [
            userProfile?.firstName || rosterStudent?.firstName || '',
            userProfile?.lastInitial || rosterStudent?.lastInitial || '',
          ]
            .filter(Boolean)
            .join(' ');

          const reportCard: ReportCardData = {
            studentName,
            studentId: userProfile?.studentId || rosterStudent?.studentId || '',
            className: classData.name || classId,
            classId,
            session: session.label,
            term: term.label,
            sessionId,
            termId,
            schoolId,
            publishedAt: Date.now(),
            publishedBy: context.auth.uid,
            subjects: { [classId]: subject },
            classPosition: ranking + 1,
            classSize,
            overallAverage: Math.round(percentage * 10) / 10,
            attendance: { present, total: totalDays },
            teacherComment: comments?.teacherComment || '',
            principalComment: comments?.principalComment || '',
            nextTermResumes,
          };

          const existingSnap = await dbRef
            .child(`reportCards/${sessionId}/${termId}/${studentUid}`)
            .once('value');
          if (existingSnap.exists()) {
            const existing = existingSnap.val() as ReportCardData;
            reportCard.subjects = { ...existing.subjects, ...reportCard.subjects };

            const allSubjects = Object.values(reportCard.subjects);
            const totalAll = allSubjects.reduce(
              (sum, currentSubject) => sum + currentSubject.total,
              0
            );
            const totalMaxAll = allSubjects.reduce(
              (sum, currentSubject) => sum + currentSubject.totalMax,
              0
            );
            reportCard.overallAverage =
              totalMaxAll > 0 ? Math.round((totalAll / totalMaxAll) * 1000) / 10 : 0;
          }

          await dbRef
            .child(`reportCards/${sessionId}/${termId}/${studentUid}`)
            .set(reportCard);
          publishedStudentUids.add(studentUid);
        } catch (err) {
          errors.push(`Error writing report for ${studentUid}: ${(err as Error).message}`);
        }
      }
    }

    try {
      const parentsSnap = await dbRef.child('parents').once('value');
      const parentsData = (parentsSnap.val() || {}) as Record<
        string,
        { children?: Record<string, boolean> }
      >;

      for (const [parentUid, parentValue] of Object.entries(parentsData)) {
        const children = parentValue?.children || {};
        for (const childUid of Object.keys(children)) {
          const reportExists = await dbRef
            .child(`reportCards/${sessionId}/${termId}/${childUid}`)
            .once('value');
          if (!reportExists.exists()) continue;

          const notificationRef = dbRef.child(`notifications/${parentUid}`).push();
          await notificationRef.set({
            type: 'grade',
            title: 'Report Card Published',
            body: `${term.label} (${session.label}) report card is now available.`,
            createdAt: Date.now(),
            read: false,
          });
        }
      }
    } catch (err) {
      errors.push(`Error sending notifications: ${(err as Error).message}`);
    }

    published = publishedStudentUids.size;
    return { success: true, published, skipped, errors };
  }
);

interface BackfillAssignmentTermsData {
  sessionId: string;
  schoolId: string;
}

interface AssignmentBackfillData {
  updatedAt?: number;
  termId?: string;
  sessionId?: string;
}

interface GradeClassAssignments {
  assignments?: Record<string, AssignmentBackfillData>;
}

export const backfillAssignmentTerms = functions.https.onCall(
  async (
    data: BackfillAssignmentTermsData,
    context: functions.https.CallableContext
  ) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const { sessionId, schoolId } = data;
    const dbRef = admin.database().ref();
    const configSnap = await dbRef.child(`academicConfig/${schoolId}`).once('value');
    const config = configSnap.val() as AcademicConfigData | null;
    if (!config?.sessions?.[sessionId]) {
      throw new functions.https.HttpsError('not-found', 'Session not found');
    }

    const session = config.sessions[sessionId]!;
    const termRanges = Object.entries(session.terms).map(([key, value]) => ({
      key,
      start: new Date(value.startDate).getTime(),
      end: new Date(value.endDate).getTime() + 86400000,
    }));

    const gradesSnap = await dbRef.child('grades').once('value');
    const gradesData = (gradesSnap.val() || {}) as Record<
      string,
      Record<string, GradeClassAssignments>
    >;

    let updated = 0;
    let unmatched = 0;
    const updates: Record<string, unknown> = {};

    for (const [studentUid, studentGrades] of Object.entries(gradesData)) {
      for (const [classId, classValue] of Object.entries(studentGrades)) {
        const assignments = classValue?.assignments || {};
        for (const [assignmentId, assignment] of Object.entries(assignments)) {
          if (assignment.termId && assignment.sessionId) continue;

          const timestamp = assignment.updatedAt || 0;
          const matchingTerm = termRanges.find(
            (termRange) => timestamp >= termRange.start && timestamp < termRange.end
          );

          if (!matchingTerm) {
            unmatched += 1;
            continue;
          }

          updates[
            `grades/${studentUid}/${classId}/assignments/${assignmentId}/termId`
          ] = matchingTerm.key;
          updates[
            `grades/${studentUid}/${classId}/assignments/${assignmentId}/sessionId`
          ] = sessionId;
          updated += 1;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await dbRef.update(updates);
    }

    return { success: true, updated, unmatched };
  }
);
