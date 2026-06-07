import type { ComponentType, ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type MetricTone = "primary" | "success" | "warning" | "info" | "destructive" | "muted"

const toneClasses: Record<MetricTone, { bar: string; icon: string; glow: string }> = {
  primary: {
    bar: "bg-primary",
    icon: "border-primary/25 bg-primary/10 text-primary",
    glow: "from-primary/10",
  },
  success: {
    bar: "bg-success",
    icon: "border-success/25 bg-success/10 text-success",
    glow: "from-success/10",
  },
  warning: {
    bar: "bg-warning",
    icon: "border-warning/25 bg-warning/10 text-warning",
    glow: "from-warning/10",
  },
  info: {
    bar: "bg-info",
    icon: "border-info/25 bg-info/10 text-info",
    glow: "from-info/10",
  },
  destructive: {
    bar: "bg-destructive",
    icon: "border-destructive/25 bg-destructive/10 text-destructive",
    glow: "from-destructive/10",
  },
  muted: {
    bar: "bg-muted-foreground",
    icon: "border-border bg-muted/70 text-muted-foreground",
    glow: "from-muted/30",
  },
}

type MetricCardProps = {
  label: string
  value: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ className?: string }>
  tone?: MetricTone
  className?: string
}

export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "primary",
  className,
}: MetricCardProps) {
  const classes = toneClasses[tone]

  return (
    <Card className={cn("group relative overflow-hidden border border-border/75 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_20px_52px_hsl(224_35%_3%_/_0.26)]", className)}>
      <div className={cn("absolute inset-x-0 top-0 h-1", classes.bar)} />
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-70", classes.glow)} />
      <CardContent className="relative p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase leading-4 text-muted-foreground">{label}</p>
            <div className="mt-2 break-words text-xl font-extrabold tracking-normal text-foreground sm:text-2xl">
              {value}
            </div>
          </div>
          {Icon ? (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border shadow-sm transition-transform duration-200 group-hover:scale-105", classes.icon)}>
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
        {description ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  )
}
