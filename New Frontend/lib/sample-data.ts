// KGrades — Sample data for all role dashboards

export const currentUser = {
  name: "Dr. Sarah Mitchell",
  email: "s.mitchell@kgrades.edu",
  role: "admin" as Role,
  avatar: "SM",
}

export type Role = "admin" | "teacher" | "student" | "parent"

export const roles: { id: Role; label: string }[] = [
  { id: "admin", label: "Administrator" },
  { id: "teacher", label: "Teacher" },
  { id: "student", label: "Student" },
  { id: "parent", label: "Parent" },
]

// ─── Admin data ──────────────────────────────────────────────────────────────
export const adminStats = [
  { label: "Total Students", value: "1,284", delta: "+38", positive: true },
  { label: "Active Teachers", value: "74", delta: "+3", positive: true },
  { label: "Classes This Term", value: "142", delta: "0", positive: true },
  { label: "Report Cards Pending", value: "18", delta: "-5", positive: true },
]

export const users = [
  { id: 1, name: "James Carter", email: "j.carter@kgrades.edu", role: "Teacher", status: "Active", joined: "Sep 2023" },
  { id: 2, name: "Priya Sharma", email: "p.sharma@kgrades.edu", role: "Teacher", status: "Active", joined: "Aug 2022" },
  { id: 3, name: "Marcus Lee", email: "m.lee@kgrades.edu", role: "Student", status: "Active", joined: "Jan 2024" },
  { id: 4, name: "Aisha Obi", email: "a.obi@kgrades.edu", role: "Parent", status: "Active", joined: "Sep 2023" },
  { id: 5, name: "Tom Nguyen", email: "t.nguyen@kgrades.edu", role: "Student", status: "Inactive", joined: "Sep 2022" },
  { id: 6, name: "Clara Roth", email: "c.roth@kgrades.edu", role: "Teacher", status: "Active", joined: "Jan 2023" },
]

export const classes = [
  { id: 1, name: "Algebra II", teacher: "James Carter", students: 28, term: "Spring 2025", grade: "10" },
  { id: 2, name: "AP Biology", teacher: "Priya Sharma", students: 22, term: "Spring 2025", grade: "11" },
  { id: 3, name: "World History", teacher: "Clara Roth", students: 31, term: "Spring 2025", grade: "9" },
  { id: 4, name: "English Lit", teacher: "James Carter", students: 25, term: "Spring 2025", grade: "10" },
  { id: 5, name: "Chemistry", teacher: "Priya Sharma", students: 19, term: "Spring 2025", grade: "11" },
]

export const activityLog = [
  { time: "2 min ago", action: "Report cards published", actor: "System", type: "info" },
  { time: "14 min ago", action: "New user invited: tom.riley@email.com", actor: "Dr. Mitchell", type: "success" },
  { time: "1 hr ago", action: "Class roster updated: AP Biology", actor: "P. Sharma", type: "info" },
  { time: "3 hr ago", action: "Failed login attempt (3x)", actor: "Unknown", type: "warning" },
  { time: "5 hr ago", action: "Term 'Spring 2025' activated", actor: "Dr. Mitchell", type: "success" },
]

// ─── Teacher data ─────────────────────────────────────────────────────────────
export const teacherStats = [
  { label: "Students", value: "94", delta: "+2", positive: true },
  { label: "Assignments Due", value: "6", delta: "", positive: true },
  { label: "Avg. Class Grade", value: "83%", delta: "+2%", positive: true },
  { label: "Absent Today", value: "4", delta: "+1", positive: false },
]

export const gradebook = [
  { id: 1, name: "Aiden Brooks", quiz1: 88, quiz2: 92, midterm: 85, project: 90, avg: 89, status: "Present" },
  { id: 2, name: "Bella Cruz", quiz1: 74, quiz2: 68, midterm: 72, project: 80, avg: 74, status: "Present" },
  { id: 3, name: "Caleb Moore", quiz1: 95, quiz2: 97, midterm: 93, project: 98, avg: 96, status: "Present" },
  { id: 4, name: "Diana Patel", quiz1: 62, quiz2: 70, midterm: 65, project: 71, avg: 67, status: "Absent" },
  { id: 5, name: "Ethan Walker", quiz1: 80, quiz2: 84, midterm: 78, project: 86, avg: 82, status: "Tardy" },
  { id: 6, name: "Fiona Zhang", quiz1: 91, quiz2: 89, midterm: 94, project: 92, avg: 92, status: "Present" },
  { id: 7, name: "George Hill", quiz1: 55, quiz2: 60, midterm: 58, project: 65, avg: 60, status: "Present" },
]

