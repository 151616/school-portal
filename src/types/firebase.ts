// ── Roles ──
export type UserRole = "student" | "teacher" | "admin" | "parent";

// ── Users/{uid} ──
export interface User {
  email: string;
  role: UserRole;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
  parentCode?: string;
  createdAt: number;
  schoolId?: string;
}

// ── grades/{studentUid}/{classId}/assignments/{assignmentId} ──
export type AssignmentType = "ca" | "exam";

export interface Assignment {
  name: string;
  score: number;
  maxScore: number;
  rubric?: string;
  type?: AssignmentType;
  teacherUid: string;
  updatedAt: number;
}

// ── classes/{classId}/students/{uid} ──
export interface ClassStudent {
  uid: string;
  email: string;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
}

// ── classes/{classId} ──
export interface SchoolClass {
  name: string;
  teacherUid: string;
  students?: Record<string, ClassStudent>;
  createdAt: number;
  schoolId?: string;
}

// ── attendance/{classId}/{date}/{studentUid} ──
export type AttendanceStatus = "present" | "tardy" | "absent" | "excused";

// ── invites/{inviteId} ──
export interface Invite {
  email: string;
  role: UserRole;
  studentId: string;
  firstName?: string;
  lastInitial?: string;
  createdAt: number;
  used: boolean;
  usedBy?: string;
  usedAt?: number;
  createdBy: string;
  schoolId?: string;
}

// ── notifications/{uid}/{notifId} ──
export type NotificationType = "grade" | "average" | "attendance";

export interface Notification {
  type?: NotificationType;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  classId?: string;
  assignmentId?: string;
}

// ── threads/{threadId} ──
export interface Thread {
  userA: string;
  userB: string;
  roleA: UserRole;
  roleB: UserRole;
  updatedAt: number;
  lastMessage?: string;
  lastSender?: string;
  readBy?: Record<string, number>;
}

// ── messages/{threadId}/{messageId} ──
export interface Message {
  from: string;
  text: string;
  createdAt: number;
}

// ── parentCodes/{code} ──
export interface ParentCode {
  studentUid: string;
  studentEmail: string;
  studentName: string;
  createdAt: number;
}

// ── schoolSettings/{schoolId} ──
export interface SchoolSettings {
  caWeight: number;
  examWeight: number;
  updatedAt?: number;
}

// ── teacherTemplates/{uid}/{templateId} ──
export interface TeacherTemplate {
  name: string;
  maxScore: number;
  rubric?: string;
  createdAt: number;
}

// ── auditLogs/{logId} ──
export interface AuditLog {
  action: string;
  createdAt: number;
  actorUid: string;
  actorEmail: string;
  [key: string]: unknown;
}
