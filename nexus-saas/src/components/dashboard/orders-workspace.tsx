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

type ClaimedSet = {
  id: string
  label: string
  orderIds: string[]
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
  const [dispatchingApi, setDispatchingApi] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [claimedSets, setClaimedSets] = useState<ClaimedSet[]>([])

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
  const selectedProcessingRows = useMemo(
    () => selectedRows.filter((row) => row.status === "PROCESSING"),
    [selectedRows],
  )

  const allPendingSelected = pendingRows.length > 0 && pendingRows.every((row) => selected.has(row.id))
  const previewRows = selectedRows.length > 0 ? selectedRows : pendingRows
  const copyPreview = buildCopyText(previewRows.slice(0, 8))
  const claimedSetSummaries = useMemo(
    () =>
      claimedSets.map((set) => {
        const setRows = rows.filter((row) => set.orderIds.includes(row.id))
        const processingCount = setRows.filter((row) => row.status === "PROCESSING").length
        const pendingCount = setRows.filter((row) => row.status === "PENDING").length
        const completedCount = setRows.filter((row) => row.status === "COMPLETED").length

        return {
          ...set,
          count: set.orderIds.length,
          processingCount,
          pendingCount,
          completedCount,
        }
      }),
    [claimedSets, rows],
  )

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
      if (pendingRows.length === 0) return current

      const pendingIds = pendingRows.map((row) => row.id)
      const onlyPendingSelected =
        current.size === pendingIds.length && pendingIds.every((id) => current.has(id))

      if (onlyPendingSelected) {
        return new Set()
      }

      return new Set(pendingIds)
    })
  }

  async function copyOrders(scope: "selected" | "pending") {
    const copyRows = scope === "selected" ? selectedRows : pendingRows
    if (copyRows.length === 0) {
      toast({
        title: "Nothing to copy",
        description: scope === "pending"
          ? "There are no pending paid orders ready to pick."
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

  async function submitBulkStatus({
    orderIds,
    status,
    keepSelectedIds,
    successDescription,
    removeClaimedSetId,
  }: {
    orderIds: string[]
    status: "PROCESSING" | "COMPLETED" | "FAILED"
    keepSelectedIds?: string[]
    successDescription?: string
    removeClaimedSetId?: string
  }) {
    setSavingStatus(status)
    try {
      const res = await fetch("/api/dashboard/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds,
          status,
        }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Bulk update failed")
      }

      toast({
        title: "Orders updated",
        description: successDescription ?? `${payload?.data?.updated ?? 0} updated, ${payload?.data?.skipped ?? 0} skipped.`,
      })

      if (keepSelectedIds) {
        setSelected(new Set(keepSelectedIds))
      } else {
        setSelected(new Set())
      }
      if (removeClaimedSetId) {
        setClaimedSets((current) => current.filter((set) => set.id !== removeClaimedSetId))
      }
      router.refresh()
      return true
    } catch (error) {
      toast({
        title: "Bulk update failed",
        description: error instanceof Error ? error.message : "Could not update selected orders.",
        variant: "destructive",
      })
    } finally {
      setSavingStatus(null)
    }

    return false
  }

  async function bulkUpdate(status: "PROCESSING" | "COMPLETED" | "FAILED") {
    const updateRows = status === "PROCESSING" ? selectedPendingRows : selectedRows

    if (updateRows.length === 0) {
      toast({
        title: "No orders selected",
        description: status === "PROCESSING"
          ? "Select pending paid orders before claiming."
          : "Select paid orders first.",
      })
      return
    }

    const label = status === "PROCESSING" ? "processing" : status === "COMPLETED" ? "delivered" : "failed"
    const confirmed = window.confirm(`Mark ${updateRows.length} selected order${updateRows.length === 1 ? "" : "s"} as ${label}?`)
    if (!confirmed) return

    const orderIds = updateRows.map((row) => row.id)
    const claimedSetId = `claimed-${Date.now()}`
    const ok = await submitBulkStatus({
      orderIds,
      status,
      keepSelectedIds: status === "PROCESSING" ? orderIds : undefined,
      successDescription: status === "PROCESSING"
        ? `${orderIds.length} claimed. This set stays selected and is saved below.`
        : undefined,
    })

    if (ok && status === "PROCESSING") {
      setClaimedSets((current) => [
        ...current,
        {
          id: claimedSetId,
          label: `Set ${current.length + 1}`,
          orderIds,
        },
      ])
    }
  }

  async function updateClaimedSet(set: ClaimedSet, status: "COMPLETED" | "FAILED") {
    const label = status === "COMPLETED" ? "delivered" : "failed"
    const confirmed = window.confirm(`Mark ${set.label} (${set.orderIds.length} order${set.orderIds.length === 1 ? "" : "s"}) as ${label}?`)
    if (!confirmed) return

    await submitBulkStatus({
      orderIds: set.orderIds,
      status,
      successDescription: `${set.label} marked ${label}.`,
      removeClaimedSetId: set.id,
    })
  }

  async function sendSelectedToApi() {
    if (selectedRows.length === 0) {
      toast({
        title: "No orders selected",
        description: "Select paid pending or processing orders first.",
      })
      return
    }

    const confirmed = window.confirm(
      `Send ${selectedRows.length} selected order${selectedRows.length === 1 ? "" : "s"} through automatic delivery?`,
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
        throw new Error(payload?.error?.message || "Automatic delivery failed")
      }

      const data = payload?.data || {}
      toast({
        title: "Automatic delivery complete",
        description: `${data.sentToApi ?? 0} sent automatically, ${data.stayedManual ?? 0} stayed manual, ${data.skipped ?? 0} skipped.`,
      })
      setSelected(new Set())
      router.refresh()
    } catch (error) {
      toast({
        title: "Automatic delivery failed",
        description: error instanceof Error ? error.message : "Could not send selected orders automatically.",
        variant: "destructive",
      })
    } finally {
      setDispatchingApi(false)
    }
  }

  return (
    <div className="portal-page max-w-full space-y-3 pb-24 md:pb-0">
      <div className="premium-surface flex min-w-0 flex-col gap-3 rounded-lg p-3 xl:flex-row xl:items-center xl:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
          checked={allPendingSelected}
          onChange={toggleAllPending}
          className="h-4 w-4 rounded border-border"
        />
          Select pending as new set
          <Badge variant="outline" className="ml-1">{pendingRows.length}</Badge>
        </label>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="rounded-md">Pending to pick: {pendingRows.length}</Badge>
          <Badge variant="outline" className="rounded-md">Processing: {processingRows.length}</Badge>
          <Badge variant="outline" className="rounded-md">Selected: {selectedRows.length}</Badge>
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:w-auto xl:flex xl:flex-wrap xl:justify-end">
          <Button type="button" variant="outline" size="sm" className="border-slate-300 bg-background text-xs hover:bg-slate-100" onClick={() => setPreviewOpen((open) => !open)}>
            <Eye className="mr-2 h-4 w-4" />
            Preview Copy
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-sky-300 bg-sky-50 text-xs text-sky-800 hover:bg-sky-100" onClick={() => copyOrders("pending")}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy Pending
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-blue-300 bg-blue-50 text-xs text-blue-800 hover:bg-blue-100" onClick={() => copyOrders("selected")} disabled={selectedRows.length === 0}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copy Selected
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-violet-300 bg-violet-50 text-xs text-violet-800 hover:bg-violet-100" onClick={sendSelectedToApi} disabled={dispatchingApi || selectedRows.length === 0}>
            {dispatchingApi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send Auto
          </Button>
        </div>
      </div>

      {previewOpen ? (
        <div className="premium-surface rounded-lg p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Copy preview</p>
              <p className="text-[11px] text-muted-foreground">
                {selectedRows.length > 0 ? "Selected rows" : "Pending rows"} only. MTN copies as phone and bundle. Other networks add the network label.
              </p>
            </div>
            <Badge variant="outline" className="rounded-md">{previewRows.length} rows</Badge>
          </div>
          <pre className="max-h-44 overflow-auto rounded-lg border border-border/60 bg-muted/35 p-3 font-mono text-xs leading-relaxed text-foreground">
            {copyPreview || "No eligible rows available"}
          </pre>
        </div>
      ) : null}

      {claimedSetSummaries.length > 0 ? (
        <div className="premium-surface rounded-lg border border-blue-200 bg-blue-50/60 p-3">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-950">Processing sets</p>
              <p className="text-xs text-blue-800">Claimed batches stay here so you can deliver the exact set later.</p>
            </div>
            <Badge variant="outline" className="w-fit border-blue-300 bg-white text-blue-800">{claimedSetSummaries.length} active</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {claimedSetSummaries.map((set) => (
              <div key={set.id} className="rounded-lg border border-blue-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{set.label}</p>
                  <Badge variant="outline" className="rounded-md">{set.count} orders</Badge>
                </div>
                <div className="mb-3 flex flex-wrap gap-1 text-[11px]">
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">{set.pendingCount} pending</Badge>
                  <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800">{set.processingCount} processing</Badge>
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">{set.completedCount} delivered</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button type="button" variant="outline" size="sm" className="border-blue-300 bg-blue-50 text-xs font-semibold text-blue-800 hover:bg-blue-100" onClick={() => setSelected(new Set(set.orderIds))}>
                    Select
                  </Button>
                  <Button type="button" size="sm" className="bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700" onClick={() => updateClaimedSet(set, "COMPLETED")} disabled={savingStatus !== null}>
                    Deliver
                  </Button>
                  <Button type="button" variant="destructive" size="sm" className="text-xs font-semibold" onClick={() => updateClaimedSet(set, "FAILED")} disabled={savingStatus !== null}>
                    Fail
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ops-table-surface min-w-0 max-w-full overflow-hidden rounded-lg">
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
                  aria-label="Select pending orders as a new set"
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
              <TableHead className="w-[105px]">Processing</TableHead>
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
              <TableRow key={order.id} className={selected.has(order.id) ? "bg-primary/10" : ""}>
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
                  <Badge variant="outline" className="rounded-md">{order.sourceLabel}</Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant="secondary" className="rounded-md">{order.sellerRole}</Badge>
                    <p className="truncate text-[10px] text-muted-foreground">{order.sellerName}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant={order.paymentStatus === "PAID" ? "secondary" : "outline"} className="rounded-md">{order.paymentStatus}</Badge>
                    <p className="text-[10px] text-muted-foreground">{order.paymentOwner}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={order.fulfillmentMode === "MANUAL" ? "outline" : "secondary"} className="rounded-md">{order.fulfillmentMode}</Badge>
                </TableCell>
                <TableCell>
                  {editableStatus ? (
                    <OrderStatusSelect
                      orderId={order.id}
                      initialStatus={order.status}
                      endpointBase="/api/dashboard/orders"
                    />
                  ) : (
                    <Badge variant={statusTone(order.status)} className="rounded-md">{order.status}</Badge>
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
        <div className="premium-surface fixed inset-x-0 bottom-0 z-40 max-w-full border-t p-3 backdrop-blur md:left-auto md:right-6 md:bottom-6 md:w-[640px] md:rounded-lg md:border">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">
              Active set: {selectedRows.length}
            </span>
            <div className="hidden flex-wrap gap-1 sm:flex">
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">{selectedPendingRows.length} pending</Badge>
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800">{selectedProcessingRows.length} processing</Badge>
            </div>
            <button type="button" className="text-xs text-muted-foreground" onClick={() => setSelected(new Set())}>
              Clear set
            </button>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
            <Button type="button" variant="outline" size="sm" className="border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900 hover:bg-amber-100" onClick={() => bulkUpdate("PROCESSING")} disabled={savingStatus !== null || selectedPendingRows.length === 0}>
              {savingStatus === "PROCESSING" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
              Claim Set
            </Button>
            <Button type="button" variant="outline" size="sm" className="border-blue-300 bg-blue-50 text-xs font-semibold text-blue-800 hover:bg-blue-100" onClick={() => copyOrders("selected")}>
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button type="button" variant="outline" size="sm" className="border-violet-300 bg-violet-50 text-xs font-semibold text-violet-800 hover:bg-violet-100" onClick={sendSelectedToApi} disabled={dispatchingApi}>
              {dispatchingApi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Auto
            </Button>
            <Button type="button" size="sm" className="bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700" onClick={() => bulkUpdate("COMPLETED")} disabled={savingStatus !== null}>
              {savingStatus === "COMPLETED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Deliver Set
            </Button>
            <Button type="button" variant="destructive" size="sm" className="text-xs font-semibold shadow-sm" onClick={() => bulkUpdate("FAILED")} disabled={savingStatus !== null}>
              {savingStatus === "FAILED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Fail Set
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
