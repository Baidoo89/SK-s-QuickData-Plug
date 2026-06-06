"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ClipboardCopy, Eye, Loader2, PackageCheck, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OrderStatusSelect } from "@/components/admin/order-status-select"
import { OrderTimelineDialog } from "@/components/orders/order-timeline-dialog"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"

export type DashboardOrderRow = {
  id: string
  publicOrderCode: string
  createdAt: string
  buyerName: string
  phoneNumber: string
  bundle: string
  network: string
  sourceLabel: string
  sellerRole: string
  sellerName: string
  provider: string
  paymentOwner: string
  paymentStatus: string
  fulfillmentMode: string
  status: string
  total: number
  profit: number
  actionable: boolean
}

type Props = {
  rows: DashboardOrderRow[]
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatBundleForCopy(value: string) {
  const match = value.match(/\b(\d+(?:\.\d+)?)\s*(GB|MB|KB|TB)\b/i)
  if (!match) return value || "Bundle N/A"

  const amount = match[1]
  const unit = match[2].toUpperCase()

  if (unit === "GB") return amount
  return `${amount}${unit}`
}

function buildCopyText(rows: DashboardOrderRow[]) {
  return rows
    .map((order) => {
      const network = order.network.trim().toUpperCase()
      const bundle = formatBundleForCopy(order.bundle)
      const networkLabel = network === "AIRTELTIGO" ? "AT" : network === "TELECEL" ? "TELECEL" : network
      const parts = [order.phoneNumber || "N/A", bundle]

      if (network && network !== "MTN") {
        parts.push(networkLabel)
      }

      return parts.join("\t")
    })
    .join("\n")
}

const PAYMENT_LOCKED_STATUSES = new Set(["PENDING_PAYMENT", "PAYMENT_FAILED", "PAYMENT_INIT_FAILED"])

function canEditStatus(order: DashboardOrderRow) {
  return !PAYMENT_LOCKED_STATUSES.has(order.status)
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "secondary"
  if (status === "FAILED" || status === "PAYMENT_FAILED") return "destructive"
  return "outline"
}

export function DashboardOrdersWorkspace({ rows }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [savingStatus, setSavingStatus] = useState<"PROCESSING" | "COMPLETED" | "FAILED" | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const actionableRows = useMemo(() => rows.filter((row) => row.actionable), [rows])
  const pendingRows = useMemo(() => actionableRows.filter((row) => row.status === "PENDING"), [actionableRows])
  const processingRows = useMemo(() => actionableRows.filter((row) => row.status === "PROCESSING"), [actionableRows])
  const selectedRows = useMemo(
    () => actionableRows.filter((row) => selected.has(row.id)),
    [actionableRows, selected],
  )
  const selectedPendingRows = useMemo(
    () => selectedRows.filter((row) => row.status === "PENDING"),
    [selectedRows],
  )

  const allPendingSelected = pendingRows.length > 0 && pendingRows.every((row) => selected.has(row.id))
  const previewRows = selectedRows.length > 0 ? selectedRows : pendingRows
  const copyPreview = buildCopyText(previewRows.slice(0, 8))

  function toggleOrder(order: DashboardOrderRow) {
    if (!order.actionable) return

    setSelected((current) => {
      const next = new Set(current)
      if (next.has(order.id)) {
        next.delete(order.id)
      } else {
        next.add(order.id)
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
        description: scope === "pending"
          ? "There are no pending paid manual orders ready to pick."
          : "Select one or more eligible orders first.",
      })
      return
    }

    await navigator.clipboard.writeText(buildCopyText(copyRows))
    toast({
      title: "Copied",
      description: `${copyRows.length} order${copyRows.length === 1 ? "" : "s"} copied for processing.`,
    })
  }

  async function bulkUpdate(status: "PROCESSING" | "COMPLETED" | "FAILED") {
    const updateRows = status === "PROCESSING" ? selectedPendingRows : selectedRows

    if (updateRows.length === 0) {
      toast({
        title: "No orders selected",
        description: status === "PROCESSING"
          ? "Select pending paid manual orders before claiming."
          : "Select paid manual orders first.",
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

  return (
    <div className="portal-page max-w-full space-y-3 pb-24 md:pb-0">
      <div className="flex min-w-0 flex-col gap-3 rounded-md border bg-muted/30 p-3 xl:flex-row xl:items-center xl:justify-between">
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
        <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:w-auto xl:flex xl:flex-wrap xl:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen((open) => !open)}>
            <Eye className="mr-2 h-4 w-4" />
            Preview Copy
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => copyOrders("pending")}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy Pending
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => copyOrders("selected")} disabled={selectedRows.length === 0}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy Selected
          </Button>
        </div>
      </div>

      {previewOpen ? (
        <div className="rounded-md border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Copy preview</p>
              <p className="text-[11px] text-muted-foreground">
                {selectedRows.length > 0 ? "Selected rows" : "Pending rows"} only. MTN copies as phone and bundle. Other networks add the network label.
              </p>
            </div>
            <Badge variant="outline">{previewRows.length} rows</Badge>
          </div>
          <pre className="max-h-44 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
            {copyPreview || "No eligible rows available"}
          </pre>
        </div>
      ) : null}

      <div className="min-w-0 max-w-full overflow-hidden rounded-md border bg-background">
        <div className="table-scroll">
        <Table className="min-w-[1440px] table-fixed text-xs">
          <TableHeader className="bg-muted/40">
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
              <TableHead className="w-[104px]">Date</TableHead>
              <TableHead className="w-[150px]">Customer</TableHead>
              <TableHead className="w-[112px]">Phone</TableHead>
              <TableHead className="w-[125px]">Bundle</TableHead>
              <TableHead className="w-[82px]">Network</TableHead>
              <TableHead className="w-[104px]">Source</TableHead>
              <TableHead className="w-[120px]">Seller</TableHead>
              <TableHead className="w-[112px]">Payment</TableHead>
              <TableHead className="w-[105px]">Fulfillment</TableHead>
              <TableHead className="w-[145px]">Status</TableHead>
              <TableHead className="w-[98px]">Timeline</TableHead>
              <TableHead className="w-[90px] text-right">Total</TableHead>
              <TableHead className="w-[90px] text-right">Profit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((order) => {
              const editableStatus = canEditStatus(order)

              return (
              <TableRow key={order.id} className={selected.has(order.id) ? "bg-primary/5" : "hover:bg-muted/20"}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(order.id)}
                    disabled={!order.actionable}
                    onChange={() => toggleOrder(order)}
                    className="h-4 w-4 rounded border-border disabled:opacity-40"
                    aria-label={`Select order ${order.publicOrderCode}`}
                  />
                </TableCell>
                <TableCell className="font-mono font-medium">{order.publicOrderCode}</TableCell>
                <TableCell>{formatDate(order.createdAt)}</TableCell>
                <TableCell className="truncate">{order.buyerName}</TableCell>
                <TableCell>{order.phoneNumber || "N/A"}</TableCell>
                <TableCell className="truncate font-medium">{order.bundle || "Bundle N/A"}</TableCell>
                <TableCell>{order.network || "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{order.sourceLabel}</Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant="secondary">{order.sellerRole}</Badge>
                    <p className="truncate text-[10px] text-muted-foreground">{order.sellerName}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant={order.paymentStatus === "PAID" ? "secondary" : "outline"}>{order.paymentStatus}</Badge>
                    <p className="text-[10px] text-muted-foreground">{order.paymentOwner}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={order.fulfillmentMode === "MANUAL" ? "outline" : "secondary"}>{order.fulfillmentMode}</Badge>
                </TableCell>
                <TableCell>
                  {editableStatus ? (
                    <OrderStatusSelect
                      orderId={order.id}
                      initialStatus={order.status}
                      endpointBase="/api/dashboard/orders"
                    />
                  ) : (
                    <Badge variant={statusTone(order.status)}>{order.status}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <OrderTimelineDialog orderId={order.id} />
                </TableCell>
                <TableCell className="text-right font-bold">{formatGhanaCedis(order.total)}</TableCell>
                <TableCell className={order.profit > 0 ? "text-right font-semibold text-primary" : "text-right text-muted-foreground"}>
                  {formatGhanaCedis(order.profit)}
                </TableCell>
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
        </div>
      </div>

      {selectedRows.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 max-w-full border-t bg-background/95 p-3 shadow-lg backdrop-blur md:left-auto md:right-6 md:bottom-6 md:w-[520px] md:rounded-md md:border">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">
              {selectedRows.length} selected
              {selectedPendingRows.length !== selectedRows.length ? ` (${selectedPendingRows.length} pending)` : ""}
            </span>
            <button type="button" className="text-xs text-muted-foreground" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <Button type="button" variant="outline" size="sm" onClick={() => bulkUpdate("PROCESSING")} disabled={savingStatus !== null || selectedPendingRows.length === 0}>
              {savingStatus === "PROCESSING" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
              Claim Pending
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => copyOrders("selected")}>
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button type="button" size="sm" onClick={() => bulkUpdate("COMPLETED")} disabled={savingStatus !== null}>
              {savingStatus === "COMPLETED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Delivered
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => bulkUpdate("FAILED")} disabled={savingStatus !== null}>
              {savingStatus === "FAILED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Failed
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
