import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface Assignment_Key {
  id: UUIDString;
  __typename?: 'Assignment_Key';
}

export interface Course_Key {
  id: UUIDString;
  __typename?: 'Course_Key';
}

export interface CreateNewUserData {
  user_insert: User_Key;
}

export interface CreateNewUserVariables {
  firstName: string;
  lastName: string;
  username: string;
  passwordHash: string;
  email: string;
  role: string;
}

export interface EnrollUserInCourseData {
  enrollment_insert: Enrollment_Key;
}

export interface EnrollUserInCourseVariables {
  studentId: UUIDString;
  courseId: UUIDString;
  enrollmentDate: DateString;
}

export interface Enrollment_Key {
  studentId: UUIDString;
  courseId: UUIDString;
  __typename?: 'Enrollment_Key';
}

export interface GetCoursesForStudentData {
  enrollments: ({
    course: {
      id: UUIDString;
      name: string;
      description?: string | null;
      courseCode: string;
    } & Course_Key;
  })[];
}

export interface GetCoursesForStudentVariables {
  studentId: UUIDString;
}

export interface GetUserByUsernameData {
  users: ({
    id: UUIDString;
    firstName: string;
    lastName: string;
    email?: string | null;
    role: string;
  } & User_Key)[];
}

export interface GetUserByUsernameVariables {
  username: string;
}

export interface Grade_Key {
  enrollmentStudentId: UUIDString;
  enrollmentCourseId: UUIDString;
  assignmentId: UUIDString;
  __typename?: 'Grade_Key';
}

export interface ScheduleEntry_Key {
  id: UUIDString;
  __typename?: 'ScheduleEntry_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

/** Generated Node Admin SDK operation action function for the 'CreateNewUser' Mutation. Allow users to execute without passing in DataConnect. */
export function createNewUser(dc: DataConnect, vars: CreateNewUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateNewUserData>>;
/** Generated Node Admin SDK operation action function for the 'CreateNewUser' Mutation. Allow users to pass in custom DataConnect instances. */
export function createNewUser(vars: CreateNewUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateNewUserData>>;

/** Generated Node Admin SDK operation action function for the 'GetUserByUsername' Query. Allow users to execute without passing in DataConnect. */
export function getUserByUsername(dc: DataConnect, vars: GetUserByUsernameVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetUserByUsernameData>>;
/** Generated Node Admin SDK operation action function for the 'GetUserByUsername' Query. Allow users to pass in custom DataConnect instances. */
export function getUserByUsername(vars: GetUserByUsernameVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetUserByUsernameData>>;

/** Generated Node Admin SDK operation action function for the 'EnrollUserInCourse' Mutation. Allow users to execute without passing in DataConnect. */
export function enrollUserInCourse(dc: DataConnect, vars: EnrollUserInCourseVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<EnrollUserInCourseData>>;
/** Generated Node Admin SDK operation action function for the 'EnrollUserInCourse' Mutation. Allow users to pass in custom DataConnect instances. */
export function enrollUserInCourse(vars: EnrollUserInCourseVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<EnrollUserInCourseData>>;

/** Generated Node Admin SDK operation action function for the 'GetCoursesForStudent' Query. Allow users to execute without passing in DataConnect. */
export function getCoursesForStudent(dc: DataConnect, vars: GetCoursesForStudentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCoursesForStudentData>>;
/** Generated Node Admin SDK operation action function for the 'GetCoursesForStudent' Query. Allow users to pass in custom DataConnect instances. */
export function getCoursesForStudent(vars: GetCoursesForStudentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCoursesForStudentData>>;

