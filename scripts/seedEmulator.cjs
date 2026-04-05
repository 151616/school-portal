/**
 * Seed script for Firebase emulators.
 * Creates test users in Auth emulator and populates Realtime Database.
 *
 * Usage: node scripts/seedEmulator.cjs
 * Requires emulators to be running first (npm run emulators).
 */

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";

const admin = require("firebase-admin");

const app = admin.initializeApp({
  projectId: "kgrades",
  databaseURL: "http://127.0.0.1:9000?ns=kgrades-default-rtdb",
});

const auth = admin.auth();
const db = admin.database();

// ---- Test users ----
const users = [
  {
    uid: "teacher-001",
    email: "test@teacher.com",
    password: "123456",
    displayName: "Test Teacher",
    role: "teacher",
    claims: { role: "teacher" },
  },
  {
    uid: "admin-001",
    email: "test@admin.com",
    password: "123456",
    displayName: "Test Admin",
    role: "admin",
    claims: { role: "admin", admin: true },
  },
  {
    uid: "student-001",
    email: "test@student.com",
    password: "123456",
    displayName: "Alice Smith",
    role: "student",
  },
  {
    uid: "student-002",
    email: "test2@student.com",
    password: "123456",
    displayName: "Bob Johnson",
    role: "student",
  },
  {
    uid: "student-003",
    email: "test3@student.com",
    password: "123456",
    displayName: "Carol Martinez",
    role: "student",
  },
  {
    uid: "parent-001",
    email: "test@parent.com",
    password: "123456",
    displayName: "Parent User",
    role: "parent",
    claims: { role: "parent" },
  },
];

// ---- Database seed data ----
const dbData = {
  Users: {
    "teacher-001": { email: "test@teacher.com", role: "teacher", firstName: "Test", lastInitial: "T" },
    "admin-001": { email: "test@admin.com", role: "admin", firstName: "Admin", lastInitial: "A" },
    "student-001": { email: "test@student.com", role: "student", firstName: "Alice", lastInitial: "S", studentId: "STU-001" },
    "student-002": { email: "test2@student.com", role: "student", firstName: "Bob", lastInitial: "J", studentId: "STU-002" },
    "student-003": { email: "test3@student.com", role: "student", firstName: "Carol", lastInitial: "M", studentId: "STU-003" },
    "parent-001": { email: "test@parent.com", role: "parent" },
  },
  classes: {
    "math-101": {
      name: "Math 101",
      teacherUid: "teacher-001",
      schoolId: "demo-school",
      students: {
        "student-001": { uid: "student-001", email: "test@student.com", firstName: "Alice", lastInitial: "S", studentId: "STU-001" },
        "student-002": { uid: "student-002", email: "test2@student.com", firstName: "Bob", lastInitial: "J", studentId: "STU-002" },
        "student-003": { uid: "student-003", email: "test3@student.com", firstName: "Carol", lastInitial: "M", studentId: "STU-003" },
      },
    },
    "science-201": {
      name: "Science 201",
      teacherUid: "teacher-001",
      schoolId: "demo-school",
      students: {
        "student-001": { uid: "student-001", email: "test@student.com", firstName: "Alice", lastInitial: "S", studentId: "STU-001" },
        "student-002": { uid: "student-002", email: "test2@student.com", firstName: "Bob", lastInitial: "J", studentId: "STU-002" },
      },
    },
    "english-301": {
      name: "English 301",
      teacherUid: "teacher-001",
      schoolId: "demo-school",
      students: {
        "student-002": { uid: "student-002", email: "test2@student.com", firstName: "Bob", lastInitial: "J", studentId: "STU-002" },
        "student-003": { uid: "student-003", email: "test3@student.com", firstName: "Carol", lastInitial: "M", studentId: "STU-003" },
      },
    },
  },
  teachers: {
    "teacher-001": {
      classes: {
        "math-101": true,
        "science-201": true,
        "english-301": true,
      },
    },
  },
  grades: {
    "student-001": {
      "math-101": {
        assignments: {
          "homework-1": { name: "Homework 1", score: 85, maxScore: 100, type: "ca", teacherUid: "teacher-001", updatedAt: Date.now() },
          "midterm": { name: "Midterm Exam", score: 78, maxScore: 100, type: "exam", teacherUid: "teacher-001", updatedAt: Date.now() },
        },
      },
      "science-201": {
        assignments: {
          "lab-report-1": { name: "Lab Report 1", score: 92, maxScore: 100, type: "ca", teacherUid: "teacher-001", updatedAt: Date.now() },
        },
      },
    },
    "student-002": {
      "math-101": {
        assignments: {
          "homework-1": { name: "Homework 1", score: 72, maxScore: 100, type: "ca", teacherUid: "teacher-001", updatedAt: Date.now() },
          "midterm": { name: "Midterm Exam", score: 88, maxScore: 100, type: "exam", teacherUid: "teacher-001", updatedAt: Date.now() },
        },
      },
    },
    "student-003": {
      "math-101": {
        assignments: {
          "homework-1": { name: "Homework 1", score: 95, maxScore: 100, type: "ca", teacherUid: "teacher-001", updatedAt: Date.now() },
        },
      },
    },
  },
  parents: {
    "parent-001": {
      children: {
        "student-001": true,
      },
    },
  },
  notifications: {
    "teacher-001": {
      "notif-1": { title: "Welcome", body: "Welcome to KGrades, Teacher!", createdAt: Date.now(), read: false, type: "system" },
    },
    "student-001": {
      "notif-1": { title: "New grade in math-101", body: "Homework 1: 85/100", createdAt: Date.now(), read: false, type: "grade", classId: "math-101" },
    },
  },
};

// ---- Main ----

async function main() {
  console.log("Seeding Firebase emulators...\n");

  // 1. Create auth users
  console.log("Creating auth users...");
  for (const user of users) {
    try {
      // Delete existing user if any
      try { await auth.deleteUser(user.uid); } catch { /* ignore */ }

      await auth.createUser({
        uid: user.uid,
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        emailVerified: true,
      });

      if (user.claims) {
        await auth.setCustomUserClaims(user.uid, user.claims);
      }

      console.log(`  Created: ${user.email} (${user.role})`);
    } catch (err) {
      console.error(`  Error creating ${user.email}:`, err.message);
    }
  }

  // 2. Seed database
  console.log("\nSeeding Realtime Database...");
  await db.ref("/").set(dbData);
  console.log("  Database seeded with classes, grades, and notifications.");

  console.log("\n--- Seed complete ---");
  console.log("\nTest accounts (all passwords: 123456):");
  console.log("  Teacher:  test@teacher.com");
  console.log("  Admin:    test@admin.com");
  console.log("  Student:  test@student.com");
  console.log("  Student:  test2@student.com");
  console.log("  Student:  test3@student.com");
  console.log("  Parent:   test@parent.com");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
