"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ClipboardCopy, Eye, Loader2, PackageCheck, Send, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OrderStatusSelect } from "@/components/admin/order-status-select"
import { OrderTimelineDialog } from "@/components/orders/order-timeline-dialog"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"

export type ManualQueueRow = {
  id: string
  publicOrderCode: string
  createdAt: string
  customerName: string
  phoneNumber: string
  network: string
  source: string
  sourceLabel: string
  sellerRole: string
  sellerName: string | null
  provider: string
  paymentOwner: "STOREFRONT" | "WALLET" | "EXTERNAL"
  paymentStatus: string
  paymentReference: string
  agentName: string | null
  status: string
  total: number
  itemsLabel: string
}

type Props = {
  rows: ManualQueueRow[]
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function buildCopyText(rows: ManualQueueRow[]) {
  return rows
    .map((order) => {
      const network = order.network.trim().toUpperCase()
      const bundle = formatBundleForCopy(order.itemsLabel)
      const networkLabel = network === "AIRTELTIGO" ? "AT" : network === "TELECEL" ? "TELECEL" : network
      const parts = [order.phoneNumber || "N/A", bundle]

      if (network && network !== "MTN") {
        parts.push(networkLabel)
      }

      return parts.join("\t")
    })
    .join("\n")
}

function formatBundleForCopy(value: string) {
  const match = value.match(/\b(\d+(?:\.\d+)?)\s*(GB|MB|KB|TB)\b/i)
  if (!match) return value || "Bundle N/A"

  const amount = match[1]
  const unit = match[2].toUpperCase()

  if (unit === "GB") return amount
  return `${amount}${unit}`
}

function paymentBadgeLabel(order: ManualQueueRow) {
  if (order.paymentOwner === "STOREFRONT") return order.paymentStatus
  if (order.paymentOwner === "EXTERNAL") return `EXTERNAL ${order.paymentStatus}`
  return "WALLET"
}

function paymentBadgeClass(order: ManualQueueRow) {
  if (order.paymentOwner === "STOREFRONT") return "border-primary bg-primary/10 px-2 py-0 text-[10px] text-primary"
  if (order.paymentOwner === "EXTERNAL") return "border-sky-200 bg-sky-50 px-2 py-0 text-[10px] text-sky-700"
  return "border-border bg-muted px-2 py-0 text-[10px] text-muted-foreground"
}

export function ManualQueueWorkspace({ rows }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [savingStatus, setSavingStatus] = useState<"PROCESSING" | "COMPLETED" | "FAILED" | null>(null)
  const [dispatchingApi, setDispatchingApi] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.id)),
    [rows, selected],
  )
  const pendingRows = useMemo(() => rows.filter((row) => row.status === "PENDING"), [rows])
  const processingRows = useMemo(() => rows.filter((row) => row.status === "PROCESSING"), [rows])
  const selectedPendingRows = useMemo(
    () => selectedRows.filter((row) => row.status === "PENDING"),
    [selectedRows],
  )

  const allPendingSelected = pendingRows.length > 0 && pendingRows.every((row) => selected.has(row.id))
  const previewRows = selectedRows.length > 0 ? selectedRows : pendingRows
  const copyPreview = buildCopyText(previewRows.slice(0, 8))

  function toggleOrder(orderId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }

  function toggleAllPending() {
    setSelected((current) => {
      const next = new Set(current)
      if (pendingRows.length > 0 && pendingRows.every((row) => next.has(row.id))) {
        pendingRows.forEach((row) => next.delete(row.id))
        return next
      }
      pendingRows.forEach((row) => next.add(row.id))
      return next
    })
  }

  async function copyOrders(scope: "selected" | "pending") {
    const copyRows = scope === "selected" ? selectedRows : pendingRows
    if (copyRows.length === 0) {
      toast({
        title: "Nothing to copy",
        description: scope === "pending" ? "There are no pending orders ready to pick." : "Select at least one order first.",
      })
      return
    }

    await navigator.clipboard.writeText(buildCopyText(copyRows))
    toast({
      title: "Copied",
      description: `${copyRows.length} order${copyRows.length === 1 ? "" : "s"} copied for manual processing.`,
    })
  }

  async function bulkUpdate(status: "PROCESSING" | "COMPLETED" | "FAILED") {
    const updateRows = status === "PROCESSING" ? selectedPendingRows : selectedRows
    if (updateRows.length === 0) {
      toast({
        title: "No orders selected",
        description: status === "PROCESSING" ? "Select pending orders before claiming." : "Select the orders you want to update first.",
      })
      return
    }

    const label = status === "PROCESSING" ? "processing" : status === "COMPLETED" ? "delivered" : "failed"
    const confirmed = window.confirm(`Mark ${updateRows.length} selected order${updateRows.length === 1 ? "" : "s"} as ${label}?`)
    if (!confirmed) return

    setSavingStatus(status)
    try {
      const res = await fetch("/api/dashboard/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: updateRows.map((row) => row.id),
          status,
        }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Bulk update failed")
      }

      toast({
        title: "Orders updated",
        description: `${payload?.data?.updated ?? 0} updated, ${payload?.data?.skipped ?? 0} skipped.`,
      })
      setSelected(new Set())
      router.refresh()
    } catch (error) {
      toast({
        title: "Bulk update failed",
        description: error instanceof Error ? error.message : "Could not update selected orders.",
        variant: "destructive",
      })
    } finally {
      setSavingStatus(null)
    }
  }

  async function sendSelectedToApi() {
    if (selectedRows.length === 0) {
      toast({
        title: "No orders selected",
        description: "Select paid manual pending or processing orders first.",
      })
      return
    }

    const confirmed = window.confirm(
      `Send ${selectedRows.length} selected manual order${selectedRows.length === 1 ? "" : "s"} through the active API dispatch policy?`,
    )
    if (!confirmed) return

    setDispatchingApi(true)
    try {
      const res = await fetch("/api/dashboard/orders/bulk-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedRows.map((row) => row.id),
        }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "API dispatch failed")
      }

      const data = payload?.data || {}
      toast({
        title: "API dispatch complete",
        description: `${data.sentToApi ?? 0} sent to API, ${data.stayedManual ?? 0} stayed manual, ${data.skipped ?? 0} skipped.`,
      })
      setSelected(new Set())
      router.refresh()
    } catch (error) {
      toast({
        title: "API dispatch failed",
        description: error instanceof Error ? error.message : "Could not send selected orders to API.",
        variant: "destructive",
      })
    } finally {
      setDispatchingApi(false)
    }
  }

  return (
    <div className="space-y-3 pb-24 md:pb-0">
      <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
          checked={allPendingSelected}
          onChange={toggleAllPending}
          className="h-4 w-4 rounded border-border"
        />
          Select pending orders
          <Badge variant="outline" className="ml-1">{pendingRows.length}</Badge>
        </label>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline">Pending to pick: {pendingRows.length}</Badge>
          <Badge variant="outline">Processing: {processingRows.length}</Badge>
          <Badge variant="outline">Selected: {selectedRows.length}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setPreviewOpen((open) => !open)}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => copyOrders("pending")}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy Pending
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => copyOrders("selected")} disabled={selectedRows.length === 0}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy Selected
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={sendSelectedToApi} disabled={dispatchingApi || selectedRows.length === 0}>
            {dispatchingApi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send to API
          </Button>
        </div>
      </div>

      {previewOpen ? (
        <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Copy preview</p>
              <p className="text-[11px] text-muted-foreground">
                {selectedRows.length > 0 ? "Selected orders" : "Pending orders"}: phone, bundle, and network for non-MTN rows.
              </p>
            </div>
            <Badge variant="outline">{previewRows.length} rows</Badge>
          </div>
          <pre className="max-h-44 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
            {copyPreview || "No rows available"}
          </pre>
        </div>
      ) : null}

      <div className="ops-table-surface table-scroll rounded-lg">
        <Table className="min-w-[1180px] table-fixed text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allPendingSelected}
                  onChange={toggleAllPending}
                  className="h-4 w-4 rounded border-border"
                  aria-label="Select pending orders"
                />
              </TableHead>
              <TableHead className="w-[150px]">Order ID</TableHead>
              <TableHead className="w-[110px]">Date</TableHead>
              <TableHead className="w-[150px]">Buyer</TableHead>
              <TableHead className="w-[112px]">Phone</TableHead>
              <TableHead className="w-[90px]">Network</TableHead>
              <TableHead className="w-[110px]">Source</TableHead>
              <TableHead className="w-[140px]">Seller</TableHead>
              <TableHead className="w-[150px]">Payment</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[110px]">Timeline</TableHead>
              <TableHead className="w-[90px] text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((order) => (
              <TableRow key={order.id} className={selected.has(order.id) ? "bg-primary/10" : ""}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(order.id)}
                    onChange={() => toggleOrder(order.id)}
                    className="h-4 w-4 rounded border-border"
                    aria-label={`Select order ${order.publicOrderCode}`}
                  />
                </TableCell>
                <TableCell className="font-mono font-medium">{order.publicOrderCode}</TableCell>
                <TableCell>{formatDate(order.createdAt)}</TableCell>
                <TableCell>
                  {order.customerName}
                  {order.agentName ? <span className="text-muted-foreground"> (Agent: {order.agentName})</span> : null}
                </TableCell>
                <TableCell>{order.phoneNumber || "N/A"}</TableCell>
                <TableCell>{order.network || "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{order.sourceLabel}</Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant="secondary">{order.sellerRole}</Badge>
                    <div className="max-w-[140px] truncate text-[10px] text-muted-foreground">
                      {order.sellerName || order.agentName || "Direct"}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant="outline" className={paymentBadgeClass(order)}>
                      {paymentBadgeLabel(order)}
                    </Badge>
                    <div className="max-w-[140px] truncate font-mono text-[10px] text-muted-foreground">
                      {order.paymentReference}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <OrderStatusSelect
                    orderId={order.id}
                    initialStatus={order.status}
                    endpointBase="/api/dashboard/orders"
                  />
                </TableCell>
                <TableCell>
                  <OrderTimelineDialog orderId={order.id} />
                </TableCell>
                <TableCell className="text-right font-semibold">{formatGhanaCedis(order.total)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground">
                  No manual pending orders found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedRows.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 shadow-lg backdrop-blur md:left-auto md:right-6 md:bottom-6 md:w-[640px] md:rounded-md md:border">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">
              {selectedRows.length} selected
              {selectedPendingRows.length !== selectedRows.length ? ` (${selectedPendingRows.length} pending)` : ""}
            </span>
            <button type="button" className="text-xs text-muted-foreground" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => bulkUpdate("PROCESSING")} disabled={savingStatus !== null || selectedPendingRows.length === 0}>
              {savingStatus === "PROCESSING" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
              Claim Pending
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => copyOrders("selected")}>
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={sendSelectedToApi} disabled={dispatchingApi}>
              {dispatchingApi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              API
            </Button>
            <Button type="button" size="sm" className="text-xs" onClick={() => bulkUpdate("COMPLETED")} disabled={savingStatus !== null}>
              {savingStatus === "COMPLETED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Delivered
            </Button>
            <Button type="button" variant="destructive" size="sm" className="text-xs" onClick={() => bulkUpdate("FAILED")} disabled={savingStatus !== null}>
              {savingStatus === "FAILED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Failed
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
