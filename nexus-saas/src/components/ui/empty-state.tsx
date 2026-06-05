import Link from "next/link"
import type { ComponentType } from "react"

import { Button } from "@/components/ui/button"

type EmptyStateAction = {
  label: string
  href: string
  variant?: "default" | "outline" | "secondary"
}

type EmptyStateProps = {
  icon?: ComponentType<{ className?: string }>
  title: string
  description: string
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center",
        className,
      ].join(" ")}
    >
      {Icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border bg-background">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : null}
      <div className="max-w-md space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {action ? (
            <Button asChild size="sm" variant={action.variant ?? "default"}>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button asChild size="sm" variant={secondaryAction.variant ?? "outline"}>
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
