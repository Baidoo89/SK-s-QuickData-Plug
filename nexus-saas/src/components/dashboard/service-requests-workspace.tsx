"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"
import { CheckCircle2, PackageCheck, XCircle } from "lucide-react"

export type ServiceRequestRow = {
  id: string
  productId: string
  createdAt: string
  type: string
  serviceName: string
  provider: string
  customerName: string
  phoneNumber: string
  location: string
  dateOfBirth: string
  ghanaCardNumber: string
  formDetails: Array<{ label: string; value: string }>
  sellerRole: string
  sellerName: string
  paymentStatus: string
  status: string
  total: number
  profit: number
}

type Props = {
  rows: ServiceRequestRow[]
  readOnly?: boolean
}

const STATUS_OPTIONS = ["PENDING_REVIEW", "PROCESSING", "COMPLETED", "FAILED", "REJECTED"] as const
const PAYMENT_LOCKED_STATUSES = new Set(["PENDING_PAYMENT", "PAYMENT_FAILED", "PAYMENT_INIT_FAILED"])

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatType(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

function statusClass(status: string) {
  if (status === "COMPLETED") return "border-primary bg-primary/10 text-primary"
  if (status === "PROCESSING" || status === "PENDING_REVIEW") return "status-warning border"
  if (status === "FAILED" || status === "REJECTED" || status === "PAYMENT_FAILED" || status === "PAYMENT_INIT_FAILED") return "border-destructive/50 bg-destructive/10 text-destructive"
  return "border-border bg-muted text-muted-foreground"
}

function ServiceStatusSelect({ requestId, initialStatus }: { requestId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const locked = PAYMENT_LOCKED_STATUSES.has(status)

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    const previous = status
    setStatus(next)
    setSaving(true)

    try {
      const response = await fetch(`/api/dashboard/service-requests/${requestId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error?.message || `Failed to update service request (${response.status})`)
      }

      toast({ title: "Status updated", description: `Request marked ${formatStatus(next).toLowerCase()}.` })
      router.refresh()
    } catch (error) {
      console.error("Failed to update service request status", error)
      setStatus(previous)
      toast({ variant: "destructive", title: "Could not update request", description: error instanceof Error ? error.message : "Try again." })
    } finally {
      setSaving(false)
    }
  }

  if (locked) {
    return (
      <Badge variant="outline" className={`w-full justify-center py-1.5 text-[11px] ${statusClass(status)}`}>
        {formatStatus(status)}
      </Badge>
    )
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={saving}
      className={`h-8 w-full rounded-md border px-2 text-center text-[11px] font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${statusClass(status)}`}
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {formatStatus(option)}
        </option>
      ))}
    </select>
  )
}

function ServiceRequestActions({ requestId, status, readOnly }: { requestId: string; status: string; readOnly?: boolean }) {
  const [saving, setSaving] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  async function updateStatus(next: string) {
    setSaving(next)
    try {
      const response = await fetch(`/api/dashboard/service-requests/${requestId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error?.message || `Failed to update service request (${response.status})`)
      }

      toast({ title: "Status updated", description: `Request marked ${formatStatus(next).toLowerCase()}.` })
      router.refresh()
    } catch (error) {
      console.error("Failed to update service request status", error)
      toast({ variant: "destructive", title: "Could not update request", description: error instanceof Error ? error.message : "Try again." })
    } finally {
      setSaving(null)
    }
  }

  if (readOnly || PAYMENT_LOCKED_STATUSES.has(status)) return null

  return (
    <div className="flex min-w-[220px] flex-wrap justify-end gap-1">
      {status === "PENDING_REVIEW" ? (
        <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => updateStatus("PROCESSING")} disabled={Boolean(saving)}>
          <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
          {saving === "PROCESSING" ? "Picking..." : "Pick"}
        </Button>
      ) : null}
      {status !== "COMPLETED" ? (
        <Button type="button" size="sm" className="h-8 text-[11px]" onClick={() => updateStatus("COMPLETED")} disabled={Boolean(saving)}>
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Done
        </Button>
      ) : null}
      {status !== "FAILED" && status !== "REJECTED" ? (
        <Button type="button" size="sm" variant="destructive" className="h-8 text-[11px]" onClick={() => updateStatus("FAILED")} disabled={Boolean(saving)}>
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          Fail
        </Button>
      ) : null}
    </div>
  )
}

