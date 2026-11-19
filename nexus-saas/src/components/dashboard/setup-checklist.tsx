import Link from "next/link"
import type { ComponentType } from "react"
import { CheckCircle2, ExternalLink, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"

export type SetupItem = {
  label: string
  description: string
  href: string
  complete: boolean
  required: boolean
  icon: ComponentType<{ className?: string }>
  action: string
  external?: boolean
}

export function SetupChecklist({ requiredItems, optionalItems, storePath }: {
  requiredItems: SetupItem[]
  optionalItems: SetupItem[]
  storePath: string | null
}) {
  const complete = requiredItems.filter(item => item.complete).length
  const nextStep = requiredItems.find(item => !item.complete)
  const ready = !nextStep

  function step(item: SetupItem, index: number) {
    const Icon = item.icon
    return (
      <li key={item.label} className="flex min-w-0 items-center gap-3 border-b border-border/70 px-3 py-3 last:border-b-0 sm:px-4">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${item.complete ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
          {item.complete ? <CheckCircle2 className="h-5 w-5" aria-label="Complete" /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><h3 className="truncate text-sm font-semibold">{item.label}</h3></div>
          <p className="truncate text-xs text-muted-foreground">{item.description}</p>
        </div>
        <Link href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} className="inline-flex min-h-9 shrink-0 items-center text-xs font-medium text-primary underline-offset-4 hover:underline">
          {item.complete ? "Review" : item.action}{item.external && <ExternalLink className="ml-1.5 h-3 w-3" />}
        </Link>
      </li>
    )
  }

  return (
    <div className="portal-page mx-auto w-full max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Store"
        title="Setup"
        description={ready ? "Your shop is ready to review." : `${complete} of ${requiredItems.length} essentials complete.`}
        actions={storePath ? (
          <Button asChild variant="outline" size="sm">
            <Link href={storePath} target="_blank" rel="noopener noreferrer">Preview shop <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link>
          </Button>
        ) : undefined}
      />

      <Card className="premium-surface overflow-hidden rounded-lg border-primary/25">
        <CardHeader className="border-b bg-muted/20 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Rocket className="h-4 w-4 text-primary" />{ready ? "Ready to sell" : "Next step"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 text-xs"><span>{complete}/{requiredItems.length} complete</span><span className="text-muted-foreground">{ready ? "Review your shop" : `${requiredItems.length - complete} left`}</span></div>
          <progress aria-label="Shop setup progress" className="h-2 w-full overflow-hidden rounded-full accent-primary" value={complete} max={requiredItems.length || 1} />
          {!ready && nextStep ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold">{nextStep.label}</p>
              <Button asChild size="sm"><Link href={nextStep.href}>{nextStep.action}</Link></Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section aria-labelledby="setup-essentials" className="space-y-2">
        <h2 id="setup-essentials" className="text-sm font-semibold">Required</h2>
        <Card className="premium-surface overflow-hidden rounded-lg"><ol>{requiredItems.map(step)}</ol></Card>
      </section>

      <details className="rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
        <summary className="cursor-pointer text-sm font-semibold">Optional tools</summary>
        <p className="my-3 text-xs text-muted-foreground">Add these when the shop needs them.</p>
        <Card className="overflow-hidden rounded-lg"><ul>{optionalItems.map(step)}</ul></Card>
      </details>
    </div>
  )
}
