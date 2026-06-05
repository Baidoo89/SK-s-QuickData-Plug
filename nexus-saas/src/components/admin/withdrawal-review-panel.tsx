"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"

interface WithdrawalRow {
  id: string
  amount: number
  status: string
  note: string | null
  requestedByEmail: string | null
  requestedByRole: string | null
  reviewedByEmail: string | null
  reviewedAt: string | null
  createdAt: string
  user: {
    id: string
    name: string | null
    email: string | null
    role: string
  }
}

interface WithdrawalSummary {
  totalCollected: number
  totalEarningsLiability: number
  totalPaidOut: number
  outstandingLiability: number
}

const STATUS_OPTIONS = ["", "PENDING", "APPROVED", "PAID", "REJECTED", "CANCELED"]

type WithdrawalReviewPanelProps = {
  apiBase?: string
  description?: string
  readOnly?: boolean
  title?: string
}

export function WithdrawalReviewPanel({
  apiBase = "/api/admin/withdrawals",
  description = "Review withdrawal requests from agents. Reseller withdrawals are handled by parent agents.",
  readOnly = false,
  title = "Agent withdrawal approvals",
}: WithdrawalReviewPanelProps) {
  const { toast } = useToast()
  const [requests, setRequests] = useState<WithdrawalRow[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState("")
  const [search, setSearch] = useState("")
  const [summary, setSummary] = useState<WithdrawalSummary>({
    totalCollected: 0,
    totalEarningsLiability: 0,
    totalPaidOut: 0,
    outstandingLiability: 0,
  })

  const totals = useMemo(() => {
    const pendingCount = requests.filter((request) => request.status === "PENDING").length
    const approvedCount = requests.filter((request) => request.status === "APPROVED").length
    const pendingAmount = requests
      .filter((request) => request.status === "PENDING" || request.status === "APPROVED")
      .reduce((sum, request) => sum + request.amount, 0)
    return { pendingCount, approvedCount, pendingAmount }
  }, [requests])

  async function loadRequests() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("limit", "100")
      if (statusFilter) params.set("status", statusFilter)
      if (search.trim()) params.set("q", search.trim())

      const res = await fetch(`${apiBase}?${params.toString()}`)
      if (!res.ok) return
      const payload = await res.json().catch(() => null) as {
        results?: WithdrawalRow[]
        totalCollected?: number
        totalEarningsLiability?: number
        totalPaidOut?: number
        outstandingLiability?: number
        data?: {
          results?: WithdrawalRow[]
          totalCollected?: number
          totalEarningsLiability?: number
          totalPaidOut?: number
          outstandingLiability?: number
        }
      } | null
      const data = payload?.data ?? payload
      const results = data?.results
      if (Array.isArray(results)) {
        setRequests(results)
      }
      setSummary({
        totalCollected: typeof data?.totalCollected === "number" ? data.totalCollected : 0,
        totalEarningsLiability: typeof data?.totalEarningsLiability === "number" ? data.totalEarningsLiability : 0,
        totalPaidOut: typeof data?.totalPaidOut === "number" ? data.totalPaidOut : 0,
        outstandingLiability: typeof data?.outstandingLiability === "number" ? data.outstandingLiability : 0,
      })
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [statusFilter])

  return (
    <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 text-xs">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-md border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Pending requests</p>
            <p className="mt-1 text-base font-semibold">{totals.pendingCount}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Approved awaiting payout</p>
            <p className="mt-1 text-base font-semibold">{totals.approvedCount}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Locked profit</p>
            <p className="mt-1 text-base font-semibold">{formatGhanaCedis(totals.pendingAmount)}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Customer sales collected</p>
            <p className="mt-1 text-base font-semibold">{formatGhanaCedis(summary.totalCollected)}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Profit earned</p>
            <p className="mt-1 text-base font-semibold">{formatGhanaCedis(summary.totalEarningsLiability)}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Paid out / outstanding</p>
            <p className="mt-1 text-base font-semibold">
              {formatGhanaCedis(summary.totalPaidOut)} / {formatGhanaCedis(summary.outstandingLiability)}
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Search</span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, note"
              className="h-9 w-full text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status || "ALL"} value={status}>
                  {status || "All"}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" className="h-9 text-xs" onClick={loadRequests}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading requests...</p>
        ) : requests.length === 0 ? (
          <p className="text-xs text-muted-foreground">No withdrawal requests found.</p>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {requests.map((request) => (
              <div key={request.id} className="rounded-md border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{request.user.name || request.user.email || "Unknown"}</p>
                    <p className="break-all text-[11px] text-muted-foreground">{request.user.email || request.requestedByEmail || "-"}</p>
                  </div>
                  <Badge
                    variant={request.status === "PENDING" ? "secondary" : request.status === "PAID" ? "default" : request.status === "REJECTED" ? "destructive" : "outline"}
                  >
                    {request.status}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{formatGhanaCedis(request.amount)}</p>
                    <p>Amount</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase text-foreground">{request.requestedByRole || request.user.role}</p>
                    <p>Role</p>
                  </div>
                  <div>
                    <p className="text-foreground">{new Date(request.createdAt).toLocaleDateString()}</p>
                    <p>Requested</p>
                  </div>
                  <div>
                    <p className="truncate text-foreground">{request.reviewedByEmail || "Pending"}</p>
                    <p>Reviewed by</p>
                  </div>
                </div>
                {request.note ? <p className="mt-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">{request.note}</p> : null}
                {!readOnly && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {request.status === "PENDING" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={async () => {
                          const res = await fetch(`${apiBase}/${request.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "APPROVED" }),
                          })
                          if (!res.ok) {
                            const payload = await res.json().catch(() => null)
                            return toast({ variant: "destructive", title: "Approval failed", description: payload?.message || "Could not approve request." })
                          }
                          toast({ title: "Withdrawal approved" })
                          await loadRequests()
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs"
                        onClick={async () => {
                          const res = await fetch(`${apiBase}/${request.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "REJECTED" }),
                          })
                          if (!res.ok) {
                            const payload = await res.json().catch(() => null)
                            return toast({ variant: "destructive", title: "Rejection failed", description: payload?.message || "Could not reject request." })
                          }
                          toast({ title: "Withdrawal rejected" })
                          await loadRequests()
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {request.status === "APPROVED" && (
                    <Button
                      size="sm"
                      className="col-span-2 h-8 text-xs"
                      onClick={async () => {
                        const res = await fetch(`${apiBase}/${request.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "PAID" }),
                        })
                        if (!res.ok) {
                          const payload = await res.json().catch(() => null)
                          return toast({ variant: "destructive", title: "Update failed", description: payload?.message || "Could not mark request as paid." })
                        }
                        toast({ title: "Withdrawal marked as paid" })
                        await loadRequests()
                      }}
                    >
                      Mark Paid
                    </Button>
                  )}
                </div>
                )}
              </div>
            ))}
          </div>

          <div className="table-scroll hidden rounded-md border bg-background md:block">
            <Table className="min-w-[980px] text-xs">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="whitespace-nowrap">User</TableHead>
                  <TableHead className="whitespace-nowrap">Role</TableHead>
                  <TableHead className="whitespace-nowrap">Amount</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Note</TableHead>
                  <TableHead className="whitespace-nowrap">Reviewed By</TableHead>
                  {!readOnly && <TableHead className="whitespace-nowrap text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id} className="hover:bg-muted/20">
                    <TableCell className="whitespace-nowrap">{new Date(request.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{request.user.name || request.user.email || "Unknown"}</span>
                        <span className="text-[11px] text-muted-foreground">{request.user.email || request.requestedByEmail || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="uppercase">{request.requestedByRole || request.user.role}</TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">{formatGhanaCedis(request.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={request.status === "PENDING" ? "secondary" : request.status === "PAID" ? "default" : request.status === "REJECTED" ? "destructive" : "outline"}
                      >
                        {request.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">{request.note || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {request.reviewedByEmail || "Pending"}
                    </TableCell>
                    {!readOnly && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {request.status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={async () => {
                                const res = await fetch(`${apiBase}/${request.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "APPROVED" }),
                                })
                                if (!res.ok) {
                                  const payload = await res.json().catch(() => null)
                                  return toast({ variant: "destructive", title: "Approval failed", description: payload?.message || "Could not approve request." })
                                }
                                toast({ title: "Withdrawal approved" })
                                await loadRequests()
                              }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs"
                              onClick={async () => {
                                const res = await fetch(`${apiBase}/${request.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "REJECTED" }),
                                })
                                if (!res.ok) {
                                  const payload = await res.json().catch(() => null)
                                  return toast({ variant: "destructive", title: "Rejection failed", description: payload?.message || "Could not reject request." })
                                }
                                toast({ title: "Withdrawal rejected" })
                                await loadRequests()
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {request.status === "APPROVED" && (
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            onClick={async () => {
                              const res = await fetch(`${apiBase}/${request.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "PAID" }),
                              })
                              if (!res.ok) {
                                const payload = await res.json().catch(() => null)
                                return toast({ variant: "destructive", title: "Update failed", description: payload?.message || "Could not mark request as paid." })
                              }
                              toast({ title: "Withdrawal marked as paid" })
                              await loadRequests()
                            }}
                          >
                            Mark Paid
                          </Button>
                        )}
                        {request.status === "PAID" && (
                          <span className="text-[11px] text-muted-foreground">Completed</span>
                        )}
                      </div>
                    </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
