import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface StatCardProps {
  label: string
  value: string
  delta?: string
  positive?: boolean
  icon?: React.ElementType
  className?: string
}

export function StatCard({ label, value, delta, positive = true, icon: Icon, className }: StatCardProps) {
  const hasDelta = delta && delta !== ""
  return (
    <div className={cn("bg-card border border-border rounded-lg p-5 flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
        {hasDelta && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", positive ? "text-success" : "text-destructive")}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {delta}
          </div>
        )}
        {!hasDelta && delta === "" && (
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Minus className="w-3 h-3" />
          </div>
        )}
      </div>
    </div>
  )
}
