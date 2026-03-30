// src/utils/gradeUtils.ts

/**
 * Convert a percentage to a letter grade.
 * Uses the scale from ParentDashboard/StudentDashboard (A/B/C/D/F).
 */
export const letterGrade = (pct: number | null | undefined): string => {
  if (pct === null || pct === undefined) return "—";
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
};

/**
 * Calculate weighted average from CA and Exam assignments.
 * Returns null if there are no graded assignments.
 */
export const calculateWeightedAverage = (
  assignments: Array<{ score: number; maxScore: number; type?: string }>,
  caWeight: number,
  examWeight: number
): number | null => {
  const caAssignments = assignments.filter((a) => a.type === "ca");
  const examAssignments = assignments.filter((a) => a.type === "exam");

  if (caAssignments.length === 0 && examAssignments.length === 0) return null;

  const caTotal = caAssignments.reduce((s, a) => s + (a.score || 0), 0);
  const caMax = caAssignments.reduce((s, a) => s + (a.maxScore || 0), 0);
  const examTotal = examAssignments.reduce((s, a) => s + (a.score || 0), 0);
  const examMax = examAssignments.reduce((s, a) => s + (a.maxScore || 0), 0);

  const caPercent = caMax > 0 ? (caTotal / caMax) * 100 : 0;
  const examPercent = examMax > 0 ? (examTotal / examMax) * 100 : 0;
  const caW = caWeight / 100;
  const examW = examWeight / 100;

  if (caMax > 0 && examMax > 0) {
    return caPercent * caW + examPercent * examW;
  } else if (caMax > 0) {
    return caPercent;
  } else if (examMax > 0) {
    return examPercent;
  }
  return null;
};

/**
 * Calculate simple average (total score / total max * 100).
 * Returns null if totalMax is 0.
 */
export const calculateSimpleAverage = (
  assignments: Array<{ score: number; maxScore: number }>
): number | null => {
  const totalScore = assignments.reduce((s, a) => s + (a.score || 0), 0);
  const totalMax = assignments.reduce((s, a) => s + (a.maxScore || 0), 0);
  return totalMax > 0 ? (totalScore / totalMax) * 100 : null;
};
