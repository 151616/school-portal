"use client"

import { useState } from "react"
import { StatCard } from "./stat-card"
import {
  adminStats, users, classes, activityLog,
} from "@/lib/sample-data"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import {
  Users, BookOpen, UserPlus, MoreHorizontal, X, CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const enrollmentData = [
  { grade: "9", students: 310 },
  { grade: "10", students: 342 },
  { grade: "11", students: 328 },
  { grade: "12", students: 304 },
]

const statusColor: Record<string, string> = {
  Active: "bg-success/15 text-success",
  Inactive: "bg-muted text-muted-foreground",
}

const activityColor: Record<string, string> = {
  info: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  error: "bg-destructive/15 text-destructive",
}

const roleColor: Record<string, string> = {
  Teacher: "bg-chart-2/15 text-chart-2",
  Student: "bg-primary/15 text-primary",
  Parent: "bg-chart-4/15 text-chart-4",
}

export function AdminDashboard() {
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showClassModal, setShowClassModal] = useState(false)
  const [tab, setTab] = useState<"users" | "classes">("users")

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {adminStats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} positive={s.positive} />
        ))}
      </div>

      {/* Middle row: enrollment chart + activity log */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Enrollment by grade */}
        <div className="lg:col-span-3 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Enrollment by Grade</h2>
              <p className="text-xs text-muted-foreground">Spring 2025 — 1,284 total</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={enrollmentData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="grade" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} tickFormatter={(v) => `Gr ${v}`} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-foreground)" }}
                cursor={{ fill: "var(--color-border)", opacity: 0.5 }}
              />
              <Bar dataKey="students" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity log */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">System Activity</h2>
          <div className="space-y-3">
            {activityLog.map((log, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={cn("mt-0.5 shrink-0 w-2 h-2 rounded-full", {
                  "bg-primary": log.type === "info",
                  "bg-success": log.type === "success",
                  "bg-warning": log.type === "warning",
                  "bg-destructive": log.type === "error",
                })} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-relaxed">{log.action}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{log.actor} · {log.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* User/Class management table */}
      <div className="bg-card border border-border rounded-lg">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5">
            {(["users", "classes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-1 rounded-sm text-xs font-medium capitalize transition-colors",
                  tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "users" ? "Users" : "Classes"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {tab === "users" ? (
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Invite User
              </button>
            ) : (
              <button
                onClick={() => setShowClassModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                New Class
              </button>
            )}
          </div>
        </div>

        {tab === "users" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Name", "Email", "Role", "Status", "Joined", ""].map((h) => (
                  <th key={h} className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground text-sm">{u.name}</td>
                  <td className="px-5 py-3 text-muted-foreground text-sm">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-md", roleColor[u.role])}>{u.role}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-md", statusColor[u.status])}>{u.status}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-sm">{u.joined}</td>
                  <td className="px-5 py-3">
                    <button
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                      aria-label="More actions"
                      title="More actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Class", "Teacher", "Students", "Grade", "Term", ""].map((h) => (
                  <th key={h} className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classes.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.teacher}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.students}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.grade}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.term}</td>
                  <td className="px-5 py-3">
                    <button
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                      aria-label="More actions"
                      title="More actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">Invite New User</h2>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
                aria-label="Close invite new user modal"
                title="Close invite new user modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="invite-full-name" className="text-xs font-medium text-muted-foreground block mb-1.5">Full Name</label>
                <input id="invite-full-name" className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="e.g. Jane Smith" />
              </div>
              <div>
                <label htmlFor="invite-email-address" className="text-xs font-medium text-muted-foreground block mb-1.5">Email Address</label>
                <input id="invite-email-address" className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="user@kgrades.edu" />
              </div>
              <div>
                <label htmlFor="invite-role" className="text-xs font-medium text-muted-foreground block mb-1.5">Role</label>
                <select id="invite-role" className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  <option>Teacher</option>
                  <option>Student</option>
                  <option>Parent</option>
                  <option>Administrator</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowInviteModal(false)} className="flex-1 px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Send Invite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Class Modal */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">Create New Class</h2>
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
                aria-label="Close create new class modal"
                title="Close create new class modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="new-class-name" className="text-xs font-medium text-muted-foreground block mb-1.5">Class Name</label>
                <input id="new-class-name" className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="e.g. AP Chemistry" />
              </div>
              <div>
                <label htmlFor="new-class-teacher" className="text-xs font-medium text-muted-foreground block mb-1.5">Assign Teacher</label>
                <select id="new-class-teacher" className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  <option>James Carter</option>
                  <option>Priya Sharma</option>
                  <option>Clara Roth</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-class-grade-level" className="text-xs font-medium text-muted-foreground block mb-1.5">Grade Level</label>
                  <select id="new-class-grade-level" className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                    {["9", "10", "11", "12"].map(g => <option key={g}>Grade {g}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-class-max-students" className="text-xs font-medium text-muted-foreground block mb-1.5">Max Students</label>
                  <input id="new-class-max-students" type="number" defaultValue={30} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowClassModal(false)} className="flex-1 px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => setShowClassModal(false)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Create Class
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
