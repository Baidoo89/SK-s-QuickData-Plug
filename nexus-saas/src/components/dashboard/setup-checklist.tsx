import Link from "next/link"
import type { ComponentType } from "react"
import { CheckCircle2, ExternalLink, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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
      <li key={item.label} className="flex min-w-0 gap-3 rounded-lg border border-border bg-card p-4 sm:p-5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${item.complete ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
          {item.complete ? <CheckCircle2 className="h-5 w-5" aria-label="Complete" /> : index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold">{item.label}</h3>{item.complete && <span className="text-xs text-success">Done</span>}</div>
          <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
          <Link href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            {item.complete ? "Review" : item.action}{item.external && <ExternalLink className="ml-2 h-3 w-3" />}
          </Link>
        </div>
      </li>
    )
  }

  return (
    <div className="portal-page mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-2"><p className="text-xs font-semibold uppercase text-muted-foreground">Your shop</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Let’s get your shop ready</h1><p className="text-sm leading-6 text-muted-foreground">Work through these steps in order. Your progress updates as you finish each one.</p></div>
      <Card className="border-primary/30">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Rocket className="h-5 w-5 text-primary" />{ready ? "Setup complete" : "Your next step"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{complete} of {requiredItems.length} essentials complete</span><span className="text-muted-foreground">{ready ? "Ready to review your shop" : `${requiredItems.length - complete} remaining`}</span></div>
          <progress aria-label="Shop setup progress" className="h-2 w-full overflow-hidden rounded-full accent-primary" value={complete} max={requiredItems.length || 1} />
          <div className="space-y-2"><h2 className="font-semibold">{nextStep?.label ?? "Open your shop and check the buying experience"}</h2><p className="text-sm leading-6 text-muted-foreground">{nextStep?.description ?? "Check your products, prices and payment setup before sharing your link with customers."}</p></div>
          <div className="flex flex-wrap gap-2"><Button asChild><Link href={nextStep?.href ?? storePath ?? "/dashboard/orders"} target={ready && storePath ? "_blank" : undefined} rel={ready && storePath ? "noopener noreferrer" : undefined}>{nextStep?.action ?? (storePath ? "Preview my shop" : "View orders")}</Link></Button>{storePath && !ready && <Button asChild variant="outline"><Link href={storePath} target="_blank" rel="noopener noreferrer">Preview my shop</Link></Button>}</div>
        </CardContent>
      </Card>
      <section aria-labelledby="setup-essentials" className="space-y-3"><h2 id="setup-essentials" className="text-lg font-semibold">Essentials to start selling</h2><ol className="space-y-3">{requiredItems.map(step)}</ol></section>
      <details className="rounded-lg border border-border bg-card p-4 sm:p-5"><summary className="cursor-pointer text-sm font-semibold">Optional tools — add these when you need them</summary><p className="my-3 text-sm leading-6 text-muted-foreground">You can start with a shop link. Add a team, wallet funds or a website integration as your business grows.</p><ul className="space-y-3">{optionalItems.map(step)}</ul></details>
    </div>
  )
}
