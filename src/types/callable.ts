import type { UserRole } from "./firebase";

// ── createInvite ──
export interface CreateInviteData {
  email: string;
  role: UserRole;
  studentId?: string;
  firstName?: string;
  lastInitial?: string;
  schoolId?: string;
}

export interface CreateInviteResult {
  success: boolean;
  inviteId: string;
  email: string;
  role: UserRole;
  studentId: string;
}

// ── assignRoleFromInvite ──
export interface AssignRoleData {
  inviteId: string;
  firstName?: string;
  lastInitial?: string;
}

export interface AssignRoleResult {
  success: boolean;
  role: UserRole;
}

// ── claimParentCode ──
export interface ClaimParentCodeData {
  code: string;
  firstName?: string;
  lastInitial?: string;
}

export interface ClaimParentCodeResult {
  success: boolean;
  studentName: string;
  studentId: string;
}

// ── linkAdditionalChild ──
export interface LinkChildData {
  code: string;
}

export interface LinkChildResult {
  success: boolean;
  studentName: string;
  studentId: string;
}

// ── deleteUserByAdmin ──
export interface DeleteUserData {
  uid: string;
}

export interface DeleteUserResult {
  success: boolean;
}

// ── backfillParentCodes ──
export interface BackfillResult {
  success: boolean;
  generated: number;
  skipped: number;
}

// ── publishReportCards ──
export interface PublishReportCardsData {
  sessionId: string;
  termId: string;
  schoolId: string;
}

export interface PublishReportCardsResult {
  success: boolean;
  published: number;
  skipped: number;
  errors: string[];
}

// ── backfillAssignmentTerms ──
export interface BackfillAssignmentTermsData {
  sessionId: string;
  schoolId: string;
}

export interface BackfillAssignmentTermsResult {
  success: boolean;
  updated: number;
  unmatched: number;
}
