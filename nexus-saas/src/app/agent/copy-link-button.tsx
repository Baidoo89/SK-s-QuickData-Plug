"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Copy } from "lucide-react"

export function CopyLinkButton({ slug }: { slug: string }) {
  const { toast } = useToast()
  const [storeUrl, setStoreUrl] = useState(`/store/${slug}`)

  useEffect(() => {
    setStoreUrl(`${window.location.origin}/store/${slug}`)
  }, [slug])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 truncate text-xs text-foreground">{storeUrl}</p>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(storeUrl)
            toast({ title: "Copied", description: "Storefront link copied." })
          } catch {
            toast({ title: "Copy failed", description: "Could not copy link.", variant: "destructive" })
          }
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  )
}
