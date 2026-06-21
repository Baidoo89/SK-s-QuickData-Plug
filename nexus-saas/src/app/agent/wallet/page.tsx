"use client"

import { useEffect, useState, ChangeEvent, FormEvent } from "react"
import { useSearchParams } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MetricCard } from "@/components/ui/metric-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"
import { Activity, Clock3, WalletCards } from "lucide-react"

interface OrdersSummary {
  totalOrders: number
  totalNumbers: number
  processing: number
  completed: number
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

interface BeneficiarySuggestion {
  id: string
  name: string | null
  email: string
  role: string | null
  avatarUrl?: string | null
  balance?: number | null
}

interface WalletActivity {
  id: string
  createdAt: string
  method: string
  status: string
  amount: number
  performedByEmail: string | null
  performedByRole: string | null
  user?: {
    id: string | null
    name: string | null
    email: string | null
    role: string | null
    avatarUrl: string | null
  }
}

export default function AgentWalletPage() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [summary, setSummary] = useState<OrdersSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [balance, setBalance] = useState(0)
  const [topups, setTopups] = useState<WalletTopup[]>([])
  const [activities, setActivities] = useState<WalletActivity[]>([])
  const [activityFilter, setActivityFilter] = useState("")
  const [activityMethod, setActivityMethod] = useState("")
  const [activityStatus, setActivityStatus] = useState("")
  const [topupAmount, setTopupAmount] = useState("")
  const [savingTopup, setSavingTopup] = useState(false)
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("")
  const [beneficiaryAmount, setBeneficiaryAmount] = useState("")
  const [savingManual, setSavingManual] = useState(false)
  const [beneficiarySuggestions, setBeneficiarySuggestions] = useState<BeneficiarySuggestion[]>([])
  const [searchingBeneficiaries, setSearchingBeneficiaries] = useState(false)
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiarySuggestion | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch("/api/agent/orders")
        if (!res.ok) return
        const data = await res.json() as { summary?: OrdersSummary }
        if (data.summary) setSummary(data.summary)
      } catch {
        // ignore for now
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    async function loadWallet() {
      try {
        const res = await fetch("/api/agent/wallet")
        if (!res.ok) return
        const payload = await res.json() as {
          balance?: number
          topups?: WalletTopup[]
          data?: { balance?: number; topups?: WalletTopup[] }
        }
        const walletData = payload?.data ?? payload
        if (typeof walletData.balance === "number") setBalance(walletData.balance)
        if (Array.isArray(walletData.topups)) setTopups(walletData.topups)
      } catch {
        // ignore
      }
    }
    loadWallet()
  }, [])

  useEffect(() => {
    const status = searchParams.get("walletTopup")
    if (!status) return

    if (status === "success") {
      toast({ title: "Top up successful", description: "Your wallet has been credited. Paystack fees were included at checkout." })
      return
    }

    if (status === "failed") {
      toast({ variant: "destructive", title: "Top up failed", description: "Paystack verification failed. Please try again or use manual top-up." })
    }
  }, [searchParams, toast])

  useEffect(() => {
    async function loadActivities() {
      try {
        const params = new URLSearchParams()
        params.set("limit", "100")
        if (activityFilter.trim()) params.set("q", activityFilter.trim())
        if (activityMethod) params.set("method", activityMethod)
        if (activityStatus) params.set("status", activityStatus)

        const res = await fetch(`/api/wallet/transactions?${params.toString()}`)
        if (!res.ok) return
        const payload = await res.json().catch(() => null) as {
          results?: WalletActivity[]
          data?: { results?: WalletActivity[] }
        } | null
        const results = payload?.data?.results ?? payload?.results
        if (Array.isArray(results)) {
          setActivities(results)
        }
      } catch {
        // ignore
      }
    }
    loadActivities()
  }, [activityFilter, activityMethod, activityStatus])

  const estimatedCommission = summary ? summary.totalNumbers * 1 : 0

  function statusBadgeClass(status: string) {
    if (status === "success") return "status-success border"
    if (status === "pending") return "status-warning border"
    if (status === "failed") return ""
    return "status-info border"
  }

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Wallet & Activity</h1>
        <p className="text-sm text-muted-foreground">
          Track your order wallet, reseller credits, and wallet activity.
        </p>
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <MetricCard
          label="Wallet Balance"
          value={formatGhanaCedis(balance)}
          description="Available balance for your own dashboard orders."
          icon={WalletCards}
          tone="success"
        />
        <MetricCard
          label="Estimated Commissions"
          value={formatGhanaCedis(estimatedCommission)}
          description="Estimated from successful fulfilled numbers."
          icon={Activity}
          tone="primary"
        />
        <MetricCard
          label="Processing"
          value={`${summary?.processing ?? 0}/${summary?.completed ?? 0}`}
          description="Processing vs completed orders."
          icon={Clock3}
          tone={(summary?.processing ?? 0) > 0 ? "warning" : "info"}
        />
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-1 lg:grid-cols-2">
        <Card id="paystack-top-up" className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="text-sm font-semibold">Top Up Your Wallet</CardTitle>
            <CardDescription className="text-xs">
              Paystack fees are added at checkout. Your wallet receives the amount you enter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault()
                const amountNumber = Number(topupAmount)
                if (!amountNumber || amountNumber <= 0) {
                  return toast({
                    variant: "destructive",
                    title: "Validation",
                    description: "Enter a valid wallet amount.",
                  })
                }

                setSavingTopup(true)
                try {
                  const res = await fetch("/api/wallet/paystack/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: amountNumber, returnPath: "/agent/wallet" }),
                  })
                  const payload = await res.json().catch(() => null as any)
                  const authorizationUrl = payload?.data?.authorizationUrl ?? payload?.authorizationUrl
                  const fee = payload?.data?.paystackFee
                  const checkoutAmount = payload?.data?.checkoutAmount
                  const message = payload?.error?.message || payload?.message || "Could not start Paystack top-up."
                  if (!res.ok || !authorizationUrl) {
                    return toast({ variant: "destructive", title: "Top up failed", description: message })
                  }

                  if (typeof fee === "number" && typeof checkoutAmount === "number") {
                    toast({ title: "Redirecting to Paystack", description: `You will pay ${formatGhanaCedis(checkoutAmount)} including ${formatGhanaCedis(fee)} fee.` })
                  }

                  setTopupAmount("")
                  window.location.href = authorizationUrl as string
                } catch {
                  toast({ variant: "destructive", title: "Network error", description: "Could not reach Paystack service." })
                } finally {
                  setSavingTopup(false)
                }
              }}
              className="space-y-3"
            >
              <Input
                type="number"
                min={1}
                step="0.01"
                value={topupAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTopupAmount(e.target.value)}
                placeholder="Amount to credit wallet, e.g. 100"
                className="text-xs"
              />
              <Button type="submit" disabled={savingTopup} className="w-full sm:w-auto text-xs">
                {savingTopup ? "Redirecting..." : "Top up with Paystack"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Manual top-up from the business owner is cheaper because Paystack fees do not apply.
              </p>
            </form>
          </CardContent>
        </Card>
        <Card id="top-up" className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="text-sm font-semibold">Credit Reseller Wallet</CardTitle>
            <CardDescription className="text-xs">
              Credit only resellers linked to your agent account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault()
                const amountNumber = Number(beneficiaryAmount)
                if (!beneficiaryEmail.trim() || !amountNumber || amountNumber <= 0) {
                  return toast({
                    variant: "destructive",
                    title: "Validation",
                    description: "Enter a beneficiary email and a valid amount.",
                  })
                }
                setSavingManual(true)
                try {
                  const res = await fetch("/api/agent/wallet", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      method: "manual",
                      beneficiaryEmail: beneficiaryEmail.trim(),
                      amount: amountNumber,
                    }),
                  })
                  const data = await res.json().catch(() => null)
                  if (!res.ok) {
                    const message = data?.error?.message || data?.message || "Wallet credit failed."
                    return toast({ variant: "destructive", title: "Error", description: message })
                  }
                  if (typeof data.balance === "number") setBalance(data.balance)
                  if (data.topup) setTopups((prev) => [data.topup as WalletTopup, ...prev])
                  setBeneficiaryEmail("")
                  setBeneficiaryAmount("")
                  setSelectedBeneficiary(null)
                  setHighlightedIndex(-1)
                  toast({ title: "Reseller wallet credited", description: "The credit has been saved to the selected reseller wallet." })
                } catch {
                  toast({ variant: "destructive", title: "Network error", description: "Could not reach wallet service." })
                } finally {
                  setSavingManual(false)
                }
              }}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Beneficiary email</p>
                <Input
                  type="email"
                  name="beneficiaryEmail"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={beneficiaryEmail}
                  onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value
                    setBeneficiaryEmail(value)
                    setBeneficiarySuggestions([])
                    setSelectedBeneficiary(null)
                    setHighlightedIndex(-1)
                    const trimmed = value.trim()
                    if (trimmed.length < 2) return
                    setSearchingBeneficiaries(true)
                    try {
                      const res = await fetch(`/api/agent/wallet/beneficiaries?q=${encodeURIComponent(trimmed)}`)
                      if (!res.ok) return
                      const payload = await res.json().catch(() => null) as {
                        results?: BeneficiarySuggestion[]
                        data?: { results?: BeneficiarySuggestion[] }
                      } | null
                      const results = payload?.data?.results ?? payload?.results
                      if (Array.isArray(results)) {
                        setBeneficiarySuggestions(results)
                      }
                    } catch {
                      // ignore search errors
                    } finally {
                      setSearchingBeneficiaries(false)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (beneficiarySuggestions.length === 0) return

                    if (e.key === "ArrowDown") {
                      e.preventDefault()
                      setHighlightedIndex((prev) => Math.min(prev + 1, beneficiarySuggestions.length - 1))
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault()
                      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
                    } else if (e.key === "Enter" && highlightedIndex >= 0) {
                      e.preventDefault()
                      const selected = beneficiarySuggestions[highlightedIndex]
                      setBeneficiaryEmail(selected.email)
                      setSelectedBeneficiary(selected)
                      setBeneficiarySuggestions([])
                      setHighlightedIndex(-1)
                    }
                  }}
                  placeholder="reseller@example.com"
                  className="text-xs"
                />
                {beneficiarySuggestions.length > 0 && (
                  <div className="mt-1 rounded-md border bg-background text-[11px] max-h-40 overflow-auto">
                    {beneficiarySuggestions.map((s, idx) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left hover:bg-muted ${highlightedIndex === idx ? "bg-muted" : ""}`}
                        onClick={() => {
                          setBeneficiaryEmail(s.email)
                          setSelectedBeneficiary(s)
                          setBeneficiarySuggestions([])
                          setHighlightedIndex(-1)
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {s.avatarUrl ? (
                              <img src={s.avatarUrl} alt={s.name || s.email} className="h-6 w-6 rounded-full" />
                            ) : (
                              <AvatarFallback>{s.name ? s.name[0] : s.email[0]}</AvatarFallback>
                            )}
                          </Avatar>
                          <span>
                            {s.email}
                            {s.name && <span className="ml-1 text-muted-foreground">({s.name})</span>}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {s.role && (
                            <span className="uppercase text-[10px] text-muted-foreground">{s.role}</span>
                          )}
                          {typeof s.balance === "number" && (
                            <span className="text-[11px] font-semibold text-foreground">{formatGhanaCedis(s.balance)}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {searchingBeneficiaries && beneficiaryEmail.trim().length >= 2 && beneficiarySuggestions.length === 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Searching linked resellers...</p>
                )}
                {!searchingBeneficiaries && beneficiaryEmail.trim().length >= 2 && beneficiarySuggestions.length === 0 && !selectedBeneficiary && (
                  <p className="mt-1 text-[11px] text-muted-foreground">No matching users found.</p>
                )}
                {selectedBeneficiary && (
                  <div className="mt-2 flex items-center gap-2 rounded border bg-muted/40 px-2 py-1">
                    <Avatar className="h-6 w-6">
                      {selectedBeneficiary.avatarUrl ? (
                        <img src={selectedBeneficiary.avatarUrl} alt={selectedBeneficiary.name || selectedBeneficiary.email} className="h-6 w-6 rounded-full" />
                      ) : (
                        <AvatarFallback>
                          {selectedBeneficiary.name ? selectedBeneficiary.name[0] : selectedBeneficiary.email[0]}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="truncate">{selectedBeneficiary.email}</span>
                    {selectedBeneficiary.role && (
                      <span className="uppercase text-[10px] text-muted-foreground">{selectedBeneficiary.role}</span>
                    )}
                    {typeof selectedBeneficiary.balance === "number" && (
                      <span className="ml-auto text-[11px] font-semibold">{formatGhanaCedis(selectedBeneficiary.balance)}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Amount (GHS)</p>
                <Input
                  type="number"
                  min={1}
                  value={beneficiaryAmount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setBeneficiaryAmount(e.target.value)}
                  placeholder="e.g. 100"
                  className="text-xs"
                />
              </div>
              <Button
                type="submit"
                disabled={savingManual}
                className="w-full sm:w-auto text-xs"
              >
                {savingManual ? "Confirming..." : "Confirm manual credit"}
              </Button>
                <p className="text-[11px] text-muted-foreground">
                Your own wallet can be topped up with Paystack above or credited by the business owner. This form only credits linked resellers.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card id="transactions" className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle className="text-sm font-semibold">Transactions & activity</CardTitle>
          <CardDescription className="text-xs">
              This appears directly under top up so the flow stays simple and readable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-muted-foreground">
            This section shows confirmed wallet activity, manual credits, Paystack top-ups, and order debits linked to your agent account.
          </p>
          <p className="text-xs">
            Current wallet balance: <span className="font-semibold">{formatGhanaCedis(balance)}</span>
          </p>
          {topups.length > 0 && (
            <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
              <p className="font-semibold text-foreground">Recent Top-Ups</p>
              {topups.slice(0, 5).map((t) => (
                <div key={t.id} className="flex flex-col gap-0.5 rounded-lg border border-border/70 bg-background/80 px-2 py-1 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="truncate">
                    {t.method === "paystack" ? "Paystack" : "Manual"} | {t.beneficiaryEmail}
                  </span>
                  <span className="font-medium text-foreground">{formatGhanaCedis(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-foreground">Wallet logs & activities</p>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <Input
                type="text"
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                placeholder="Search user/email/method/status"
                className="h-8 w-full text-xs lg:max-w-md"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={activityMethod}
                  onChange={(e) => setActivityMethod(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">All methods</option>
                  <option value="manual">Manual</option>
                  <option value="paystack">Paystack</option>
                </select>
                <select
                  value={activityStatus}
                  onChange={(e) => setActivityStatus(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">All status</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            {activities.length === 0 ? (
              <EmptyState
                icon={WalletCards}
                title="No wallet activity yet"
                description="Top-ups, reseller credits, and VTU debits will appear here after your first wallet movement."
                secondaryAction={{ label: "Manage Resellers", href: "/agent/resellers" }}
                className="py-6"
              />
            ) : (
              <div className="ops-table-surface table-scroll rounded-lg">
                <Table className="min-w-[920px] text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">User</TableHead>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="whitespace-nowrap">Method</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Performed By</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Amount (GHS)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell className="whitespace-nowrap">
                          {activity.user?.email || activity.user?.name ? (
                            <span>
                              {activity.user?.name || activity.user?.email}
                              {activity.user?.role ? (
                                <span className="ml-1 text-[11px] text-muted-foreground">({activity.user.role})</span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{new Date(activity.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="uppercase">{activity.method}</TableCell>
                        <TableCell>
                          <Badge
                            variant={activity.status === "success" ? "secondary" : activity.status === "failed" ? "destructive" : "outline"}
                            className={statusBadgeClass(activity.status)}
                          >
                            {activity.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {activity.performedByEmail || "System"}
                          {activity.performedByRole ? (
                            <span className="ml-1 text-[11px] text-muted-foreground">({activity.performedByRole})</span>
                          ) : null}
                        </TableCell>
                        <TableCell className={`whitespace-nowrap text-right font-semibold ${activity.amount < 0 ? "text-destructive" : "text-primary"}`}>
                          {formatGhanaCedis(activity.amount)}
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

    </div>
  )
}

