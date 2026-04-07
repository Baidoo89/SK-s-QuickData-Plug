"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Copy, ArrowLeft, BadgePercent, MoreVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const { toast } = useToast()
  const router = useRouter()
  const agentId = params.id

  const [agent, setAgent] = useState<Agent | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [agentPrices, setAgentPrices] = useState<Record<string, number>>({})
  const [storeSlug, setStoreSlug] = useState<string | null>(null)
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
        const [agentsRes, productsRes, tenantRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/products"),
          fetch("/api/tenants/current"),
        ])
        if (!agentsRes.ok) throw new Error("Failed to load agents")
        if (!productsRes.ok) throw new Error("Failed to load products")

        if (tenantRes.ok) {
          const tenantData = await tenantRes.json()
          const slug = tenantData?.tenant?.slug as string | undefined
          if (slug) setStoreSlug(slug)
        }

        const responseData = await agentsRes.json()
        const agentsData: Agent[] = responseData.data || responseData || []
        const found = agentsData.find((a) => a.id === agentId) || null
        if (!found) {
          toast({ variant: "destructive", title: "Not found", description: "Agent could not be found." })
          router.push("/dashboard/agents")
          return
        }
        setAgent(found)

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

  useEffect(() => {
    if (selectedNetwork !== "ALL" && !networkOptions.includes(selectedNetwork)) {
      setSelectedNetwork("ALL")
    }
  }, [networkOptions, selectedNetwork])

  if (!agent) {
    return (
      <div className="flex-1 px-4 py-6 md:p-8 md:pt-6">
        <p className="text-sm text-muted-foreground">Loading agent details…</p>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 px-4 py-6 md:p-8 md:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/agents")}>
            <ArrowLeft className="mr-1 h-3 w-3" /> Back
          </Button>
          <div className="space-y-0.5">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">{agent.name}</h1>
            <p className="text-xs text-muted-foreground">
              Manage this agent&apos;s status, commissions and storefront pricing.
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
          {stats.orders} orders · {formatGhanaCedis(stats.revenue)} revenue
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-2">
            <span
              className={[
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
              ].join(" ")}
            >
              {isActive ? "Active" : "Inactive"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleActive}
              disabled={loading}
              className="text-[11px]"
            >
              {isActive ? "Deactivate" : "Activate"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.orders}</p>
            <p className="mt-1 text-xs text-muted-foreground">Completed orders from this agent.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatGhanaCedis(stats.revenue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Gross revenue generated by this agent.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <BadgePercent className="h-3 w-3" /> Commission & payout
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {stats.commissionPercent.toFixed(1)}% · {formatGhanaCedis(stats.estimatedCommission)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Current commission rate and estimated payout.</p>
          </CardContent>
        </Card>
      </div>

      {storeSlug && (
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
                  ? `${window.location.origin}/store/${storeSlug}/agent/${agent.id}`
                  : `/store/${storeSlug}/agent/${agent.id}`}
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
                  const url = `${origin}/store/${storeSlug}/agent/${agent.id}`
                  await navigator.clipboard.writeText(url)
                  toast({ title: "Copied", description: "Agent storefront link copied." })
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

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Pricing overrides</CardTitle>
          <CardDescription className="text-xs">
            Set custom prices for this agent. Filter by network to keep the table readable.
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
        <CardContent className="overflow-x-auto">
          {products.length === 0 && (
            <p className="text-sm text-muted-foreground">No products yet. Add products before configuring agent prices.</p>
          )}
          {products.length > 0 && filteredProducts.length === 0 && (
            <p className="text-sm text-muted-foreground">No products match the selected network.</p>
          )}
          {filteredProducts.length > 0 && (
            <Table className="min-w-[640px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Base price</TableHead>
                  <TableHead>Agent price</TableHead>
                  <TableHead className="text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const base = product.basePrice ?? product.price
                  const current = agentPrices[product.id]
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
                          defaultValue={current ?? base}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value)
                            if (Number.isNaN(val)) return
                            savePrice(product.id, val)
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right text-[11px] text-muted-foreground">
                        Blur to save
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          {savingPrices && <p className="mt-2 text-xs text-muted-foreground">Saving overrides…</p>}
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
