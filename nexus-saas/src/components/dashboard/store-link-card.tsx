"use client"

import { useCallback } from "react"
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

  const handleCopy = useCallback(async () => {
    if (!storePath) return
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const fullUrl = `${origin}${storePath}`
      await navigator.clipboard.writeText(fullUrl)
      toast({ title: "Store link copied", description: "Share this link with your customers and agents." })
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Could not copy link to clipboard." })
    }
  }, [storePath, toast])

  if (!storePath) return null

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Your public store link</CardTitle>
        <CardDescription>Share this link with customers to let them order bundles.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          readOnly
          value={storePath}
          className="font-mono text-xs sm:text-sm bg-muted"
        />
        <div className="flex gap-2 justify-end sm:justify-normal">
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
