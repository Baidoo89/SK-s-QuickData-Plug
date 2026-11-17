"use client"

import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatGhanaCedis } from "@/lib/currency"

type Account = { userId: string; name: string | null; email: string | null; role: string; organization: string; enabled: boolean; limit: number; balance: number; owed: number; overdue: boolean; dueAt: string | null; availableToSpend: number; canEdit: boolean; isSelf: boolean }
const dueDate = (value: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " GMT"

export function CreditWorkspace() {
  const [rows, setRows] = useState<Account[]>([])
  const [canManage, setCanManage] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<Account | null>(null)
  const [limit, setLimit] = useState("")
  const [enabled, setEnabled] = useState(false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  async function load(search = "") {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/credit-accounts?q=${encodeURIComponent(search)}`, { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error?.message || "Could not load credit accounts.")
      setRows(payload.data.rows); setCanManage(payload.data.canManage)
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load credit accounts.") }
    finally { setLoading(false) }
  }
  useEffect(() => { const initialQuery = (new URLSearchParams(window.location.search).get("q") ?? "").slice(0, 100); setQuery(initialQuery); void load(initialQuery) }, [])
  function edit(row: Account) { setEditing(row); setLimit(row.limit.toFixed(2)); setEnabled(row.enabled); setNote(""); setSaveError("") }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing || saving) return
    if (!/^\d+(?:\.\d{1,2})?$/.test(limit) || !Number.isFinite(Number(limit)) || (enabled && Number(limit) <= 0) || note.trim().length < 3) { setSaveError("Enter a valid limit and an approval note. Enabled credit needs a positive limit."); return }
    setSaving(true); setSaveError("")
    try {
      const response = await fetch("/api/credit-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: editing.userId, limit: Number(limit), enabled, note: note.trim() }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error?.message || "Could not save the credit limit.")
      setEditing(null); await load(query)
    } catch (failure) { setSaveError(failure instanceof Error ? failure.message : "Could not save the credit limit.") }
    finally { setSaving(false) }
  }
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Credit &amp; debt</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Purchases use wallet funds first. Approved credit covers a shortfall up to the limit. Borrowed funds are due by the end of that day, at midnight GMT; overdue debt blocks further borrowing.</p></div>
    <Card><CardContent className="space-y-2 pt-6 text-sm"><p>Top-ups and refunds reduce the amount owed. Turning off credit prevents new borrowing and keeps existing debt on record.</p><p className="text-muted-foreground">Store owners approve agents and resellers in their business. Platform admins approve store-owner credit.</p></CardContent></Card>
    {canManage && <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); void load(query) }}><div className="flex-1 space-y-2"><Label htmlFor="credit-search">Find an account</Label><Input id="credit-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or email" /></div><Button type="submit" disabled={loading}>Search accounts</Button></form>}
    {error && <div role="alert" className="space-y-2 rounded-lg border p-4"><p>{error}</p><Button variant="outline" onClick={() => void load(query)}>Try again</Button></div>}
    {loading ? <p role="status">Loading credit accounts...</p> : !error && <>
      <p className="text-sm text-muted-foreground">{rows.length} account{rows.length === 1 ? "" : "s"} shown. {canManage ? "Search to narrow the list; up to 100 accounts are shown." : "Your balance and credit details."}</p>
      <div className="grid gap-4 xl:grid-cols-2">{rows.map(row => <Card key={row.userId} data-testid={`credit-account-${row.userId}`}>
        <CardHeader className="space-y-2"><CardTitle className="break-words text-base">{row.name || row.email || "Account"}</CardTitle><p className="break-all text-sm text-muted-foreground">{row.email}</p><p className="text-xs text-muted-foreground">{row.role.toLowerCase()} | {row.organization}</p></CardHeader>
        <CardContent className="space-y-4"><div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted-foreground">Amount owed</p><p className={row.overdue ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>{formatGhanaCedis(row.owed)}</p></div><div><p className="text-muted-foreground">Available for purchases</p><p className="text-lg font-semibold">{formatGhanaCedis(row.availableToSpend)}</p></div><div><p className="text-muted-foreground">Wallet balance</p><p>{formatGhanaCedis(row.balance)}</p></div><div><p className="text-muted-foreground">Credit limit</p><p>{formatGhanaCedis(row.limit)}</p></div></div>
          <div className="rounded-md bg-muted/50 p-3 text-sm"><p className="font-medium">{row.overdue ? "Overdue: clear debt before borrowing again" : row.enabled ? "Credit approved" : "Prepaid only"}</p>{row.dueAt && <p className="mt-1 text-muted-foreground">Due: {dueDate(row.dueAt)}</p>}</div>
          {row.isSelf && <Button asChild><Link href={row.role === "AGENT" ? "/agent/wallet" : row.role === "RESELLER" ? "/reseller/wallet" : "/dashboard/wallet"}>Top up wallet / repay</Link></Button>}
          {row.canEdit && <Button variant="outline" onClick={() => edit(row)}>Set credit for {row.name || row.email || "account"}</Button>}
        </CardContent></Card>)}</div>
      {rows.length === 0 && <p>No matching accounts found.</p>}
    </>}
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !saving) setEditing(null) }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Set credit limit</DialogTitle><DialogDescription>{editing?.email}. Approval does not erase existing debt. New borrowing is due at the end of the day.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4"><div className="flex items-center gap-2"><input id="credit-enabled" type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><Label htmlFor="credit-enabled">Allow credit purchases</Label></div><div className="space-y-2"><Label htmlFor="credit-limit">Credit limit (GHS)</Label><Input id="credit-limit" type="number" min="0" step="0.01" required value={limit} onChange={event => setLimit(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="credit-note">Approval note</Label><textarea id="credit-note" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" minLength={3} maxLength={500} required value={note} onChange={event => setNote(event.target.value)} placeholder="Reason for this limit or change" /></div>{saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save credit limit"}</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </div>
}
