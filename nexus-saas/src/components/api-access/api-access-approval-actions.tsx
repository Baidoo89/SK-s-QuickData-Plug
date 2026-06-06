"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

export function ApiAccessApprovalActions({ requestId }: { requestId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<"APPROVE" | "REJECT" | null>(null)

  async function decide(decision: "APPROVE" | "REJECT") {
    setLoading(decision)
    try {
      const res = await fetch(`/api/api-access/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error?.message || "Could not update API access request")
      toast({
        title: decision === "APPROVE" ? "API access approved" : "API access rejected",
        description: decision === "APPROVE" ? "A seller-scoped API key has been issued." : "The request has been rejected.",
      })
      router.refresh()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "API access",
        description: error instanceof Error ? error.message : "Could not update API access request",
      })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => decide("APPROVE")} disabled={Boolean(loading)}>
        <CheckCircle2 className="mr-2 h-4 w-4" />
        {loading === "APPROVE" ? "Approving..." : "Approve API"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => decide("REJECT")} disabled={Boolean(loading)}>
        <XCircle className="mr-2 h-4 w-4" />
        {loading === "REJECT" ? "Rejecting..." : "Reject"}
      </Button>
    </div>
  )
}
