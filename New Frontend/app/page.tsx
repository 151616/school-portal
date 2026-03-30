"use client"

import { useState } from "react"
import { Sidebar } from "@/components/kgrades/sidebar"
import { Header } from "@/components/kgrades/header"
import { AdminDashboard } from "@/components/kgrades/admin-dashboard"
import { TeacherDashboard } from "@/components/kgrades/teacher-dashboard"
import { StudentDashboard } from "@/components/kgrades/student-dashboard"
import { ParentDashboard } from "@/components/kgrades/parent-dashboard"
import { type Role } from "@/lib/sample-data"

const defaultNavByRole: Record<Role, string> = {
  admin: "Dashboard",
  teacher: "Dashboard",
  student: "Dashboard",
  parent: "Dashboard",
}

export default function Home() {
  const [role, setRole] = useState<Role>("admin")
  const [activeItem, setActiveItem] = useState("Dashboard")

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole)
    setActiveItem(defaultNavByRole[newRole])
  }

  const DashboardContent = {
    admin: AdminDashboard,
    teacher: TeacherDashboard,
    student: StudentDashboard,
    parent: ParentDashboard,
  }[role]

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      <Sidebar role={role} activeItem={activeItem} onNavigate={setActiveItem} />
      <div className="flex flex-col flex-1 min-w-0">
        <Header role={role} activeItem={activeItem} notifCount={2} onRoleChange={handleRoleChange} />
        <DashboardContent />
      </div>
    </div>
  )
}
