"use client"

import { useState } from "react"
import { StatCard } from "./stat-card"
import { studentStats, studentGrades, studentAssignments, gradeHistory } from "@/lib/sample-data"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from "recharts"
import { TrendingUp, TrendingDown, Minus, FileText, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const assignmentStatus: Record<string, string> = {
  Graded: "bg-success/15 text-success",
  Submitted: "bg-primary/15 text-primary",
  Pending: "bg-warning/15 text-warning",
}

function gradeColor(pct: number) {
  if (pct >= 90) return "text-success"
  if (pct >= 80) return "text-chart-2"
  if (pct >= 70) return "text-warning"
  return "text-destructive"
}

export function StudentDashboard() {
  const [showReportCard, setShowReportCard] = useState(false)
  const [copied, setCopied] = useState(false)
  const parentCode = "K8X2-MQ9T"

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {studentStats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} positive={s.positive} />
        ))}
      </div>

      {/* GPA trend + parent code */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">GPA Trend</h2>
          <p className="text-xs text-muted-foreground mb-4">2024–2025 school year</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={gradeHistory}>
              <defs>
                <linearGradient id="gpaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <YAxis domain={[3.0, 4.0]} tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-foreground)" }} />
              <Area type="monotone" dataKey="gpa" stroke="var(--color-primary)" strokeWidth={2} fill="url(#gpaGrad)" dot={{ fill: "var(--color-primary)", r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {/* Parent code card */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Parent Access Code</h2>
            <p className="text-xs text-muted-foreground mb-3">Share this code so a parent can link to your account.</p>
            <div className="flex items-center gap-2 bg-secondary rounded-md px-3 py-2.5">
              <span className="flex-1 font-mono text-sm font-semibold text-foreground tracking-widest">{parentCode}</span>
              <button onClick={handleCopy} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Report card card */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Report Card</h2>
            <p className="text-xs text-muted-foreground mb-3">Spring 2025 — Published Apr 1, 2025</p>
            <button
              onClick={() => setShowReportCard(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors border border-primary/20"
            >
              <FileText className="w-4 h-4" />
              View Report Card
            </button>
          </div>
        </div>
      </div>

      {/* Grades table */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Current Grades</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Spring 2025</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Subject", "Teacher", "Grade", "Score", "Trend"].map((h) => (
                <th key={h} className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {studentGrades.map((g) => (
              <tr key={g.subject} className="hover:bg-secondary/40 transition-colors">
                <td className="px-5 py-3 font-medium text-foreground">{g.subject}</td>
                <td className="px-5 py-3 text-muted-foreground">{g.teacher}</td>
                <td className="px-5 py-3">
                  <span className={cn("text-lg font-bold tabular-nums", gradeColor(g.pct))}>{g.grade}</span>
                </td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{g.pct}%</td>
                <td className="px-5 py-3">
                  {g.trend === "up" && <TrendingUp className="w-4 h-4 text-success" />}
                  {g.trend === "down" && <TrendingDown className="w-4 h-4 text-destructive" />}
                  {g.trend === "stable" && <Minus className="w-4 h-4 text-muted-foreground" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assignments */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Assignments</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Recent &amp; upcoming</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Assignment", "Subject", "Due", "Score", "Status"].map((h) => (
                <th key={h} className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {studentAssignments.map((a) => (
              <tr key={a.title} className="hover:bg-secondary/40 transition-colors">
                <td className="px-5 py-3 font-medium text-foreground max-w-xs truncate">{a.title}</td>
                <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{a.subject}</td>
                <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{a.due}</td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{a.score ?? "—"}</td>
                <td className="px-5 py-3">
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-md", assignmentStatus[a.status])}>{a.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Report Card Modal */}
      {showReportCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">Report Card — Spring 2025</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Marcus Lee · Grade 10 · Westbrook High</p>
              </div>
              <button onClick={() => setShowReportCard(false)} className="p-1 rounded hover:bg-secondary text-muted-foreground text-xs font-medium">
                Close
              </button>
            </div>
            <div className="bg-secondary/50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">GPA</p>
                  <p className="text-xl font-bold text-foreground mt-1">3.7</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Attendance</p>
                  <p className="text-xl font-bold text-foreground mt-1">96%</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Conduct</p>
                  <p className="text-xl font-bold text-success mt-1">A</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {studentGrades.map((g) => (
                <div key={g.subject} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{g.subject}</p>
                    <p className="text-xs text-muted-foreground">{g.teacher}</p>
                  </div>
                  <span className={cn("text-base font-bold", gradeColor(g.pct))}>{g.grade}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-secondary rounded-md">
              <p className="text-xs font-medium text-muted-foreground mb-1">Teacher Comments</p>
              <p className="text-xs text-foreground leading-relaxed">
                Marcus demonstrates strong analytical skills and is a consistently engaged learner. Continued focus on English writing assignments is recommended to bring that grade up. Outstanding performance in PE and World History this term.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
