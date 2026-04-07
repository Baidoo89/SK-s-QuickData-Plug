"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { ArrowLeft } from "lucide-react"
import { formatGhanaCedis } from "@/lib/currency"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Reseller {
  id: string
  name: string | null
  email: string | null
  active?: boolean
  createdAt: string
}

interface Product {
  id: string
  name: string
  provider: string
  price: number
}

interface ResellerMetrics {
  walletBalance: number
  todaysOrders: number
  monthCompletedTotal: number
  filteredSales: number
  monthProfit?: number
  filteredProfit?: number
  salesRange?: "daily" | "weekly" | "monthly"
}

interface RecentOrder {
  id: string
  phoneNumber: string | null
  status: string
  total: number
  createdAt: string
}

export default function ResellerDetailPage({ params }: { params: { id: string } }) {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const resellerId = params.id
  const selectedSalesRange = (searchParams.get("salesRange") || "daily") as "daily" | "weekly" | "monthly"

  const salesRangeLabel = selectedSalesRange === "weekly"
    ? "Last 7 days"
    : selectedSalesRange === "monthly"
      ? "This month"
      : "Today"

  const [reseller, setReseller] = useState<Reseller | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(true)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<ResellerMetrics | null>(null)
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [resellerPrices, setResellerPrices] = useState<Record<string, number>>({})
  const [savingPrices, setSavingPrices] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)

  // Get unique providers from products
  const providers = Array.from(new Set(products.map((p) => p.provider))).sort()
  const activeProvider = selectedProvider && providers.includes(selectedProvider) ? selectedProvider : providers[0]
  const filteredProducts = activeProvider ? products.filter((p) => p.provider === activeProvider) : products

  const loadDetails = async () => {
    try {
      setLoadingDetails(true)
      setDetailsError(null)

      const query = selectedSalesRange === "daily" ? "" : `?salesRange=${selectedSalesRange}`
      const res = await fetch(`/api/resellers/${resellerId}${query}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        const message = payload?.error?.message || payload?.message || "Reseller not found"
        setDetailsError(message)
        return
      }

      const resellerData = await res.json()
      const payload = resellerData?.data || resellerData
      const resellerRow = payload?.reseller || payload
      setReseller(resellerRow)
      setMetrics(payload?.metrics ?? null)
      setRecentOrders(Array.isArray(payload?.recentOrders) ? payload.recentOrders : [])

      const productsRes = await fetch("/api/products")
      if (productsRes.ok) {
        const productsData = await productsRes.json()
        const rows = Array.isArray(productsData?.data)
          ? productsData.data
          : Array.isArray(productsData)
            ? productsData
            : []
        setProducts(rows)
      }
    } catch (error) {
      console.error("Failed to load:", error)
      setDetailsError("Could not load details")
    } finally {
      setLoadingDetails(false)
    }
  }

  useEffect(() => {
    loadDetails()
  }, [resellerId, selectedSalesRange])

  useEffect(() => {
    async function loadPrices() {
      if (!resellerId) return
      const res = await fetch(`/api/reseller-prices?resellerId=${resellerId}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        const message = payload?.error?.message || payload?.message || "Could not load reseller prices"
        toast({ variant: "destructive", title: "Error", description: message })
        return
      }
      const response = await res.json()
      const data = response.data || []
      const map: Record<string, number> = {}
      data.forEach((p: any) => {
        map[p.productId] = p.price
      })
      setResellerPrices(map)
    }
    loadPrices()
  }, [resellerId])

  const savePrice = async (productId: string, price: number) => {
    setSavingPrices(true)
    try {
      const res = await fetch("/api/reseller-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resellerId, productId, price }),
      })
      if (!res.ok) throw new Error()
      setResellerPrices((prev) => ({ ...prev, [productId]: price }))
      toast({ title: "Saved price override" })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save price" })
    } finally {
      setSavingPrices(false)
    }
  }

  if (loadingDetails) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading reseller details...</p>
      </div>
    )
  }

  if (detailsError || !reseller) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Could not load reseller</CardTitle>
            <CardDescription className="text-xs">{detailsError || "Reseller not found"}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/agent/resellers")}>Back to resellers</Button>
            <Button onClick={loadDetails}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => router.push("/agent/resellers")}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Back
        </Button>
        <div className="space-y-0.5">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">{reseller.name}</h1>
          <p className="text-xs text-muted-foreground">
            Manage this reseller&apos;s pricing, performance, and wallet status.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Email</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">{reseller.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={[
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                reseller.active !== false
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-600",
              ].join(" ")}
            >
              {reseller.active !== false ? "Active" : "Inactive"}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Wallet balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatGhanaCedis(metrics?.walletBalance ?? 0)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Current available reseller wallet balance.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Today&apos;s orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{metrics?.todaysOrders ?? 0}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Orders placed by this reseller today.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Sales ({salesRangeLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatGhanaCedis(metrics?.filteredSales ?? 0)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Revenue from completed orders in selected range.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Profit ({salesRangeLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatGhanaCedis(metrics?.filteredProfit ?? 0)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Agent margin earned from this reseller in the selected range.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Month completed sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatGhanaCedis(metrics?.monthCompletedTotal ?? 0)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Total completed order value for this month.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Month profit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatGhanaCedis(metrics?.monthProfit ?? 0)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Agent margin earned from this reseller this month.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent reseller orders</CardTitle>
          <CardDescription className="text-xs">
            Latest transactions to monitor performance and fulfillment status.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            {([
              { key: "daily", label: "Daily" },
              { key: "weekly", label: "Weekly" },
              { key: "monthly", label: "Monthly" },
            ] as const).map((item) => {
              const active = selectedSalesRange === item.key
              const href = item.key === "daily"
                ? `/agent/resellers/${resellerId}`
                : `/agent/resellers/${resellerId}?salesRange=${item.key}`
              return (
                <Button
                  key={item.key}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => router.push(href)}
                >
                  {item.label}
                </Button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent orders for this reseller yet.</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {recentOrders.map((order) => (
                  <div key={order.id} className="rounded-lg border bg-background p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{order.phoneNumber || "-"}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        {order.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-medium text-foreground">{formatGhanaCedis(order.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block -mx-6 px-6">
                <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="text-xs">{new Date(order.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{order.phoneNumber || "-"}</TableCell>
                    <TableCell className="text-xs">{order.status}</TableCell>
                    <TableCell className="text-right text-xs">{formatGhanaCedis(order.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Pricing overrides</CardTitle>
          <CardDescription className="text-xs">
            Set custom prices for this reseller by network. Leave blank to use base pricing.
          </CardDescription>
          {providers.length > 1 && (
            <div className="flex flex-wrap gap-2 pt-3">
              {providers.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant={activeProvider === provider ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setSelectedProvider(provider)}
                >
                  {provider}
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products available for {activeProvider}</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredProducts.map((product) => {
                  const current = resellerPrices[product.id]
                  const base = product.price
                  return (
                    <div key={product.id} className="rounded-lg border bg-background p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{product.name}</p>
                          <p className="text-[11px] text-muted-foreground">{product.provider}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">Base: GH₵ {base.toFixed(2)}</p>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] text-muted-foreground">Reseller price</p>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-8 text-xs"
                          defaultValue={current ?? base}
                          onBlur={(e) => {
                            const val = parseFloat(e.currentTarget.value)
                            if (Number.isNaN(val)) return
                            const previous = current ?? base
                            if (Math.abs(val - previous) < 0.0001) return
                            savePrice(product.id, val)
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="hidden overflow-x-auto md:block -mx-6 px-6">
                <Table className="min-w-full text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Base Price</TableHead>
                  <TableHead className="text-right">Reseller Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const current = resellerPrices[product.id]
                  const base = product.price
                  return (
                    <TableRow key={product.id} className="hover:bg-muted/50 transition">
                      <TableCell className="font-medium text-xs">{product.name}</TableCell>
                      <TableCell className="text-right text-xs">GH₵ {base.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-7 text-xs w-28 text-right ml-auto"
                          defaultValue={current ?? base}
                          onBlur={(e) => {
                            const val = parseFloat(e.currentTarget.value)
                            if (Number.isNaN(val)) return
                            const previous = current ?? base
                            if (Math.abs(val - previous) < 0.0001) return
                            savePrice(product.id, val)
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
              </div>
            </>
          )}
          {savingPrices && <p className="mt-2 text-xs text-muted-foreground">Saving overrides…</p>}
        </CardContent>
      </Card>
    </div>
  )
}
