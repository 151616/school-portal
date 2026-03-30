"use client"

import { cn } from "@/lib/utils"
import { type Role } from "@/lib/sample-data"
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  BarChart2,
  MessageSquare,
  Bell,
  Settings,
  FileText,
  Calendar,
  GraduationCap,
  UserCheck,
  Award,
  ChevronRight,
} from "lucide-react"

interface NavItem {
  icon: React.ElementType
  label: string
  active?: boolean
}

const navByRole: Record<Role, NavItem[]> = {
  admin: [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: Users, label: "User Management" },
    { icon: BookOpen, label: "Classes & Rosters" },
    { icon: Calendar, label: "Academic Terms" },
    { icon: FileText, label: "Report Cards" },
    { icon: BarChart2, label: "Analytics" },
    { icon: MessageSquare, label: "Messages" },
    { icon: Bell, label: "Notifications" },
    { icon: Settings, label: "System Settings" },
  ],
  teacher: [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: BookOpen, label: "My Classes" },
    { icon: ClipboardList, label: "Gradebook" },
    { icon: UserCheck, label: "Attendance" },
    { icon: BarChart2, label: "Performance" },
    { icon: FileText, label: "Report Cards" },
    { icon: MessageSquare, label: "Messages" },
    { icon: Bell, label: "Notifications" },
    { icon: Settings, label: "Settings" },
  ],
  student: [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: BarChart2, label: "My Grades" },
    { icon: ClipboardList, label: "Assignments" },
    { icon: UserCheck, label: "Attendance" },
    { icon: FileText, label: "Report Card" },
    { icon: Award, label: "Achievements" },
    { icon: MessageSquare, label: "Messages" },
    { icon: Bell, label: "Notifications" },
    { icon: Settings, label: "Settings" },
  ],
  parent: [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: GraduationCap, label: "My Children" },
    { icon: BarChart2, label: "Performance" },
    { icon: UserCheck, label: "Attendance" },
    { icon: FileText, label: "Report Cards" },
    { icon: Bell, label: "Alerts" },
    { icon: MessageSquare, label: "Messages" },
    { icon: Settings, label: "Settings" },
  ],
}

interface SidebarProps {
  role: Role
  activeItem?: string
  onNavigate?: (label: string) => void
}

export function Sidebar({ role, activeItem, onNavigate }: SidebarProps) {
  const nav = navByRole[role]
  const active = activeItem ?? "Dashboard"

  return (
    <aside className="flex flex-col w-60 shrink-0 h-screen bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary">
          <GraduationCap className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="text-sidebar-foreground font-semibold text-base tracking-tight">KGrades</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {nav.map((item) => {
          const Icon = item.icon
          const isActive = active === item.label
          return (
            <button
              key={item.label}
              onClick={() => onNavigate?.(item.label)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors group",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground")} />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive && <ChevronRight className="w-3 h-3 opacity-50" />}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {role === "admin" ? "SM" : role === "teacher" ? "JC" : role === "student" ? "ML" : "AO"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {role === "admin" ? "Dr. Sarah Mitchell" : role === "teacher" ? "James Carter" : role === "student" ? "Marcus Lee" : "Aisha Obi"}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
