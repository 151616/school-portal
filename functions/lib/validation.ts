import * as functions from 'firebase-functions/v1';

export const ALLOWED_ROLES = new Set<string>(['student', 'teacher', 'admin', 'parent']);

export const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase();
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const STUDENT_ID_REGEX = /^\d{6}$/;
export const SCHOOL_ID_REGEX = /^[a-zA-Z0-9_-]{1,40}$/;

export interface UserRecord {
  studentId?: string;
  email?: string;
  role?: string;
  parentCode?: string;
  firstName?: string;
  lastInitial?: string;
  schoolId?: string;
}

export interface InviteRecord {
  studentId?: string;
  used?: boolean;
  email?: string;
  role?: string;
  usedBy?: string;
  usedAt?: number;
  createdBy?: string;
  schoolId?: string;
}

export interface ParentRecord {
  children?: Record<string, boolean>;
}

export interface ParentCodeRecord {
  studentUid?: string;
  studentEmail?: string;
  studentName?: string;
  createdAt?: number;
}

export interface GradeData {
  name?: string;
  score?: number;
  maxScore?: number;
  type?: string;
}

export interface TermInfo {
  label: string;
  startDate: string;
  endDate: string;
}

export interface AcademicSessionInfo {
  label: string;
  terms: Record<string, TermInfo>;
  activeTerm: string;
}

export interface AcademicConfigData {
  termStructure: string[];
  sessions: Record<string, AcademicSessionInfo>;
  currentSession: string;
}

export interface ReportCardSubject {
  name: string;
  caScore: number;
  caMax: number;
  examScore: number;
  examMax: number;
  total: number;
  totalMax: number;
  grade: string;
  teacherRemark: string;
}

export interface ReportCardData {
  studentName: string;
  studentId: string;
  className: string;
  classId: string;
  session: string;
  term: string;
  sessionId: string;
  termId: string;
  schoolId: string;
  publishedAt: number;
  publishedBy: string;
  subjects: Record<string, ReportCardSubject>;
  classPosition: number;
  classSize: number;
  overallAverage: number;
  attendance: { present: number; total: number };
  teacherComment: string;
  principalComment: string;
  nextTermResumes: string;
}

export const getLetterGrade = (percentage: number): string => {
  if (percentage >= 70) return "A";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 45) return "D";
  if (percentage >= 40) return "E";
  return "F";
};

export const hasStudentIdCollision = (
  usersData: Record<string, UserRecord>,
  invitesData: Record<string, InviteRecord>,
  candidate: string
): boolean => {
  const normalizedCandidate = String(candidate || '').trim();
  if (!normalizedCandidate) return false;

  const existsInUsers = Object.values(usersData).some(
    (user) => String(user?.studentId || '').trim() === normalizedCandidate
  );
  if (existsInUsers) return true;

  return Object.values(invitesData).some(
    (invite) =>
      String(invite?.studentId || '').trim() === normalizedCandidate &&
      invite?.used !== true
  );
};

export const generateUniqueStudentId = (
  usersData: Record<string, UserRecord>,
  invitesData: Record<string, InviteRecord>,
  requestedStudentId = '',
  maxAttempts = 10
): string => {
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

export const generateParentCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KGR-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};
