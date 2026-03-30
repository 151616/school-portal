// ── academicConfig/{schoolId} ──
export interface Term {
  label: string;       // "1st Term"
  startDate: string;   // "2025-09-08"
  endDate: string;     // "2025-12-13"
}

export interface AcademicSession {
  label: string;                    // "2025/2026"
  terms: Record<string, Term>;     // { term1: {...}, term2: {...}, term3: {...} }
  activeTerm: string;              // "term1"
}

export interface AcademicConfig {
  termStructure: string[];                    // ["1st Term", "2nd Term", "3rd Term"]
  sessions: Record<string, AcademicSession>; // { "2025-2026": {...} }
  currentSession: string;                    // "2025-2026"
}

// ── reportCards/{sessionId}/{termId}/{studentUid} ──
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

export interface ReportCard {
  studentName: string;
  studentId: string;
  className: string;
  classId: string;
  session: string;        // display label "2025/2026"
  term: string;           // display label "2nd Term"
  sessionId: string;
  termId: string;
  schoolId: string;
  publishedAt: number;
  publishedBy: string;

  subjects: Record<string, ReportCardSubject>;

  classPosition: number;
  classSize: number;
  overallAverage: number;

  attendance: {
    present: number;
    total: number;
  };

  teacherComment: string;
  principalComment: string;
  nextTermResumes: string;
}

// ── reportComments/{sessionId}/{termId}/{studentUid} ──
export interface ReportComments {
  teacherComment?: string;
  principalComment?: string;
}
