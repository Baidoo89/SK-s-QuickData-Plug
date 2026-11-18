import type { ReactNode } from "react"

type PageHeaderProps = {
  title: string
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  as?: "h1" | "h2"
  className?: string
}

export function PageHeader({ title, description, eyebrow, actions, as = "h1", className = "" }: PageHeaderProps) {
  const Heading = as

  return (
    <div className={`flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p> : null}
        <Heading className="text-2xl font-bold tracking-tight md:text-3xl">{title}</Heading>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="grid w-full min-w-0 gap-2 sm:flex sm:w-auto sm:items-center">{actions}</div> : null}
    </div>
  )
}
