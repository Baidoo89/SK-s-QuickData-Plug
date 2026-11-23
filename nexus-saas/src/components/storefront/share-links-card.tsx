"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Copy, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"

type ShareLink = {
  label: string
  path: string
}

export function ShareLinksCard({
  title,
  links,
}: {
  title: string
  links: ShareLink[]
}) {
  const { toast } = useToast()
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const handleCopy = async (path: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}${path}`)
      toast({ title: "Copied", description: "Link copied to clipboard." })
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Could not copy link." })
    }
  }

  return (
    <Card className="premium-surface overflow-hidden rounded-lg border-0">
      <CardHeader className="border-b border-border/70 bg-muted/20 px-3 py-3 sm:px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {links.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No shareable customer link is available yet.
          </div>
        ) : null}
        {links.map((link) => {
          const displayUrl = origin ? `${origin}${link.path}` : link.path
          return (
            <div key={`${link.label}:${link.path}`} className="grid gap-2 border-b border-border/60 px-3 py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-4">
              <p className="truncate text-xs font-semibold text-foreground">{link.label}</p>
              <Input readOnly value={displayUrl} className="min-w-0 bg-muted/35 font-mono text-[11px]" aria-label={`${link.label} URL`} />
              <div className="flex gap-2 sm:justify-end">
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => handleCopy(link.path)} aria-label={`Copy ${link.label}`}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button type="button" size="icon" variant="secondary" className="h-8 w-8" asChild aria-label={`Open ${link.label}`}>
                  <Link href={link.path} target="_blank">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
