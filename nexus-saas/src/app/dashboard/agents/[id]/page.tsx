"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Copy, ArrowLeft, BadgePercent, MoreVertical, Activity, CircleDollarSign, UserCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MetricCard } from "@/components/ui/metric-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Agent {
  id: string
  name: string
  createdAt: string
  active?: boolean
  totalOrders?: number
  totalRevenue?: number
  totalProfit?: number
  estimatedCommission?: number
  commissionPercent?: number
}

interface Product {
  id: string
  name: string
  provider: string
  category: string
  price: number
  basePrice?: number
}

interface AgentPriceRow {
  productId: string
  price: number
}

function marginAmount(sellingPrice: number, costPrice: number) {
  return Math.max(sellingPrice - costPrice, 0)
}

function marginPercent(sellingPrice: number, costPrice: number) {
  if (sellingPrice <= 0) return 0
  return (marginAmount(sellingPrice, costPrice) / sellingPrice) * 100
}

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const { toast } = useToast()
  const router = useRouter()
  const agentId = params.id

  const [agent, setAgent] = useState<Agent | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [agentPrices, setAgentPrices] = useState<Record<string, number>>({})
  const [agentStorePath, setAgentStorePath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingPrices, setSavingPrices] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [editNameInput, setEditNameInput] = useState("")
  const [editCommissionInput, setEditCommissionInput] = useState<string>("")
  const [selectedNetwork, setSelectedNetwork] = useState<string>("ALL")

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, productsRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/products"),
        ])
        if (!agentsRes.ok) throw new Error("Failed to load agents")
        if (!productsRes.ok) throw new Error("Failed to load products")

        const responseData = await agentsRes.json()
        const agentsData: Agent[] = responseData.data || responseData || []
        const found = agentsData.find((a) => a.id === agentId) || null
        if (!found) {
          toast({ variant: "destructive", title: "Not found", description: "Agent could not be found." })
          router.push("/dashboard/agents")
          return
        }
        setAgent(found)
        const linkRes = await fetch(`/api/storefront-links/agent/${agentId}`)
        if (linkRes.ok) {
          const linkData = await linkRes.json()
          const path = linkData?.data?.path as string | undefined
          if (path) setAgentStorePath(path)
        }

        const productsResponse = await productsRes.json()
        const productsData: Product[] = productsResponse.data || productsResponse || []
        setProducts(productsData)
      } catch (err: any) {
        toast({
          variant: "destructive",
          title: "Error",
          description: err?.message || "Failed to load agent details.",
        })
      }
    }
    load()
  }, [agentId, router, toast])

  useEffect(() => {
    async function loadPrices() {
      if (!agentId) return
      const res = await fetch(`/api/agent-prices?agentId=${agentId}`)
      if (!res.ok) return
      const response = await res.json()
      const data = (response.data || []) as AgentPriceRow[]
      const map: Record<string, number> = {}
      data.forEach((p: AgentPriceRow) => {
        map[p.productId] = p.price
      })
      setAgentPrices(map)
    }
    loadPrices()
  }, [agentId])

  const isActive = agent?.active !== false

  const handleToggleActive = async () => {
    if (!agent) return
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: agent.name, active: !isActive }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setAgent((prev) => (prev ? { ...prev, ...updated } : updated))
      toast({ title: !isActive ? "Agent activated" : "Agent deactivated" })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not update agent status" })
    } finally {
      setLoading(false)
    }
  }

  const savePrice = async (productId: string, price: number) => {
    const product = products.find((item) => item.id === productId)
    const base = product ? product.basePrice ?? product.price : 0
    if (price < base) {
      toast({
        variant: "destructive",
        title: "Price below cost",
        description: `Agent price must be at least ${formatGhanaCedis(base)}.`,
      })
      return
    }

    setSavingPrices(true)
    try {
      const res = await fetch("/api/agent-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, productId, price }),
      })
      if (!res.ok) throw new Error()
      setAgentPrices((prev) => ({ ...prev, [productId]: price }))
      toast({ title: "Saved price override" })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save price" })
    } finally {
      setSavingPrices(false)
    }
  }

  const stats = useMemo(() => {
    if (!agent) {
      return { orders: 0, revenue: 0, commissionPercent: 0, estimatedCommission: 0 }
    }
    return {
      orders: agent.totalOrders ?? 0,
      revenue: agent.totalRevenue ?? 0,
      commissionPercent: agent.commissionPercent ?? 0,
      estimatedCommission: agent.estimatedCommission ?? 0,
    }
  }, [agent])

  const networkOptions = useMemo(() => {
    const networks = Array.from(new Set(products.map((product) => product.provider?.trim().toUpperCase()).filter(Boolean)))
    return networks.sort((a, b) => a.localeCompare(b))
  }, [products])

  const filteredProducts = useMemo(() => {
    if (selectedNetwork === "ALL") return products
    return products.filter((product) => (product.provider || "").trim().toUpperCase() === selectedNetwork)
  }, [products, selectedNetwork])

  const pricingSummary = useMemo(() => {
    const configuredProducts = products.filter((product) => agentPrices[product.id] !== undefined)
    const margins = products.map((product) => {
      const cost = product.basePrice ?? product.price
      const sellingPrice = agentPrices[product.id] ?? product.price
      return marginAmount(sellingPrice, cost)
    })
    const averageMargin = margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0
    return {
      configured: configuredProducts.length,
      total: products.length,
      averageMargin,
    }
  }, [agentPrices, products])

  useEffect(() => {
    if (selectedNetwork !== "ALL" && !networkOptions.includes(selectedNetwork)) {
      setSelectedNetwork("ALL")
    }
  }, [networkOptions, selectedNetwork])

  if (!agent) {
    return (
      <div className="portal-page flex-1">
        <p className="text-sm text-muted-foreground">Loading agent details...</p>
      </div>
    )
  }

  return (
    <div className="portal-page flex-1 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/agents")}>
            <ArrowLeft className="mr-1 h-3 w-3" /> Back
          </Button>
          <div className="space-y-0.5">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">{agent.name}</h1>
            <p className="text-xs text-muted-foreground">
              Manage this agent&apos;s status, commissions and assigned buy pricing.
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 text-xs">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                setEditNameInput(agent.name)
                setEditCommissionInput(
                  agent.commissionPercent !== undefined ? String(agent.commissionPercent) : "0",
                )
                setEditModalOpen(true)
              }}
            >
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                handleToggleActive()
              }}
            >
              {isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault()
                setDeleteModalOpen(true)
              }}
            >
              Delete agent
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Created {new Date(agent.createdAt).toLocaleDateString()}</span>
        <span>
          {stats.orders} orders | {formatGhanaCedis(stats.revenue)} revenue
        </span>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        <Link
          href={`/dashboard/customers?agentId=${agent.id}`}
          className="underline underline-offset-2 hover:text-primary"
        >
          View customers who bought via this agent storefront
        </Link>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Status"
          value={isActive ? "Active" : "Inactive"}
          description={
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleActive}
              disabled={loading}
              className="mt-1 h-8 text-[11px]"
            >
              {isActive ? "Deactivate" : "Activate"}
            </Button>
          }
          icon={UserCheck}
          tone={isActive ? "success" : "destructive"}
        />
        <MetricCard label="Orders" value={stats.orders} description="Completed orders from this agent." icon={Activity} tone="info" />
        <MetricCard label="Revenue" value={formatGhanaCedis(stats.revenue)} description="Gross revenue generated by this agent." icon={CircleDollarSign} tone="success" />
        <MetricCard
          label="Commission & Payout"
          value={`${stats.commissionPercent.toFixed(1)}%`}
          description={`Estimated payout: ${formatGhanaCedis(stats.estimatedCommission)}.`}
          icon={BadgePercent}
          tone="primary"
        />
      </div>

      {agentStorePath && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Customer storefront link</CardTitle>
            <CardDescription className="text-xs">
              Share this link only with the agent&apos;s customers so they can buy bundles directly. The agent logs into their dashboard via your main login page, not this link.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-foreground">
                {typeof window !== "undefined"
                  ? `${window.location.origin}${agentStorePath}`
                  : agentStorePath}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={async () => {
                try {
                  const origin = typeof window !== "undefined" ? window.location.origin : ""
                  const url = `${origin}${agentStorePath}`
                  await navigator.clipboard.writeText(url)
                  toast({ title: "Copied", description: "Agent shop link copied." })
                } catch {
                  toast({ variant: "destructive", title: "Copy failed", description: "Could not copy link." })
                }
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">How agent pricing works</CardTitle>
            <CardDescription className="text-xs">
              Base cost is your source cost. Agent buy price is what this agent pays when buying inside their dashboard. The difference is your margin on agent dashboard sales.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Configured prices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">
              {pricingSummary.configured}/{pricingSummary.total}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Products with agent-specific overrides.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Average margin</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatGhanaCedis(pricingSummary.averageMargin)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Estimated per-order margin across active products.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Pricing overrides</CardTitle>
          <CardDescription className="text-xs">
            Set this agent&apos;s dashboard buy price. The agent sets their own customer storefront prices in the agent portal.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <label className="text-muted-foreground" htmlFor="network-filter">
              Network filter
            </label>
            <select
              id="network-filter"
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="ALL">All networks</option>
              {networkOptions.map((network) => (
                <option key={network} value={network}>
                  {network}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">
              Showing {selectedNetwork === "ALL" ? "all networks" : selectedNetwork}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 && (
            <p className="text-sm text-muted-foreground">No products yet. Add products before configuring agent prices.</p>
          )}
          {products.length > 0 && filteredProducts.length === 0 && (
            <p className="text-sm text-muted-foreground">No products match the selected network.</p>
          )}
          {filteredProducts.length > 0 && (
            <>
            <div className="grid gap-3 xl:hidden lg:grid-cols-2">
              {filteredProducts.map((product) => {
                const base = product.basePrice ?? product.price
                const current = agentPrices[product.id] ?? product.price
                const profit = marginAmount(current, base)
                return (
                  <div key={product.id} className="rounded-md border bg-background p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{product.name}</p>
                        <p className="text-xs uppercase text-muted-foreground">{product.provider}</p>
                      </div>
                      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {product.category}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground">{formatGhanaCedis(base)}</p>
                        <p>Base cost</p>
                      </div>
                      <div>
                        <Input
                          type="number"
                          step="0.01"
                          min={base}
                          defaultValue={current}
                          className="h-9 text-right text-xs"
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value)
                            if (Number.isNaN(val)) return
                            savePrice(product.id, val)
                          }}
                        />
                        <p className="mt-1 text-right">Agent buy price</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Expected profit</span>
                        <span className="font-semibold text-foreground">{formatGhanaCedis(profit)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Margin</span>
                        <span className="font-medium text-primary">{marginPercent(current, base).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="ops-table-surface table-scroll hidden rounded-lg xl:block">
            <Table className="min-w-[720px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Base cost</TableHead>
                  <TableHead>Agent buy price</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead className="text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const base = product.basePrice ?? product.price
                  const current = agentPrices[product.id] ?? product.price
                  const profit = marginAmount(current, base)
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {product.provider}
                        </span>
                      </TableCell>
                      <TableCell>{formatGhanaCedis(base)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min={base}
                          defaultValue={current}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value)
                            if (Number.isNaN(val)) return
                            savePrice(product.id, val)
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium">{formatGhanaCedis(profit)}</p>
                          <p className="text-[11px] text-muted-foreground">{marginPercent(current, base).toFixed(1)}% margin</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-[11px] text-muted-foreground">
                        Blur to save
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
            </>
          )}
          {savingPrices && <p className="mt-2 text-xs text-muted-foreground">Saving overrides...</p>}
        </CardContent>
      </Card>

      {/* Edit agent modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit agent</DialogTitle>
            <DialogDescription>Update the agent&apos;s display name and commission.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="mb-1 font-medium">Name</p>
              <Input value={editNameInput} onChange={(e) => setEditNameInput(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 font-medium">Commission (%)</p>
              <Input
                type="number"
                min={0}
                max={100}
                value={editCommissionInput}
                onChange={(e) => setEditCommissionInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!agent) return
                  const newName = editNameInput.trim()
                  if (!newName) {
                    return toast({
                      variant: "destructive",
                      title: "Validation",
                      description: "Name is required",
                    })
                  }
                  const commissionRaw = editCommissionInput.trim()
                  const commissionVal = commissionRaw ? Number(commissionRaw) : 0
                  if (Number.isNaN(commissionVal) || commissionVal < 0 || commissionVal > 100) {
                    return toast({
                      variant: "destructive",
                      title: "Validation",
                      description: "Commission must be between 0 and 100.",
                    })
                  }
                  setLoading(true)
                  try {
                    const res = await fetch(`/api/agents/${agent.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newName, commissionPercent: commissionVal }),
                    })
                    if (!res.ok) throw new Error()
                    const updated = await res.json()
                    setAgent(updated)
                    setEditModalOpen(false)
                    toast({ title: "Agent updated" })
                  } catch {
                    toast({ variant: "destructive", title: "Error", description: "Could not update agent" })
                  } finally {
                    setLoading(false)
                  }
                }}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
          <DialogClose />
        </DialogContent>
      </Dialog>

      {/* Delete agent modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              This will remove the agent and unlink their storefront. You can&apos;t undo this.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 text-sm">
            <p>
              Are you sure you want to delete <strong>{agent.name}</strong>?
            </p>
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setLoading(true)
                  try {
                    const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" })
                    if (!res.ok) throw new Error()
                    toast({ title: "Agent deleted" })
                    router.push("/dashboard/agents")
                  } catch {
                    toast({ variant: "destructive", title: "Error", description: "Could not delete agent" })
                  } finally {
                    setLoading(false)
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </DialogFooter>
          <DialogClose />
        </DialogContent>
      </Dialog>
    </div>
  )
}
