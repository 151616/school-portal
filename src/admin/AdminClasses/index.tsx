import { useMemo } from "react";
import ClassCreation from "./ClassCreation";
import EnrollmentManager from "./EnrollmentManager";
import RosterManager from "./RosterManager";
import AttendanceSummary from "./AttendanceSummary";

// ---- shared types (re-exported for sub-components) ----

export interface UserRecord {
  uid: string;
  email?: string;
  role?: string;
  studentId?: string;
  firstName?: string;
  lastInitial?: string;
  schoolId?: string;
  [key: string]: unknown;
}

export interface ClassRecord {
  id: string;
  name?: string;
  teacherUid?: string;
  schoolId?: string;
  students?: Record<string, RosterStudent>;
  [key: string]: unknown;
}

export interface RosterStudent {
  uid: string;
  email?: string;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
}

export interface AttendanceRow {
  uid: string;
  name: string;
  email?: string;
  studentId?: string;
  present?: number;
  tardy?: number;
  absent?: number;
  excused?: number;
}

export interface AdminClassesProps {
  users: UserRecord[];
  classes: ClassRecord[];
  mySchoolId: string | null;
}

export const CLASS_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

// ---- component ----

export default function AdminClasses({ users, classes, mySchoolId }: AdminClassesProps) {
  const schoolScopedUsers = useMemo(
    () => (mySchoolId ? users.filter((u) => u.schoolId === mySchoolId) : users),
    [users, mySchoolId]
  );

  const schoolScopedClasses = useMemo(
    () => (mySchoolId ? classes.filter((c) => c.schoolId === mySchoolId) : classes),
    [classes, mySchoolId]
  );

  return (
    <>
      <ClassCreation
        users={schoolScopedUsers}
        classes={schoolScopedClasses}
        schoolScopedUsers={schoolScopedUsers}
        schoolScopedClasses={schoolScopedClasses}
        mySchoolId={mySchoolId}
      />

      <AttendanceSummary classes={schoolScopedClasses} />

      <EnrollmentManager
        schoolScopedUsers={schoolScopedUsers}
        schoolScopedClasses={schoolScopedClasses}
      />

      <RosterManager
        users={schoolScopedUsers}
        schoolScopedClasses={schoolScopedClasses}
      />
    </>
  );
}
