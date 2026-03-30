"use client"

import { useState } from "react"
import { StatCard } from "./stat-card"
import { teacherStats, gradebook, attendanceWeek } from "@/lib/sample-data"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import { MoreHorizontal, Pencil, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

const attendanceStatus = ["Present", "Absent", "Tardy", "Excused"]

const statusStyle: Record<string, string> = {
  Present: "bg-success/15 text-success",
  Absent: "bg-destructive/15 text-destructive",
  Tardy: "bg-warning/15 text-warning",
  Excused: "bg-muted text-muted-foreground",
}

function gradeColor(pct: number) {
  if (pct >= 90) return "text-success"
  if (pct >= 75) return "text-chart-2"
  if (pct >= 60) return "text-warning"
  return "text-destructive"
}

export function TeacherDashboard() {
  const [attendance, setAttendance] = useState<Record<number, string>>(
    Object.fromEntries(gradebook.map((s) => [s.id, s.status]))
  )
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<(typeof gradebook)[0] | null>(null)
  const [comment, setComment] = useState("")

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {teacherStats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} positive={s.positive} />
        ))}
      </div>

      {/* Attendance chart + quick class info */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Weekly Attendance</h2>
          <p className="text-xs text-muted-foreground mb-4">Algebra II — current week</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={attendanceWeek} barSize={18} barCategoryGap={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-foreground)" }} />
              <Bar dataKey="present" name="Present" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="absent" name="Absent" fill="var(--color-destructive)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="tardy" name="Tardy" fill="var(--color-warning)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* My Classes quick view */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">My Classes</h2>
          <div className="space-y-2">
            {[
              { name: "Algebra II", period: "P1 · 28 students", avg: "83%" },
              { name: "English Lit", period: "P3 · 25 students", avg: "79%" },
              { name: "Pre-Calculus", period: "P5 · 21 students", avg: "86%" },
            ].map((c) => (
              <div key={c.name} className="flex items-center justify-between px-3 py-2.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.period}</p>
                </div>
                <span className={cn("text-sm font-bold tabular-nums", gradeColor(parseInt(c.avg)))}>{c.avg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gradebook */}
      <div className="bg-card border border-border rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Gradebook — Algebra II</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Spring 2025 · Click a status to cycle attendance</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Student", "Quiz 1", "Quiz 2", "Midterm", "Project", "Average", "Attendance", ""].map((h) => (
                  <th key={h} className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gradebook.map((s) => {
                const currentStatus = attendance[s.id]
                const statusIdx = attendanceStatus.indexOf(currentStatus)
                return (
                  <tr key={s.id} className="hover:bg-secondary/40 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground whitespace-nowrap">{s.name}</td>
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">{s.quiz1}</td>
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">{s.quiz2}</td>
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">{s.midterm}</td>
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">{s.project}</td>
                    <td className={cn("px-5 py-3 font-bold tabular-nums", gradeColor(s.avg))}>{s.avg}%</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => {
                          const next = attendanceStatus[(statusIdx + 1) % attendanceStatus.length]
                          setAttendance((prev) => ({ ...prev, [s.id]: next }))
                        }}
                        className={cn("text-xs font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors", statusStyle[currentStatus])}
                      >
                        {currentStatus}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => { setSelectedStudent(s); setShowCommentModal(true) }}
                        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Add report card comment"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comment Modal */}
      {showCommentModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Report Card Comment</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedStudent.name} · Algebra II</p>
              </div>
              <button onClick={() => setShowCommentModal(false)} className="p-1 rounded hover:bg-secondary text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none h-32"
              placeholder={`Write a comment for ${selectedStudent.name}…`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowCommentModal(false)} className="flex-1 px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { setShowCommentModal(false); setComment("") }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Check className="w-4 h-4" />
                Save Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
