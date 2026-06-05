"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

type Props = {
  kind: "agent" | "reseller"
  id: string
  label?: string
  agentName?: string
  commissionPercent?: number
  verificationWarning?: string
}

export function SignupApprovalActions({ kind, id, label, agentName, commissionPercent, verificationWarning }: Props) {
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  const handleApprove = async () => {
    if (verificationWarning) {
      const shouldContinue = window.confirm(`${verificationWarning}\n\nApprove this request anyway?`)
      if (!shouldContinue) return
    }

    setLoadingAction("approve")
    try {
      const response = await fetch(kind === "agent" ? `/api/agents/${id}` : `/api/resellers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body:
          kind === "agent"
            ? JSON.stringify({ name: agentName || label || "Agent", active: true, commissionPercent: commissionPercent ?? 0 })
            : JSON.stringify({ active: true }),
      })

      if (!response.ok) {
        throw new Error("Approval failed")
      }

      toast({ title: "Approved", description: kind === "agent" ? "Agent request approved." : "Reseller request approved." })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Approval failed", description: "Could not approve this request." })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleReject = async () => {
    const shouldReject = window.confirm(
      `Reject this ${kind} request? This removes the pending account and cannot be undone.`,
    )
    if (!shouldReject) return

    setLoadingAction("reject")
    try {
      const response = await fetch(kind === "agent" ? `/api/agents/${id}` : `/api/resellers/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error?.message || "Rejection failed")
      }

      toast({ title: "Rejected", description: kind === "agent" ? "Agent request rejected." : "Reseller request rejected." })
      router.refresh()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Rejection failed",
        description: error instanceof Error ? error.message : "Could not reject this request.",
      })
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {verificationWarning ? (
        <div className="flex items-center gap-1 text-[11px] text-amber-700 sm:max-w-[180px]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{verificationWarning}</span>
        </div>
      ) : null}
      <Button type="button" size="sm" onClick={handleApprove} disabled={Boolean(loadingAction)}>
        {loadingAction === "approve" ? null : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
        {loadingAction === "approve" ? "Approving..." : label || "Approve"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={handleReject} disabled={Boolean(loadingAction)}>
        {loadingAction === "reject" ? null : <XCircle className="mr-2 h-3.5 w-3.5" />}
        {loadingAction === "reject" ? "Rejecting..." : "Reject"}
      </Button>
    </div>
  )
}
