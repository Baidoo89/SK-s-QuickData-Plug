import { AlertTriangle } from "lucide-react"

type PortalAccessMessageProps = {
  title: string
  description: string
}

export function PortalAccessMessage({ title, description }: PortalAccessMessageProps) {
  return (
    <div className="flex min-h-[280px] items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg rounded-md border bg-background p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border bg-muted/30">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
