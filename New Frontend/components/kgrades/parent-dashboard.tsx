"use client"

import { useState } from "react"
import { children, parentAlerts, performanceTrend, studentGrades } from "@/lib/sample-data"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts"
import { AlertTriangle, Info, CheckCircle2, XCircle, Bell, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"

const alertIconMap: Record<string, React.ElementType> = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
  error: XCircle,
}

const alertStyle: Record<string, string> = {
  warning: "bg-warning/10 border-warning/20 text-warning",
  info: "bg-primary/10 border-primary/20 text-primary",
  success: "bg-success/10 border-success/20 text-success",
  error: "bg-destructive/10 border-destructive/20 text-destructive",
}

function gradeColor(pct: number) {
  if (pct >= 90) return "text-success"
  if (pct >= 80) return "text-chart-2"
  if (pct >= 70) return "text-warning"
  return "text-destructive"
}

export function ParentDashboard() {
  const [activeChild, setActiveChild] = useState(children[0])
  const [showReportCard, setShowReportCard] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Child switcher */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Viewing:</span>
        <div className="flex items-center gap-2">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setActiveChild(child)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors",
                activeChild.id === child.id
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                {child.avatar}
              </div>
              {child.name}
              <span className="text-[11px] opacity-70">{child.grade}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "GPA", value: activeChild.gpa, delta: "+0.1", positive: true },
          { label: "Attendance", value: activeChild.attendance, delta: "+1%", positive: true },
          { label: "Assignments", value: "42/45", delta: "", positive: true },
          { label: "Alerts", value: String(parentAlerts.length), delta: "", positive: false },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{s.label}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{s.value}</p>
            {s.delta && (
              <p className={cn("text-xs font-medium mt-1", s.positive ? "text-success" : "text-destructive")}>{s.delta}</p>
            )}
          </div>
        ))}
      </div>

      {/* Performance chart + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Multi-child performance trend */}
        <div className="lg:col-span-3 bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Performance Trend</h2>
          <p className="text-xs text-muted-foreground mb-4">Monthly average score — all children</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={performanceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <YAxis domain={[75, 100]} tickLine={false} axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-foreground)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }} />
              <Line type="monotone" dataKey="marcus" name="Marcus" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="zoe" name="Zoe" stroke="var(--color-chart-2)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Alerts panel */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Alerts</h2>
            <span className="ml-auto text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">{parentAlerts.length}</span>
          </div>
          <div className="space-y-2.5">
            {parentAlerts.map((alert, i) => {
              const Icon = alertIconMap[alert.type] ?? Info
              return (
                <div key={i} className={cn("flex items-start gap-2.5 p-2.5 rounded-md border text-xs", alertStyle[alert.type])}>
                  <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium leading-relaxed">{alert.message}</p>
                    <p className="opacity-70 mt-0.5">{alert.time}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Grade detail + report card */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-card border border-border rounded-lg">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">{activeChild.name}&apos;s Grades</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Spring 2025</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Subject", "Teacher", "Grade", "Score"].map((h) => (
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
                    <span className={cn("text-base font-bold", gradeColor(g.pct))}>{g.grade}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{g.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quick actions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <button
                onClick={() => setShowReportCard(true)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium text-foreground text-left"
              >
                <FileText className="w-4 h-4 text-muted-foreground" />
                View Report Card
              </button>
              <button className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium text-foreground text-left">
                <Bell className="w-4 h-4 text-muted-foreground" />
                Manage Notifications
              </button>
              <button className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium text-foreground text-left">
                <Info className="w-4 h-4 text-muted-foreground" />
                Contact Teacher
              </button>
            </div>
          </div>

          {/* Attendance summary */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Attendance Summary</h2>
            <div className="space-y-2">
              {[
                { label: "Present", count: 87, color: "bg-success" },
                { label: "Absent", count: 4, color: "bg-destructive" },
                { label: "Tardy", count: 2, color: "bg-warning" },
                { label: "Excused", count: 1, color: "bg-muted-foreground" },
              ].map((a) => (
                <div key={a.label} className="flex items-center gap-3">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", a.color)} />
                  <span className="text-sm text-foreground flex-1">{a.label}</span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Report Card Modal */}
      {showReportCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">Report Card — Spring 2025</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{activeChild.name} · {activeChild.grade}</p>
              </div>
              <button onClick={() => setShowReportCard(false)} className="p-1 rounded hover:bg-secondary text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-secondary/50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">GPA</p>
                  <p className="text-xl font-bold text-foreground mt-1">{activeChild.gpa}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Attendance</p>
                  <p className="text-xl font-bold text-foreground mt-1">{activeChild.attendance}</p>
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
                  <p className="text-sm font-medium text-foreground">{g.subject}</p>
                  <span className={cn("text-base font-bold", gradeColor(g.pct))}>{g.grade}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-secondary rounded-md">
              <p className="text-xs font-medium text-muted-foreground mb-1">Teacher Comments</p>
              <p className="text-xs text-foreground leading-relaxed">
                {activeChild.name === "Marcus Lee"
                  ? "Marcus demonstrates strong analytical skills and is a consistently engaged learner. Continued focus on English writing assignments is recommended."
                  : "Zoe is an exceptional student with strong performance across all subjects. Her dedication and enthusiasm make her a joy to teach."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
