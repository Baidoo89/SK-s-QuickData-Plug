"use client"

import { useEffect, useState } from "react"
import { Activity, Eye, WalletCards } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { formatGhanaCedis } from "@/lib/currency"
import { MetricCard } from "@/components/ui/metric-card"

interface WalletTransaction {
  id: string
  user?: {
    id: string | null
    name: string | null
    email: string | null
    role: string | null
    avatarUrl: string | null
  }
  amount: number
  method: string
  status: string
  createdAt: string
  performedByEmail: string | null
  performedByRole: string | null
}

export default function AdminWalletPage() {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [balance, setBalance] = useState(0)
  const [txFilter, setTxFilter] = useState("")
  const [txType, setTxType] = useState("")
  const [txStatus, setTxStatus] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTransactions() {
      setLoading(true)
      const params = new URLSearchParams()
      if (txFilter) params.set("q", txFilter)
      if (txType) params.set("method", txType)
      if (txStatus) params.set("status", txStatus)
      params.set("limit", "150")

      try {
        const res = await fetch(`/api/wallet/transactions?${params.toString()}`)
        if (!res.ok) return

        const payload = (await res.json().catch(() => null)) as {
          data?: { results?: WalletTransaction[]; balance?: number }
        } | null

        setTransactions(Array.isArray(payload?.data?.results) ? payload.data.results : [])
        setBalance(typeof payload?.data?.balance === "number" ? payload.data.balance : 0)
      } finally {
        setLoading(false)
      }
    }

    loadTransactions()
  }, [txFilter, txType, txStatus])

  const successfulTransactions = transactions.filter((tx) => tx.status === "success").length
  const pendingTransactions = transactions.filter((tx) => tx.status === "pending").length

  function statusBadgeClass(status: string) {
    if (status === "success") return "status-success border"
    if (status === "pending") return "status-warning border"
    if (status === "failed") return ""
    return "status-info border"
  }

  return (
    <div className="portal-page space-y-6">
      <div className="max-w-3xl space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Wallet Activity</h1>
        <p className="text-sm text-muted-foreground">
          Read-only oversight of wallet credits and Paystack top-ups across the platform. Superadmin does not operate tenant customer funds here.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <MetricCard
          label="Recorded Wallet Credits"
          value={formatGhanaCedis(balance)}
          description="Successful transactions in the current oversight scope."
          icon={WalletCards}
          tone="success"
        />
        <MetricCard
          label="Transactions Loaded"
          value={transactions.length}
          description={`${successfulTransactions} successful, ${pendingTransactions} pending.`}
          icon={Activity}
          tone="info"
        />
        <MetricCard
          label="Operating Model"
          value="Oversight"
          description="Subscribers control their own Paystack settlement; this console does not custody tenant revenue."
          icon={Eye}
          tone="muted"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Wallet Transactions</CardTitle>
          <CardDescription className="text-xs">
            Search user, method, performer, or status across recent wallet activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Search</span>
              <Input
                type="text"
                value={txFilter}
                onChange={(event) => setTxFilter(event.target.value)}
                placeholder="User, email, method, status..."
                className="text-xs lg:max-w-sm"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={txType} onChange={(event) => setTxType(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">
                <option value="">All methods</option>
                <option value="manual">Manual</option>
                <option value="paystack">Paystack</option>
              </select>
              <select value={txStatus} onChange={(event) => setTxStatus(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 xl:hidden lg:grid-cols-2">
            {loading ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Loading wallet transactions...</p>
            ) : transactions.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No transactions found.</p>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{tx.user?.name || tx.user?.email || "Unknown"}</p>
                      <p className="break-all text-[11px] text-muted-foreground">{tx.user?.email || "-"}</p>
                    </div>
                    <Badge
                      variant={tx.status === "success" ? "secondary" : tx.status === "failed" ? "destructive" : "outline"}
                      className={statusBadgeClass(tx.status)}
                    >
                      {tx.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatGhanaCedis(tx.amount)}</p>
                      <p>Amount</p>
                    </div>
                    <div>
                      <p className="font-medium uppercase text-foreground">{tx.method}</p>
                      <p>Method</p>
                    </div>
                    <div>
                      <p className="text-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                      <p>Date</p>
                    </div>
                    <div>
                      <p className="truncate text-foreground">{tx.performedByEmail || "-"}</p>
                      <p>Performed by</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="table-scroll hidden rounded-md border bg-background xl:block">
            <Table className="min-w-[860px] text-xs">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Loading wallet transactions...
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {tx.user?.avatarUrl ? (
                              <img src={tx.user.avatarUrl} alt={tx.user.name || tx.user.email || "User"} className="h-6 w-6 rounded-full" />
                            ) : (
                              <AvatarFallback>{tx.user?.name?.[0] || tx.user?.email?.[0] || "U"}</AvatarFallback>
                            )}
                          </Avatar>
                          <div>
                            <p className="font-medium">{tx.user?.name || tx.user?.email || "Unknown"}</p>
                            <p className="text-[11px] text-muted-foreground">{tx.user?.email || "-"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="uppercase">{tx.method}</TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.status === "success" ? "secondary" : tx.status === "failed" ? "destructive" : "outline"}
                          className={statusBadgeClass(tx.status)}
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p>{tx.performedByEmail || "-"}</p>
                        <p className="text-[11px] uppercase text-muted-foreground">{tx.performedByRole || ""}</p>
                      </TableCell>
                      <TableCell>{new Date(tx.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{formatGhanaCedis(tx.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
