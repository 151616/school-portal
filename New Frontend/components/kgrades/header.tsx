"use client"

import { Bell, Search, ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { type Role } from "@/lib/sample-data"
import { cn } from "@/lib/utils"

const roleTitles: Record<Role, string> = {
  admin: "Administrator Portal",
  teacher: "Teacher Portal",
  student: "Student Portal",
  parent: "Parent Portal",
}

const roleColors: Record<Role, string> = {
  admin: "bg-chart-4/15 text-chart-4 border-chart-4/20",
  teacher: "bg-chart-2/15 text-chart-2 border-chart-2/20",
  student: "bg-primary/15 text-primary border-primary/20",
  parent: "bg-chart-3/15 text-chart-3 border-chart-3/20",
}

interface HeaderProps {
  role: Role
  activeItem: string
  notifCount?: number
  onRoleChange?: (role: Role) => void
}

const roles: Role[] = ["admin", "teacher", "student", "parent"]

export function Header({ role, activeItem, notifCount = 2, onRoleChange }: HeaderProps) {
  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
      {/* Left: page title */}
      <div className="flex flex-col justify-center">
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">{roleTitles[role]}</p>
        <h1 className="text-base font-semibold text-foreground leading-tight">{activeItem}</h1>
      </div>

      {/* Right: search + actions */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden sm:flex items-center">
          <Search className="absolute left-3 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="bg-secondary border border-border rounded-md pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-48"
            placeholder="Search…"
          />
        </div>

        {/* Role switcher (demo only) */}
        <div className="relative group">
          <button className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium capitalize transition-colors", roleColors[role])}>
            {role}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          <div className="absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded-md shadow-lg py-1 z-50 hidden group-hover:block">
            {roles.map((r) => (
              <button
                key={r}
                onClick={() => onRoleChange?.(r)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs font-medium capitalize transition-colors hover:bg-secondary",
                  r === role ? "text-primary" : "text-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <button className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Bell className="w-4 h-4" />
          {notifCount > 0 && (
            <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
              {notifCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
