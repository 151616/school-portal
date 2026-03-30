// src/utils/formatters.ts

interface UserLike {
  email?: string;
  firstName?: string;
  lastInitial?: string;
  studentId?: string;
}

interface ClassLike {
  id: string;
  name?: string;
}

/**
 * Format a teacher record for display in autocomplete dropdowns.
 */
export const formatTeacherLabel = (u: UserLike): string => {
  const first = u.firstName || "";
  const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
  const name = `${first} ${lastInitial}`.trim();
  return name ? `${name} - ${u.email}` : u.email || "";
};

/**
 * Format a student record for display in autocomplete dropdowns.
 */
export const formatStudentLabel = (u: UserLike): string => {
  const first = u.firstName || "";
  const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
  const name = `${first} ${lastInitial}`.trim();
  const id = u.studentId ? ` - ${u.studentId}` : "";
  return name ? `${name} - ${u.email}${id}`.trim() : `${u.email}${id}`.trim();
};

/**
 * Format a class record for display (e.g., "math101 - Mathematics").
 */
export const formatClassLabel = (c: ClassLike): string =>
  `${c.id} - ${c.name || "Untitled"}`;

/**
 * Format a user's display name (first + last initial).
 * Falls back to the provided fallback string.
 */
export const formatUserName = (u: UserLike | null | undefined, fallback = "Student"): string => {
  if (!u) return fallback;
  const first = u.firstName || "";
  const lastInitial = u.lastInitial ? `${u.lastInitial}.` : "";
  const name = `${first} ${lastInitial}`.trim();
  return name || fallback;
};
