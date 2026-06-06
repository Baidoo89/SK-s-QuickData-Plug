"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Copy, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { buildStorefrontUrl } from "@/lib/storefront-url"

type ShareLink = {
  label: string
  path: string
  description?: string
}

export function ShareLinksCard({
  title,
  description,
  links,
}: {
  title: string
  description?: string
  links: ShareLink[]
}) {
  const { toast } = useToast()
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const handleCopy = async (path: string) => {
    try {
      await navigator.clipboard.writeText(buildStorefrontUrl(path, origin))
      toast({ title: "Copied", description: "Link copied to clipboard." })
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Could not copy link." })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {links.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No shareable customer link is available yet.
          </div>
        ) : null}
        {links.map((link) => {
          const displayUrl = origin ? buildStorefrontUrl(link.path, origin) : link.path
          return (
            <div key={`${link.label}:${link.path}`} className="space-y-2 rounded-lg border border-border bg-card/90 p-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">{link.label}</p>
                {link.description ? <p className="text-[11px] text-muted-foreground">{link.description}</p> : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input readOnly value={displayUrl} className="font-mono text-[11px]" />
                <div className="flex gap-2">
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => handleCopy(link.path)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button type="button" size="icon" variant="secondary" className="h-8 w-8" asChild>
                    <Link href={displayUrl} target="_blank">
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
