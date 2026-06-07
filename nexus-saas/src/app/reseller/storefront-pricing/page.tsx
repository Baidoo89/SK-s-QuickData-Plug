"use client"

import { useEffect, useMemo, useState } from "react"
import { Store } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"

type ProductRow = {
  id: string
  name: string
  provider: string
  category: string
  buyPrice: number
  storefrontPrice: number
  profit: number
}

function formatCategory(category: string) {
  if (category === "DATA_BUNDLE" || !category) return "Data bundle"
  if (category === "REGISTRATION_SERVICE" || category === "AFA_REGISTRATION") return "Registration service"
  return category.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function ResellerStorefrontPricingPage() {
  const { toast } = useToast()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [selectedNetwork, setSelectedNetwork] = useState("ALL")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadPrices() {
      const res = await fetch("/api/reseller/storefront-prices")
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not load pricing", description: body?.error?.message || body?.message || "Try again." })
        return
      }
      setProducts(body?.data?.products || [])
    }
    loadPrices()
  }, [toast])

  const networks = useMemo(() => Array.from(new Set(products.map((product) => product.provider).filter(Boolean))).sort(), [products])
  const filteredProducts = selectedNetwork === "ALL" ? products : products.filter((product) => product.provider === selectedNetwork)
  const averageProfit = products.length ? products.reduce((sum, product) => sum + product.profit, 0) / products.length : 0
  const serviceCount = products.filter((product) => product.category === "REGISTRATION_SERVICE" || product.category === "AFA_REGISTRATION").length

  async function savePrice(product: ProductRow, value: number) {
    if (value < product.buyPrice) {
      toast({ variant: "destructive", title: "Price below buy price", description: `Minimum price is ${formatGhanaCedis(product.buyPrice)}.` })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/reseller/storefront-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, price: value }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error?.message || body?.message || "Could not save price")
      setProducts((rows) => rows.map((row) => row.id === product.id ? { ...row, storefrontPrice: value, profit: Math.max(value - row.buyPrice, 0) } : row))
      toast({ title: "Storefront price saved" })
    } catch (error) {
      toast({ variant: "destructive", title: "Save failed", description: error instanceof Error ? error.message : "Could not save price" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Storefront Pricing</h1>
        <p className="text-sm text-muted-foreground">Set the customer prices for your reseller storefront. Your dashboard buy price stays separate.</p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <Card className="premium-surface overflow-hidden rounded-lg border-primary/20 bg-primary/5">
          <CardHeader className="border-b border-primary/10 bg-primary/5 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><Store className="h-4 w-4" /> Pricing rule</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Customer price must be equal to or above your buy price. Profit is customer price minus buy price.</CardContent>
        </Card>
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20 pb-2"><CardTitle className="text-xs text-muted-foreground">Catalog Items</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{products.length}</p>
            <p className="text-xs text-muted-foreground">{serviceCount} service item{serviceCount === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20 pb-2"><CardTitle className="text-xs text-muted-foreground">Average profit/order</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{formatGhanaCedis(averageProfit)}</p></CardContent>
        </Card>
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle className="text-sm font-semibold">Customer-facing prices</CardTitle>
          <CardDescription className="text-xs">These prices are used only by your public storefront link.</CardDescription>
          <div className="table-scroll flex gap-2 pt-2">
            <Button size="sm" variant={selectedNetwork === "ALL" ? "default" : "outline"} onClick={() => setSelectedNetwork("ALL")}>All</Button>
            {networks.map((network) => (
              <Button key={network} size="sm" variant={selectedNetwork === network ? "default" : "outline"} onClick={() => setSelectedNetwork(network)}>{network}</Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredProducts.map((product) => (
            <div key={product.id} className="grid min-w-0 gap-3 rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_130px_160px_120px] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{product.name}</p>
                <p className="text-xs text-muted-foreground">{product.provider} · {formatCategory(product.category)}</p>
              </div>
              <div className="text-sm">
                <p className="font-medium">{formatGhanaCedis(product.buyPrice)}</p>
                <p className="text-xs text-muted-foreground">Buy price</p>
              </div>
              <Input
                type="number"
                min={product.buyPrice}
                step="0.01"
                defaultValue={product.storefrontPrice}
                onBlur={(event) => {
                  const value = Number(event.currentTarget.value)
                  if (!Number.isFinite(value) || Math.abs(value - product.storefrontPrice) < 0.0001) return
                  savePrice(product, value)
                }}
              />
              <div className="text-sm md:text-right">
                <p className="font-semibold text-primary">{formatGhanaCedis(Math.max(product.storefrontPrice - product.buyPrice, 0))}</p>
                <p className="text-xs text-muted-foreground">Profit/order</p>
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="text-sm text-muted-foreground">No active products available yet.</p>}
          {saving && <p className="text-xs text-muted-foreground">Saving price...</p>}
        </CardContent>
      </Card>
    </div>
  )
}
