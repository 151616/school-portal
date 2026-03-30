// src/utils/roleUtils.ts

/**
 * Mapping of each role to the roles it can message.
 */
export const roleTargets: Record<string, string[]> = {
  student: ["teacher"],
  teacher: ["student", "admin", "parent"],
  admin: ["teacher", "student"],
  parent: ["teacher"],
};

/**
 * Set of valid role-pair combinations (sorted alphabetically, colon-separated).
 */
export const allowedPairs: Set<string> = new Set([
  "admin:student",
  "admin:teacher",
  "student:teacher",
  "parent:teacher",
]);

/**
 * Normalize a role string (lowercase, trimmed).
 */
export const normalizeRole = (role: string | null | undefined): string =>
  String(role || "").trim().toLowerCase();

/**
 * Check whether two roles are allowed to communicate.
 */
export const isAllowedRolePair = (roleA: string, roleB: string): boolean => {
  const a = normalizeRole(roleA);
  const b = normalizeRole(roleB);
  const pair = [a, b].sort().join(":");
  return allowedPairs.has(pair);
};
