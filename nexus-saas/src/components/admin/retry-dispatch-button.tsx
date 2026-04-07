"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

type Props = {
  orderId: string
  disabled?: boolean
}

export function RetryDispatchButton({ orderId, disabled }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  async function onRetry() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/retry-dispatch`, {
        method: "POST",
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Retry failed")
      }

      toast({
        title: "Retry submitted",
        description: payload?.data?.message || "Dispatch retry completed",
      })

      window.location.reload()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not retry dispatch",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRetry}
      disabled={loading || disabled}
      className="h-7 px-2 text-[11px]"
    >
      {loading ? "Retrying..." : "Retry API"}
    </Button>
  )
}
