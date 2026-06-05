import type { ComponentType, ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type MetricTone = "primary" | "success" | "warning" | "info" | "destructive" | "muted"

const toneClasses: Record<MetricTone, { bar: string; icon: string }> = {
  primary: {
    bar: "bg-primary",
    icon: "border-primary/20 bg-primary/10 text-primary",
  },
  success: {
    bar: "bg-success",
    icon: "border-success/20 bg-success/10 text-success",
  },
  warning: {
    bar: "bg-warning",
    icon: "border-warning/20 bg-warning/10 text-warning",
  },
  info: {
    bar: "bg-info",
    icon: "border-info/20 bg-info/10 text-info",
  },
  destructive: {
    bar: "bg-destructive",
    icon: "border-destructive/20 bg-destructive/10 text-destructive",
  },
  muted: {
    bar: "bg-muted-foreground",
    icon: "border-border bg-muted text-muted-foreground",
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
    <Card className={cn("overflow-hidden border border-border bg-card/95 shadow-sm", className)}>
      <div className={cn("h-1", classes.bar)} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className="mt-2 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {value}
            </div>
          </div>
          {Icon ? (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md border", classes.icon)}>
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
        {description ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  )
}