export const attendanceWeek = [
  { day: "Mon", present: 26, absent: 1, tardy: 1 },
  { day: "Tue", present: 25, absent: 2, tardy: 1 },
  { day: "Wed", present: 27, absent: 1, tardy: 0 },
  { day: "Thu", present: 24, absent: 2, tardy: 2 },
  { day: "Fri", present: 23, absent: 3, tardy: 2 },
]

// ─── Student data ─────────────────────────────────────────────────────────────
export const studentStats = [
  { label: "Overall GPA", value: "3.7", delta: "+0.1", positive: true },
  { label: "Assignments Done", value: "42/45", delta: "", positive: true },
  { label: "Attendance Rate", value: "96%", delta: "+1%", positive: true },
  { label: "Days Until Finals", value: "18", delta: "", positive: true },
]

export const studentGrades = [
  { subject: "Algebra II", teacher: "J. Carter", grade: "A-", pct: 91, trend: "up" },
  { subject: "AP Biology", teacher: "P. Sharma", grade: "B+", pct: 88, trend: "up" },
  { subject: "World History", teacher: "C. Roth", grade: "A", pct: 94, trend: "stable" },
  { subject: "English Lit", teacher: "J. Carter", grade: "B", pct: 83, trend: "down" },
  { subject: "PE", teacher: "R. Davis", grade: "A+", pct: 100, trend: "stable" },
]

export const studentAssignments = [
  { title: "Quadratic Equations HW", subject: "Algebra II", due: "Apr 2", score: "18/20", status: "Graded" },
  { title: "Cell Division Essay", subject: "AP Biology", due: "Apr 5", score: null, status: "Submitted" },
  { title: "WWII Chapter Summary", subject: "World History", due: "Apr 3", score: "47/50", status: "Graded" },
  { title: "Shakespeare Analysis", subject: "English Lit", due: "Apr 7", score: null, status: "Pending" },
  { title: "Lab Report: Osmosis", subject: "AP Biology", due: "Mar 28", score: "88/100", status: "Graded" },
]

export const gradeHistory = [
  { month: "Sep", gpa: 3.4 },
  { month: "Oct", gpa: 3.5 },
  { month: "Nov", gpa: 3.6 },
  { month: "Dec", gpa: 3.5 },
  { month: "Jan", gpa: 3.6 },
  { month: "Feb", gpa: 3.7 },
  { month: "Mar", gpa: 3.7 },
]

// ─── Parent data ──────────────────────────────────────────────────────────────
export const children = [
  {
    id: 1,
    name: "Marcus Lee",
    grade: "Grade 10",
    gpa: "3.4",
    attendance: "94%",
    avatar: "ML",
  },
  {
    id: 2,
    name: "Zoe Lee",
    grade: "Grade 7",
    gpa: "3.8",
    attendance: "98%",
    avatar: "ZL",
  },
]

export const parentAlerts = [
  { type: "warning", message: "Marcus missed AP Biology on Mar 28", time: "2 days ago" },
  { type: "info", message: "Zoe received an A on her Math test", time: "3 days ago" },
  { type: "error", message: "Marcus has a pending assignment: Shakespeare Analysis", time: "4 days ago" },
  { type: "info", message: "Spring 2025 report cards are now available", time: "1 week ago" },
]

export const performanceTrend = [
  { month: "Sep", marcus: 82, zoe: 90 },
  { month: "Oct", marcus: 84, zoe: 91 },
  { month: "Nov", marcus: 81, zoe: 93 },
  { month: "Dec", marcus: 83, zoe: 92 },
  { month: "Jan", marcus: 85, zoe: 94 },
  { month: "Feb", marcus: 86, zoe: 95 },
  { month: "Mar", marcus: 85, zoe: 96 },
]

export const notifications = [
  { id: 1, title: "Report card published", body: "Spring 2025 report cards are now available.", time: "1h ago", read: false },
  { id: 2, title: "Assignment graded", body: "Your Quadratic Equations HW received 18/20.", time: "3h ago", read: false },
  { id: 3, title: "Attendance alert", body: "You were marked absent on Mar 28.", time: "2d ago", read: true },
  { id: 4, title: "New message from J. Carter", body: "Please schedule a parent-teacher meeting.", time: "3d ago", read: true },
]
