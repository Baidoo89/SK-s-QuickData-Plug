"use client"

import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OrderTimelineDialog } from "@/components/orders/order-timeline-dialog"
import { formatGhanaCedis } from "@/lib/currency"

type ReviewCase = { id: string; kind: string; targetType: string; targetId: string; reference: string | null; reason: string; status: string; version: number; organization: string; createdAt: string; reviewNote: string | null; reviewedAt: string | null; reviewedBy: string | null; orderCode: string; orderStatus: string | null }
type Payload = { cases: ReviewCase[]; total: number; openCount: number; reviewedCount: number; page: number; pageSize: number; overdue: { rows: { userId: string; email: string | null; name: string | null; dueAt: string; owed: number }[]; hasMore: boolean }; imported: number; isPlatformAdmin: boolean }
const titles: Record<string, string> = { DISPATCH_UNCERTAIN: "Confirm delivery with the provider", STOREFRONT_PAYMENT: "Check a customer payment", SUBSCRIPTION_PAYMENT: "Check a subscription payment", PROVIDER_CONFLICT: "Check conflicting delivery updates" }
const timestamp = (value: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " GMT"

export function FinancialReviewWorkspace() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("OPEN")
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<ReviewCase | null>(null)
  const [note, setNote] = useState("")
  const [outcome, setOutcome] = useState("REVIEWED")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError("")
    void (async () => {
      try {
        const response = await fetch(`/api/reconciliation?status=${status}&page=${page}&q=${encodeURIComponent(search)}`, { cache: "no-store", signal: controller.signal })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message || "Could not load financial reviews.")
        if (!controller.signal.aborted) setPayload(result.data)
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load financial reviews.")
      } finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [status, page, search, refresh])
  function edit(row: ReviewCase) { setEditing(row); setNote(""); setOutcome(row.status === "REVIEWED" ? "OPEN" : "REVIEWED"); setSaveError("") }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing || saving) return
    if (note.trim().length < 10) { setSaveError("Describe what you checked and the outcome, using at least 10 characters."); return }
    setSaving(true); setSaveError("")
    try {
      const response = await fetch("/api/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, version: editing.version, status: outcome, note: note.trim() }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message || "Could not record the review.")
      setEditing(null); setRefresh(value => value + 1)
    } catch (failure) { setSaveError(failure instanceof Error ? failure.message : "Could not record the review.") }
    finally { setSaving(false) }
  }
  const base = payload?.isPlatformAdmin ? "/admin" : "/dashboard"
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold tracking-tight">Review</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Resolve payment, delivery, and debt exceptions.</p></div>
    <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end" onSubmit={event => { event.preventDefault(); setPage(0); setSearch(query); setRefresh(value => value + 1) }}>
      <div className="space-y-2"><Label htmlFor="review-search">Search</Label><Input id="review-search" type="search" placeholder="Order, reference, name or email" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="review-status">Review status</Label><select id="review-status" value={status} onChange={event => { setStatus(event.target.value); setPage(0) }} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="OPEN">Open</option><option value="REVIEWED">Reviewed</option><option value="ALL">All</option></select></div>
      <Button type="submit" disabled={loading}>Refresh</Button>
    </form>
    {error && <div role="alert" className="rounded-md border p-4"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRefresh(value => value + 1)}>Try again</Button></div>}
    {loading ? <p role="status">Loading financial review...</p> : !error && payload && <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-xs"><span><strong className="text-foreground">{payload.openCount}</strong> open</span><span><strong className="text-foreground">{payload.reviewedCount}</strong> reviewed</span><span><strong className={payload.overdue.rows.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}>{payload.overdue.rows.length}{payload.overdue.hasMore ? "+" : ""}</strong> overdue</span></div>
      {payload.imported === 100 && <p className="text-sm text-muted-foreground">100 historical dispatch alerts were added. Refresh to continue importing older alerts.</p>}
      <section className="space-y-3" aria-labelledby="review-cases"><h2 id="review-cases" className="text-lg font-semibold">Exception cases</h2>
        {payload.cases.length === 0 ? <p className="rounded-lg border p-5 text-sm text-muted-foreground">No review cases match this filter.</p> : <div className="grid gap-4 xl:grid-cols-2">{payload.cases.map(row => <Card key={row.id} data-testid={`review-case-${row.id}`}><CardHeader><CardTitle className="text-base">{titles[row.kind] || "Financial review"}</CardTitle><p className="text-xs text-muted-foreground">{row.organization} | {row.status === "OPEN" ? "Open" : "Reviewed"}</p></CardHeader><CardContent className="space-y-3 text-sm"><p>{row.reason}</p><p className="break-all text-muted-foreground">{row.targetType === "ORDER" ? "Order" : "Record"}: {row.orderCode}</p>{row.orderStatus && <p>Current order status: {row.orderStatus}</p>}{row.reference && <p className="break-all text-muted-foreground">Reference: {row.reference}</p>}<p className="text-xs text-muted-foreground">Opened {timestamp(row.createdAt)}</p>
          {row.reviewNote && <div className="rounded-md bg-muted/50 p-3"><p className="whitespace-pre-wrap break-words">{row.reviewNote}</p><p className="mt-2 text-xs text-muted-foreground">{row.reviewedBy}{row.reviewedAt ? " | " + timestamp(row.reviewedAt) : ""}</p></div>}
          <div className="flex flex-wrap gap-2">{row.targetType === "ORDER" && <OrderTimelineDialog orderId={row.targetId} endpointBase={payload.isPlatformAdmin ? "/api/admin/orders" : "/api/orders"} />}<Button variant="outline" onClick={() => edit(row)}>{row.status === "REVIEWED" ? "Reopen / add note" : "Record review"}</Button><Button variant="ghost" asChild><Link href={row.kind === "SUBSCRIPTION_PAYMENT" ? base + (payload.isPlatformAdmin ? "/subscriptions" : "/subscription") : base + "/orders"}>Open management</Link></Button></div>
        </CardContent></Card>)}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">Page {payload.page + 1} | {payload.total} matching cases</p><div className="flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</Button><Button variant="outline" disabled={(page + 1) * payload.pageSize >= payload.total} onClick={() => setPage(value => value + 1)}>Next</Button></div></div>
      </section>
      <section className="space-y-3" aria-labelledby="overdue-accounts"><div><h2 id="overdue-accounts" className="text-lg font-semibold">Overdue debt</h2><p className="text-sm text-muted-foreground">Accounts that need settlement.</p></div>{payload.overdue.rows.length === 0 ? <p className="rounded-lg border p-5 text-sm text-muted-foreground">No overdue balances match this search.</p> : <div className="grid gap-3 xl:grid-cols-2">{payload.overdue.rows.map(row => <Card key={row.userId} data-testid={`overdue-account-${row.userId}`}><CardContent className="space-y-2 pt-6"><p className="break-words font-medium">{row.name || row.email || "Account"}</p><p className="break-all text-sm text-muted-foreground">{row.email}</p><p className="font-semibold text-destructive">Owes {formatGhanaCedis(row.owed)}</p><p className="text-xs text-muted-foreground">Due {timestamp(row.dueAt)}</p><Button variant="outline" asChild><Link href={base + "/credit?q=" + encodeURIComponent(row.email || row.name || "")}>Open debt account</Link></Button></CardContent></Card>)}</div>}</section>
    </>}
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !saving) setEditing(null) }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Record financial review</DialogTitle><DialogDescription>Record the evidence you checked. Delivery, payment and balance changes use their separate verified workflows.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><div className="space-y-2"><Label htmlFor="review-outcome">Review outcome</Label><select id="review-outcome" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={outcome} onChange={event => setOutcome(event.target.value)}><option value="REVIEWED">Mark reviewed</option><option value="OPEN">Keep open / reopen</option></select></div><div className="space-y-2"><Label htmlFor="review-note">Review note / provider evidence</Label><textarea id="review-note" className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" required minLength={10} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="What did you verify, and where was the resulting action recorded?" /></div>{saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save review"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}