function ServiceRequestCard({ request, readOnly }: { request: ServiceRequestRow; readOnly: boolean }) {
  return (
    <article className="rounded-lg border border-border/70 bg-background/70 p-3 shadow-sm md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{request.serviceName}</p>
          <p className="truncate text-xs text-muted-foreground">{request.customerName} · {formatDate(request.createdAt)}</p>
          <p className="font-mono text-[10px] text-muted-foreground">#{request.id.slice(-8)}</p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${statusClass(request.status)}`}>{formatStatus(request.status)}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div><p className="text-muted-foreground">Total</p><p className="font-semibold text-foreground">{formatGhanaCedis(request.total)}</p></div>
        <div><p className="text-muted-foreground">Profit</p><p className={request.profit > 0 ? "font-semibold text-primary" : "font-semibold text-muted-foreground"}>{formatGhanaCedis(request.profit)}</p></div>
        <div><p className="text-muted-foreground">Seller</p><p className="truncate font-medium text-foreground">{request.sellerName}</p></div>
        <div><p className="text-muted-foreground">Payment</p><p className="font-medium text-foreground">{request.paymentStatus}</p></div>
      </div>

      <details className="mt-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">Request details</summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          <div><dt className="text-muted-foreground">Provider</dt><dd className="truncate">{request.provider || "SERVICE"}</dd></div>
          <div><dt className="text-muted-foreground">Type</dt><dd className="truncate">{formatType(request.type)}</dd></div>
          <div><dt className="text-muted-foreground">Phone</dt><dd className="truncate">{request.phoneNumber || "-"}</dd></div>
          <div><dt className="text-muted-foreground">Location</dt><dd className="truncate">{request.location || "-"}</dd></div>
          <div><dt className="text-muted-foreground">Ghana Card</dt><dd className="truncate">{request.ghanaCardNumber || "-"}</dd></div>
          <div><dt className="text-muted-foreground">Birth date</dt><dd>{request.dateOfBirth || "-"}</dd></div>
          {request.formDetails.map((detail) => <div key={detail.label} className="col-span-2"><dt className="text-muted-foreground">{detail.label}</dt><dd className="break-words">{detail.value}</dd></div>)}
        </dl>
      </details>

      {!readOnly ? (
        <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
          <ServiceStatusSelect requestId={request.id} initialStatus={request.status} />
          <ServiceRequestActions requestId={request.id} status={request.status} readOnly={readOnly} />
        </div>
      ) : null}
    </article>
  )
}

export function ServiceRequestsWorkspace({ rows, readOnly = false }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:hidden">
        {rows.map((request) => <ServiceRequestCard key={request.id} request={request} readOnly={readOnly} />)}
      </div>
      <div className="ops-table-surface hidden min-w-0 max-w-full overflow-hidden rounded-lg md:block">
        <div className="table-scroll">
          <Table className="min-w-[1640px] table-fixed text-xs">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead className="w-[104px]">Date</TableHead>
                <TableHead className="w-[150px]">Service</TableHead>
                <TableHead className="w-[100px]">Provider</TableHead>
                <TableHead className="w-[150px]">Customer</TableHead>
                <TableHead className="w-[112px]">Phone</TableHead>
                <TableHead className="w-[150px]">Ghana Card</TableHead>
                <TableHead className="w-[180px]">Form Details</TableHead>
                <TableHead className="w-[135px]">Location</TableHead>
                <TableHead className="w-[110px]">Birth Date</TableHead>
                <TableHead className="w-[115px]">Seller</TableHead>
                <TableHead className="w-[100px]">Payment</TableHead>
                <TableHead className="w-[145px]">Status</TableHead>
                <TableHead className="w-[230px] text-right">Actions</TableHead>
                <TableHead className="w-[90px] text-right">Total</TableHead>
                <TableHead className="w-[90px] text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-mono font-semibold">{request.id.slice(-8)}</TableCell>
                  <TableCell>{formatDate(request.createdAt)}</TableCell>
                  <TableCell className="truncate">
                    <div>
                      <p className="truncate font-medium">{request.serviceName}</p>
                      <p className="text-[10px] text-muted-foreground">{formatType(request.type)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-md">{request.provider || "SERVICE"}</Badge>
                  </TableCell>
                  <TableCell className="truncate">{request.customerName}</TableCell>
                  <TableCell>{request.phoneNumber}</TableCell>
                  <TableCell className="truncate">{request.ghanaCardNumber || "-"}</TableCell>
                  <TableCell className="truncate">
                    {request.formDetails.length
                      ? request.formDetails.slice(0, 3).map((detail) => `${detail.label}: ${detail.value || "-"}`).join(" | ")
                      : "-"}
                  </TableCell>
                  <TableCell className="truncate">{request.location || "-"}</TableCell>
                  <TableCell>{request.dateOfBirth || "-"}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="secondary" className="rounded-md">{request.sellerRole}</Badge>
                      <p className="truncate text-[10px] text-muted-foreground">{request.sellerName}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={request.paymentStatus === "PAID" ? "secondary" : "outline"} className="rounded-md">{request.paymentStatus}</Badge>
                  </TableCell>
                  <TableCell>
                    {readOnly ? (
                      <Badge variant="outline" className={`w-full justify-center py-1.5 text-[11px] ${statusClass(request.status)}`}>
                        {formatStatus(request.status)}
                      </Badge>
                    ) : (
                      <ServiceStatusSelect requestId={request.id} initialStatus={request.status} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ServiceRequestActions requestId={request.id} status={request.status} readOnly={readOnly} />
                  </TableCell>
                  <TableCell className="text-right font-bold">{formatGhanaCedis(request.total)}</TableCell>
                  <TableCell className={request.profit > 0 ? "text-right font-semibold text-primary" : "text-right text-muted-foreground"}>
                    {formatGhanaCedis(request.profit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
