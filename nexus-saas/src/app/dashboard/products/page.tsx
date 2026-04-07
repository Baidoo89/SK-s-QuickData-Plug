
"use client"

import { useEffect, useState, useMemo } from "react"
import { AddEditProductDialog } from "@/components/products/add-edit-product-dialog"
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react"
import { MtnLogo, AirtelTigoLogo, TelecelLogo } from "@/components/products/network-logos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatGhanaCedis } from "@/lib/currency"
import { Suspense } from "react"

const NETWORKS = [
  { id: "MTN", name: "MTN", logo: MtnLogo, color: "bg-yellow-50 border-yellow-200" },
  { id: "AIRTELTIGO", name: "AirtelTigo", logo: AirtelTigoLogo, color: "bg-blue-50 border-blue-200" },
  { id: "TELECEL", name: "Telecel", logo: TelecelLogo, color: "bg-red-50 border-red-200" },
]

function BundlePricingContent() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNetwork, setSelectedNetwork] = useState<string>("MTN")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [newBundleName, setNewBundleName] = useState("")
  const [newBundlePrice, setNewBundlePrice] = useState("")
  const [newBundleBasePrice, setNewBundleBasePrice] = useState("")

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    setLoading(true)
    try {
      const res = await fetch("/api/products")
      const response = await res.json()
      const productsList = response.data || response || []
      setProducts(productsList)
    } finally {
      setLoading(false)
    }
  }

  const networkBundles = useMemo(() => {
    return products.filter(p => p.provider?.toUpperCase() === selectedNetwork && p.category === "DATA_BUNDLE")
  }, [products, selectedNetwork])

  const currentNetwork = NETWORKS.find(n => n.id === selectedNetwork)
  const NetworkLogo = currentNetwork?.logo

  const handleEdit = (product: any) => {
    setSelectedProduct(product)
    setEditDialogOpen(true)
  }

  const handleDelete = async (product: any) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    await fetch(`/api/products/${product.id}`, { method: "DELETE" })
    await fetchProducts()
  }

  const handleAddBundle = async () => {
    if (!newBundleName.trim() || !newBundlePrice.trim() || !newBundleBasePrice.trim()) {
      alert("Bundle name, current price, and base price are required")
      return
    }

    const price = parseFloat(newBundlePrice)
    const basePrice = parseFloat(newBundleBasePrice)
    
    if (isNaN(price) || price < 0) {
      alert("Please enter a valid current price")
      return
    }
    if (isNaN(basePrice) || basePrice < 0) {
      alert("Please enter a valid base price")
      return
    }

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBundleName.trim(),
          provider: selectedNetwork,
          category: "DATA_BUNDLE",
          price,
          basePrice,
          active: true,
        }),
      })

      if (!res.ok) throw new Error("Failed to create bundle")

      setNewBundleName("")
      setNewBundlePrice("")
      setNewBundleBasePrice("")
      await fetchProducts()
    } catch (error) {
      alert("Error creating bundle")
    }
  }

  return (
    <div className="flex-1 space-y-8 px-4 py-6 md:p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Bundle Pricing</h1>
        <p className="text-sm text-muted-foreground mt-1">Select a network and manage your data bundle prices</p>
      </div>

      {/* Network Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {NETWORKS.map(network => (
          <button
            key={network.id}
            onClick={() => setSelectedNetwork(network.id)}
            className={`p-6 rounded-lg border-2 transition-all ${
              selectedNetwork === network.id
                ? `${network.color} border-current`
                : "bg-muted border-muted-foreground/20 hover:border-muted-foreground/40"
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              {NetworkLogo && selectedNetwork === network.id && <NetworkLogo className="w-8 h-8" />}
              {!NetworkLogo && selectedNetwork !== network.id && <network.logo className="w-8 h-8 opacity-50" />}
              {NetworkLogo && selectedNetwork !== network.id && <network.logo className="w-8 h-8 opacity-50" />}
              <div className="text-left">
                <div className="font-bold text-lg">{network.name}</div>
                <div className="text-xs text-muted-foreground">{networkBundles.filter(b => b.provider?.toUpperCase() === network.id).length} bundles</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Bundle Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {NetworkLogo && <NetworkLogo className="w-6 h-6" />}
            <div>
              <CardTitle>{currentNetwork?.name} Bundles</CardTitle>
              <CardDescription>Manage pricing for {currentNetwork?.name} data bundles</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add New Bundle Form */}
          <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add New Bundle
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                placeholder="Bundle name (e.g., 1GB Data)"
                value={newBundleName}
                onChange={(e) => setNewBundleName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddBundle()}
              />
              <Input
                placeholder="Base price (GH₵)"
                type="number"
                min="0"
                step="0.01"
                value={newBundleBasePrice}
                onChange={(e) => setNewBundleBasePrice(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddBundle()}
              />
              <Input
                placeholder="Current price (GH₵)"
                type="number"
                min="0"
                step="0.01"
                value={newBundlePrice}
                onChange={(e) => setNewBundlePrice(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddBundle()}
              />
              <Button onClick={handleAddBundle} className="w-full">
                Add Bundle
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Base price: wholesale/cost for agents. Current price: retail price you display.</p>
          </div>

          {/* Bundles List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : networkBundles.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No bundles yet</p>
              <p className="text-sm text-muted-foreground">Add your first bundle above</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Current Bundles ({networkBundles.length})</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Bundle Name</TableHead>
                      <TableHead className="text-right">Base Price</TableHead>
                      <TableHead className="text-right">Current Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {networkBundles.map(bundle => (
                      <TableRow key={bundle.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{bundle.name}</TableCell>
                        <TableCell className="text-right text-sm">{formatGhanaCedis(bundle.basePrice ?? bundle.price)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatGhanaCedis(bundle.price)}</TableCell>
                        <TableCell>
                          <Badge variant={bundle.active ? "default" : "outline"} className={bundle.active ? "bg-green-50 text-green-700" : ""}>
                            {bundle.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(bundle)}
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(bundle)}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <AddEditProductDialog
        open={editDialogOpen}
        setOpen={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            setSelectedProduct(null)
            fetchProducts()
          }
        }}
        initialData={selectedProduct}
        mode="edit"
      />
    </div>
  )
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="p-8"><div className="w-12 h-12 rounded-lg bg-muted animate-pulse" /></div>}>
      <BundlePricingContent />
    </Suspense>
  )
}
