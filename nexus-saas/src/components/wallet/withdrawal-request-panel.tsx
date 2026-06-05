"use client"

import { useEffect, useState, FormEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"

interface WithdrawalRequest {
  id: string
  amount: number
  status: string
  note: string | null
  requestedByEmail: string | null
  requestedByRole: string | null
  reviewedByEmail: string | null
  reviewedAt: string | null
  createdAt: string
}

function statusClass(status: string) {
  if (status === "PAID") return "status-success border"
  if (status === "APPROVED" || status === "PENDING") return "status-warning border"
  if (status === "REJECTED" || status === "CANCELED") return ""
  return "status-info border"
}

export function WithdrawalRequestPanel() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [earningsBalance, setEarningsBalance] = useState(0)
  const [availableBalance, setAvailableBalance] = useState(0)
  const [paidOut, setPaidOut] = useState(0)
  const [lockedAmount, setLockedAmount] = useState(0)
  const [requests, setRequests] = useState<WithdrawalRequest[]>([])
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function loadRequests() {
    setLoading(true)
    try {
      const res = await fetch("/api/wallet/withdrawals")
      if (!res.ok) return
      const payload = await res.json().catch(() => null) as {
        earningsBalance?: number
        profitBalance?: number
        walletBalance?: number
        availableBalance?: number
        paidOut?: number
        lockedAmount?: number
        results?: WithdrawalRequest[]
        data?: { earningsBalance?: number; profitBalance?: number; walletBalance?: number; availableBalance?: number; paidOut?: number; lockedAmount?: number; results?: WithdrawalRequest[] }
      } | null
      const data = payload?.data ?? payload
      const earned = typeof data?.profitBalance === "number" ? data.profitBalance : typeof data?.earningsBalance === "number" ? data.earningsBalance : data?.walletBalance
      if (typeof earned === "number") setEarningsBalance(earned)
      if (typeof data?.availableBalance === "number") setAvailableBalance(data.availableBalance)
      if (typeof data?.paidOut === "number") setPaidOut(data.paidOut)
      if (typeof data?.lockedAmount === "number") setLockedAmount(data.lockedAmount)
      if (Array.isArray(data?.results)) setRequests(data.results)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Profit withdrawal requests</CardTitle>
        <CardDescription className="text-xs">
          Request payout from completed customer-sale profit. Operational wallet funds stay separate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-muted/35 p-3">
            <p className="text-[11px] text-muted-foreground">Completed profit</p>
            <p className="mt-1 text-base font-semibold">{formatGhanaCedis(earningsBalance)}</p>
          </div>
          <div className="rounded-md border bg-muted/35 p-3">
            <p className="text-[11px] text-muted-foreground">Available to withdraw</p>
            <p className="mt-1 text-base font-semibold">{formatGhanaCedis(availableBalance)}</p>
          </div>
          <div className="rounded-md border bg-muted/35 p-3">
            <p className="text-[11px] text-muted-foreground">Locked / paid out</p>
            <p className="mt-1 text-base font-semibold">{formatGhanaCedis(lockedAmount)} / {formatGhanaCedis(paidOut)}</p>
          </div>
        </div>
        <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          Withdrawals are calculated from completed customer-sale profit only. Wallet top-ups and dashboard buy balances are not withdrawable earnings.
        </p>

        <form
          className="space-y-3 rounded-md border bg-background p-4"
          onSubmit={async (event: FormEvent) => {
            event.preventDefault()
            const numericAmount = Number(amount)
            if (!numericAmount || numericAmount <= 0) {
              return toast({ variant: "destructive", title: "Validation", description: "Enter a valid withdrawal amount." })
            }

            setSubmitting(true)
            try {
              const res = await fetch("/api/wallet/withdrawals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: numericAmount, note }),
              })
              const payload = await res.json().catch(() => null)
              if (!res.ok) {
                const message = payload?.message || "Withdrawal request failed."
                return toast({ variant: "destructive", title: "Error", description: message })
              }

              setAmount("")
              setNote("")
              toast({ title: "Withdrawal requested", description: "Your payout request has been submitted for review." })
              await loadRequests()
            } catch {
              toast({ variant: "destructive", title: "Network error", description: "Could not reach withdrawal service." })
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="font-medium text-foreground">Amount (GHS)</p>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="e.g. 50"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-foreground">Note</p>
              <Input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional payout note"
                className="text-xs"
              />
            </div>
          </div>
          <Button type="submit" disabled={submitting || availableBalance <= 0} className="text-xs">
            {submitting ? "Submitting..." : "Request withdrawal"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Withdrawal requests are approved manually against your completed-order profit ledger, not your wallet top-up balance.
          </p>
        </form>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-foreground">Recent requests</p>
            {loading && <p className="text-[11px] text-muted-foreground">Refreshing...</p>}
          </div>
          {requests.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-center text-xs text-muted-foreground">
              No withdrawal requests yet. When you submit one, review status and payout notes will appear here.
            </div>
          ) : (
            <div className="table-scroll rounded-md border bg-background">
              <Table className="min-w-[760px] text-xs">
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead className="whitespace-nowrap">Amount</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Note</TableHead>
                    <TableHead className="whitespace-nowrap">Reviewed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id} className="hover:bg-muted/20">
                      <TableCell className="whitespace-nowrap">{new Date(request.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="whitespace-nowrap font-semibold">{formatGhanaCedis(request.amount)}</TableCell>
                      <TableCell>
                        <Badge variant={request.status === "REJECTED" ? "destructive" : "outline"} className={statusClass(request.status)}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-muted-foreground">{request.note || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {request.reviewedByEmail || "Pending review"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
