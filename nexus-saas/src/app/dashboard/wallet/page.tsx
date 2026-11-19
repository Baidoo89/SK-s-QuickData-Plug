"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Activity, ArrowRightLeft, RefreshCw, WalletCards } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"

interface BeneficiarySuggestion {
  id: string
  name: string | null
  email: string
  role: string | null
  avatarUrl?: string | null
  balance?: number | null
}

interface WalletTopup {
  id: string
  createdAt: string
  method: "paystack" | "manual"
  performedByEmail: string | null
  performedByRole: string | null
  beneficiaryEmail: string
  amount: number
  status: "success"
}

interface WalletActivity {
  id: string
  createdAt: string
  method: string
  status: string
  amount: number
  performedByEmail: string | null
  performedByRole: string | null
  user?: { id: string | null; name: string | null; email: string | null; role: string | null; avatarUrl: string | null }
}

const moneyInput = /^\d+(?:\.\d{1,2})?$/

function statusBadgeClass(status: string) {
  if (status === "success") return "status-success border"
  if (status === "pending") return "status-warning border"
  if (status === "failed") return ""
  return "status-info border"
}

export default function WalletPage() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [balance, setBalance] = useState(0)
  const [topups, setTopups] = useState<WalletTopup[]>([])
  const [activities, setActivities] = useState<WalletActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [activityError, setActivityError] = useState("")
  const [topupAmount, setTopupAmount] = useState("")
  const [savingTopup, setSavingTopup] = useState(false)
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("")
  const [beneficiaryAmount, setBeneficiaryAmount] = useState("")
  const [savingManual, setSavingManual] = useState(false)
  const [beneficiarySuggestions, setBeneficiarySuggestions] = useState<BeneficiarySuggestion[]>([])
  const [searchingBeneficiaries, setSearchingBeneficiaries] = useState(false)
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiarySuggestion | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [activityFilter, setActivityFilter] = useState("")
  const [activityMethod, setActivityMethod] = useState("")
  const [activityStatus, setActivityStatus] = useState("")
  const searchController = useRef<AbortController | null>(null)

  const loadWallet = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      const response = await fetch("/api/agent/wallet", { cache: "no-store" })
      const payload = await response.json().catch(() => null) as { balance?: number; topups?: WalletTopup[]; data?: { balance?: number; topups?: WalletTopup[] }; error?: { message?: string }; message?: string } | null
      if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Could not load the wallet.")
      const data = payload?.data ?? payload
      if (typeof data?.balance === "number") setBalance(data.balance)
      if (Array.isArray(data?.topups)) setTopups(data.topups)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load the wallet.")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadActivities = useCallback(async () => {
    setActivityLoading(true)
    setActivityError("")
    try {
      const params = new URLSearchParams({ limit: "100" })
      if (activityFilter.trim()) params.set("q", activityFilter.trim())
      if (activityMethod) params.set("method", activityMethod)
      if (activityStatus) params.set("status", activityStatus)
      const response = await fetch(`/api/wallet/transactions?${params.toString()}`, { cache: "no-store" })
      const payload = await response.json().catch(() => null) as { results?: WalletActivity[]; data?: { results?: WalletActivity[] }; error?: { message?: string }; message?: string } | null
      if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Could not load wallet activity.")
      const results = payload?.data?.results ?? payload?.results
      setActivities(Array.isArray(results) ? results : [])
    } catch (cause) {
      setActivityError(cause instanceof Error ? cause.message : "Could not load wallet activity.")
    } finally {
      setActivityLoading(false)
    }
  }, [activityFilter, activityMethod, activityStatus])

  useEffect(() => { void loadWallet() }, [loadWallet])
  useEffect(() => { void loadActivities() }, [loadActivities])

  useEffect(() => {
    const status = searchParams.get("walletTopup")
    if (!status) return
    if (status === "success") {
      toast({ title: "Wallet funded", description: "Your payment was verified and the wallet was credited." })
      void loadWallet()
      void loadActivities()
    } else if (status === "failed") {
      toast({ variant: "destructive", title: "Top-up failed", description: "Payment verification failed. Please try again." })
    }
  }, [loadActivities, loadWallet, searchParams, toast])

  useEffect(() => {
    const trimmed = beneficiaryEmail.trim()
    searchController.current?.abort()
    if (trimmed.length < 2) {
      setBeneficiarySuggestions([])
      setSearchingBeneficiaries(false)
      return
    }
    const controller = new AbortController()
    searchController.current = controller
    setSearchingBeneficiaries(true)
    fetch(`/api/agent/wallet/beneficiaries?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) return []
        const payload = await response.json().catch(() => null) as { results?: BeneficiarySuggestion[]; data?: { results?: BeneficiarySuggestion[] } } | null
        return payload?.data?.results ?? payload?.results ?? []
      })
      .then(results => { if (!controller.signal.aborted) setBeneficiarySuggestions(Array.isArray(results) ? results : []) })
      .catch(() => { if (!controller.signal.aborted) setBeneficiarySuggestions([]) })
      .finally(() => { if (!controller.signal.aborted) setSearchingBeneficiaries(false) })
    return () => controller.abort()
  }, [beneficiaryEmail])

  function chooseBeneficiary(beneficiary: BeneficiarySuggestion) {
    setBeneficiaryEmail(beneficiary.email)
    setSelectedBeneficiary(beneficiary)
    setBeneficiarySuggestions([])
    setHighlightedIndex(-1)
  }

  async function startPaystackTopup(event: FormEvent) {
    event.preventDefault()
    if (!moneyInput.test(topupAmount) || Number(topupAmount) <= 0) {
      toast({ variant: "destructive", title: "Validation", description: "Enter an amount with up to two decimal places." })
      return
    }
    setSavingTopup(true)
    try {
      const response = await fetch("/api/wallet/paystack/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(topupAmount), returnPath: "/dashboard/wallet" }) })
      const payload = await response.json().catch(() => null) as { data?: { authorizationUrl?: string; paystackFee?: number; checkoutAmount?: number }; error?: { message?: string }; message?: string } | null
      const data = payload?.data
      if (!response.ok || !data?.authorizationUrl) throw new Error(payload?.error?.message || payload?.message || "Could not start wallet top-up.")
      const feeCopy = typeof data.paystackFee === "number" && typeof data.checkoutAmount === "number" ? ` You will pay ${formatGhanaCedis(data.checkoutAmount)} including ${formatGhanaCedis(data.paystackFee)} in fees.` : ""
      toast({ title: "Redirecting to Paystack", description: `Your wallet will receive ${formatGhanaCedis(Number(topupAmount))}.${feeCopy}` })
      setTopupAmount("")
      window.location.assign(data.authorizationUrl)
    } catch (cause) {
      toast({ variant: "destructive", title: "Top-up failed", description: cause instanceof Error ? cause.message : "Could not reach Paystack." })
    } finally {
      setSavingTopup(false)
    }
  }

  async function submitManualCredit(event: FormEvent) {
    event.preventDefault()
    if (!beneficiaryEmail.trim() || !moneyInput.test(beneficiaryAmount) || Number(beneficiaryAmount) <= 0) {
      toast({ variant: "destructive", title: "Validation", description: "Choose a beneficiary and enter an amount with up to two decimal places." })
      return
    }
    setSavingManual(true)
    try {
      const response = await fetch("/api/agent/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "manual", beneficiaryEmail: beneficiaryEmail.trim(), amount: Number(beneficiaryAmount) }) })
      const payload = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null
      if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Manual credit failed.")
      setBeneficiaryEmail("")
      setBeneficiaryAmount("")
      setBeneficiarySuggestions([])
      setSelectedBeneficiary(null)
      toast({ title: "Wallet credited", description: "The selected team wallet was credited." })
      await Promise.all([loadWallet(), loadActivities()])
    } catch (cause) {
      toast({ variant: "destructive", title: "Credit failed", description: cause instanceof Error ? cause.message : "Could not reach wallet service." })
    } finally {
      setSavingManual(false)
    }
  }

  return (
    <div className="portal-page mx-auto w-full max-w-6xl space-y-5">
      <PageHeader eyebrow="Finance" title="Wallet" description="Fund your wallet and manage team transfers." />
      <section aria-label="Wallet status" className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-3 text-xs">
        <span className="rounded-md bg-muted px-3 py-1.5"><strong className="mr-1 text-foreground">{formatGhanaCedis(balance)}</strong> available</span>
        <span className="rounded-md bg-muted px-3 py-1.5"><strong className="mr-1 text-foreground">{topups.length}</strong> recent top-ups</span>
        <span className="rounded-md bg-muted px-3 py-1.5"><strong className="mr-1 text-foreground">{activities.length}</strong> activity records</span>
      </section>
      {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 p-4 text-sm"><span>{loadError}</span><Button variant="outline" onClick={() => void loadWallet()}>Try again</Button></div> : null}
      <Card className="overflow-hidden rounded-lg border-primary/25 bg-primary/5"><CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><WalletCards className="h-5 w-5" /></div><div><p className="text-sm font-semibold">Operational wallet</p><p className="text-xs text-muted-foreground">Used for your wallet-backed purchases and team transfers.</p></div></div><p className="text-xl font-bold text-foreground">{loading ? "Loading..." : formatGhanaCedis(balance)}</p></CardContent></Card>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card id="paystack-top-up" className="premium-surface overflow-hidden rounded-lg"><CardHeader className="border-b border-border/70 bg-muted/20 pb-3"><CardTitle className="text-sm font-semibold">Fund your wallet</CardTitle><CardDescription className="text-xs">Paystack adds its fee at checkout; your wallet receives the amount entered.</CardDescription></CardHeader><CardContent className="space-y-3 p-4"><form onSubmit={startPaystackTopup} className="space-y-3"><label htmlFor="wallet-topup-amount" className="block text-xs font-medium">Amount (GHS)</label><Input id="wallet-topup-amount" type="number" min={1} step="0.01" inputMode="decimal" value={topupAmount} onChange={(event: ChangeEvent<HTMLInputElement>) => setTopupAmount(event.target.value)} placeholder="e.g. 100.00" /><Button type="submit" disabled={savingTopup}>{savingTopup ? "Redirecting..." : "Top up with Paystack"}</Button></form></CardContent></Card>
        <Card id="manual_credit" className="premium-surface overflow-hidden rounded-lg"><CardHeader className="border-b border-border/70 bg-muted/20 pb-3"><CardTitle className="flex items-center gap-2 text-sm font-semibold"><ArrowRightLeft className="h-4 w-4 text-primary" />Credit a team wallet</CardTitle><CardDescription className="text-xs">Transfer available wallet funds to an agent or reseller in your business.</CardDescription></CardHeader><CardContent className="space-y-3 p-4"><form onSubmit={submitManualCredit} className="space-y-3"><div className="space-y-1.5"><label htmlFor="beneficiary-email" className="block text-xs font-medium">Agent or reseller</label><Input id="beneficiary-email" type="email" value={beneficiaryEmail} onChange={(event: ChangeEvent<HTMLInputElement>) => { setBeneficiaryEmail(event.target.value); setSelectedBeneficiary(null); setHighlightedIndex(-1) }} onKeyDown={(event) => { if (!beneficiarySuggestions.length) return; if (event.key === "ArrowDown") { event.preventDefault(); setHighlightedIndex(index => Math.min(index + 1, beneficiarySuggestions.length - 1)) } else if (event.key === "ArrowUp") { event.preventDefault(); setHighlightedIndex(index => Math.max(index - 1, 0)) } else if (event.key === "Enter" && highlightedIndex >= 0) { event.preventDefault(); chooseBeneficiary(beneficiarySuggestions[highlightedIndex]) } }} placeholder="agent@example.com" autoComplete="off" />{beneficiarySuggestions.length > 0 ? <div className="max-h-40 overflow-auto rounded-md border bg-background text-xs">{beneficiarySuggestions.map((suggestion, index) => <button type="button" key={suggestion.id} onClick={() => chooseBeneficiary(suggestion)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted ${index === highlightedIndex ? "bg-muted" : ""}`}><span className="flex min-w-0 items-center gap-2"><Avatar className="h-6 w-6"><AvatarFallback>{(suggestion.name || suggestion.email).slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0 truncate">{suggestion.name || suggestion.email}<span className="ml-1 text-muted-foreground">{suggestion.name ? suggestion.email : ""}</span></span></span><span className="shrink-0 text-[10px] uppercase text-muted-foreground">{suggestion.role}</span></button>)}</div> : null}{searchingBeneficiaries ? <p className="text-[11px] text-muted-foreground">Searching...</p> : null}</div>{selectedBeneficiary ? <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs"><span className="truncate font-medium">{selectedBeneficiary.email}</span><span className="uppercase text-[10px] text-muted-foreground">{selectedBeneficiary.role}</span></div> : null}<div className="space-y-1.5"><label htmlFor="beneficiary-amount" className="block text-xs font-medium">Amount (GHS)</label><Input id="beneficiary-amount" type="number" min={1} step="0.01" inputMode="decimal" value={beneficiaryAmount} onChange={(event: ChangeEvent<HTMLInputElement>) => setBeneficiaryAmount(event.target.value)} placeholder="e.g. 100.00" /></div><Button type="submit" disabled={savingManual}>{savingManual ? "Confirming..." : "Credit wallet"}</Button></form></CardContent></Card>
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg"><CardHeader className="border-b border-border/70 bg-muted/20 pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" />Wallet activity</CardTitle><CardDescription className="text-xs">Your wallet movements and team transfers.</CardDescription></div><Button variant="outline" size="sm" onClick={() => { void loadWallet(); void loadActivities() }}><RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh</Button></div></CardHeader><CardContent className="space-y-3 p-4"><details className="rounded-md border border-border p-3 text-xs"><summary className="cursor-pointer font-medium">Filter activity</summary><div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_160px]"><Input aria-label="Search wallet activity" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)} placeholder="Search user, email or method" /><select aria-label="Activity method" value={activityMethod} onChange={(event) => setActivityMethod(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3"><option value="">All methods</option><option value="manual">Manual</option><option value="paystack">Paystack</option></select><select aria-label="Activity status" value={activityStatus} onChange={(event) => setActivityStatus(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3"><option value="">All status</option><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option></select></div></details>{activityError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-xs"><span>{activityError}</span><Button size="sm" variant="outline" onClick={() => void loadActivities()}>Try again</Button></div> : null}{activityLoading ? <p role="status" className="rounded-lg border border-border p-6 text-sm text-muted-foreground">Loading wallet activity...</p> : activities.length === 0 ? <EmptyState icon={WalletCards} title="No wallet activity yet" description="Top-ups, team credits, and wallet-backed orders will appear here." className="py-6" /> : <><div className="grid gap-3 xl:hidden">{activities.map((activity) => <div key={activity.id} className="rounded-lg border border-border bg-background/50 p-3 text-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-foreground">{activity.user?.email || "Your wallet"}</p><p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()} · {activity.method}</p></div><Badge variant={activity.status === "success" ? "secondary" : activity.status === "failed" ? "destructive" : "outline"} className={statusBadgeClass(activity.status)}>{activity.status}</Badge></div><p className={`mt-3 font-semibold ${activity.amount < 0 ? "text-destructive" : "text-success"}`}>{formatGhanaCedis(activity.amount)}</p></div>)}</div><div className="ops-table-surface table-scroll hidden rounded-lg xl:block"><Table className="min-w-[840px] text-xs"><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead>Performed by</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{activities.map((activity) => <TableRow key={activity.id}><TableCell className="whitespace-nowrap">{activity.user?.email || "Your wallet"}</TableCell><TableCell className="whitespace-nowrap">{new Date(activity.createdAt).toLocaleString()}</TableCell><TableCell className="uppercase">{activity.method}</TableCell><TableCell><Badge variant={activity.status === "success" ? "secondary" : activity.status === "failed" ? "destructive" : "outline"} className={statusBadgeClass(activity.status)}>{activity.status}</Badge></TableCell><TableCell>{activity.performedByEmail || "System"}</TableCell><TableCell className={`whitespace-nowrap text-right font-semibold ${activity.amount < 0 ? "text-destructive" : "text-success"}`}>{formatGhanaCedis(activity.amount)}</TableCell></TableRow>)}</TableBody></Table></div></>}
      </CardContent></Card>
    </div>
  )
}
