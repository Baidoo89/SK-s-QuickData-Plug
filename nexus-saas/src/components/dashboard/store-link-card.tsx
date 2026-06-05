"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { Copy, ExternalLink } from "lucide-react"
import Link from "next/link"

interface StoreLinkCardProps {
  storePath: string | null
}

export function StoreLinkCard({ storePath }: StoreLinkCardProps) {
  const { toast } = useToast()
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const handleCopy = useCallback(async () => {
    if (!storePath) return
    try {
      const fullUrl = `${origin}${storePath}`
      await navigator.clipboard.writeText(fullUrl)
      toast({ title: "Store link copied", description: "Share this clean storefront link with customers." })
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Could not copy link to clipboard." })
    }
  }, [origin, storePath, toast])

  if (!storePath) return null
  const displayUrl = origin ? `${origin}${storePath}` : storePath

  return (
    <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Customer storefront</CardTitle>
            <CardDescription className="text-xs">Share this clean storefront link with customers when your launch checks are ready.</CardDescription>
          </div>
          <span className="w-fit rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            Customer checkout
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
        <Input
          readOnly
          value={displayUrl}
          className="min-w-0 bg-muted font-mono text-xs sm:text-sm"
        />
        <div className="flex shrink-0 gap-2 justify-end sm:justify-normal">
          <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copy store link">
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="icon" asChild aria-label="Open store">
            <Link href={storePath} target="_blank">
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
