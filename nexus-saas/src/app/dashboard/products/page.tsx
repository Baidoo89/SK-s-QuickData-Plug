
"use client"

import { useEffect, useState, useMemo } from "react"
import { AddEditProductDialog } from "@/components/products/add-edit-product-dialog"
import Link from "next/link"
import { BarChart3, FileText, Layers3, Pencil, Trash2, Plus, Loader2, Package, Percent, Tags } from "lucide-react"
import { MtnLogo, AirtelTigoLogo, TelecelLogo } from "@/components/products/network-logos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { MetricCard } from "@/components/ui/metric-card"
import { formatGhanaCedis } from "@/lib/currency"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

const NETWORKS = [
  { id: "MTN", name: "MTN", logo: MtnLogo },
  { id: "AIRTELTIGO", name: "AirtelTigo", logo: AirtelTigoLogo },
  { id: "TELECEL", name: "Telecel", logo: TelecelLogo },
]

type ServiceFormField = {
  id: string
  label: string
  type: "TEXT" | "PHONE" | "DATE" | "NUMBER" | "SELECT" | "TEXTAREA" | "GHANA_CARD"
  required: boolean
  placeholder?: string
  options?: string[]
}

const DEFAULT_SERVICE_FIELDS: ServiceFormField[] = [
  { id: "ghanaCardNumber", label: "Ghana Card number", type: "GHANA_CARD", required: true, placeholder: "GHA-000000000-0" },
  { id: "location", label: "Location / town", type: "TEXT", required: true, placeholder: "e.g. Kumasi" },
  { id: "dateOfBirth", label: "Date of birth", type: "DATE", required: true },
]

const FIELD_TYPES: Array<{ value: ServiceFormField["type"]; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "PHONE", label: "Phone" },
  { value: "DATE", label: "Date" },
  { value: "NUMBER", label: "Number" },
  { value: "SELECT", label: "Selection" },
  { value: "TEXTAREA", label: "Long text" },
  { value: "GHANA_CARD", label: "Ghana Card" },
]

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.0%"
  return `${value.toFixed(1)}%`
}

function getBundleSizeMb(name: string) {
  const match = name.match(/\b(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)\b/i)
  if (!match) return Number.POSITIVE_INFINITY

  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return Number.POSITIVE_INFINITY

  const unit = match[2].toUpperCase()
  if (unit === "TB") return amount * 1024 * 1024
  if (unit === "GB") return amount * 1024
  if (unit === "MB") return amount
  if (unit === "KB") return amount / 1024
  return Number.POSITIVE_INFINITY
}

function sortBundlesBySizeAsc<T extends { name?: string | null; productName?: string | null }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aName = a.name ?? a.productName ?? ""
    const bName = b.name ?? b.productName ?? ""
    const sizeDelta = getBundleSizeMb(aName) - getBundleSizeMb(bName)

    if (sizeDelta !== 0) return sizeDelta
    return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: "base" })
  })
}

type PricingProfile = {
  id: string
  name: string
  tag?: string | null
  targetRole: "AGENT" | "RESELLER" | "BOTH"
  itemCount: number
  assignmentCount: number
}

type PricingProfileRow = {
  productId: string
  productName: string
  network: string
  basePrice: number
  profilePrice: number
}

function BundlePricingContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const activeTab = tabParam === "network_pricing" || tabParam === "pricing_profiles" ? "pricing_profiles" : "bundle_pricing"

  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNetwork, setSelectedNetwork] = useState<string>("MTN")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [newBundleName, setNewBundleName] = useState("")
  const [newBundlePrice, setNewBundlePrice] = useState("")
  const [newBundleBasePrice, setNewBundleBasePrice] = useState("")
  const [newBundleStorefrontPrice, setNewBundleStorefrontPrice] = useState("")
  const [newServiceName, setNewServiceName] = useState("Registration Service")
  const [newServiceProvider, setNewServiceProvider] = useState("MTN")
  const [newServicePrice, setNewServicePrice] = useState("")
  const [newServiceBasePrice, setNewServiceBasePrice] = useState("")
  const [newServiceStorefrontPrice, setNewServiceStorefrontPrice] = useState("")
  const [serviceFields, setServiceFields] = useState<ServiceFormField[]>(DEFAULT_SERVICE_FIELDS)

  const [profiles, setProfiles] = useState<PricingProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string>("")
  const [profileRows, setProfileRows] = useState<PricingProfileRow[]>([])
  const [profileRowsLoading, setProfileRowsLoading] = useState(false)
  const [newProfileName, setNewProfileName] = useState("")
  const [newProfileTag, setNewProfileTag] = useState("")
  const [newProfileRole, setNewProfileRole] = useState<"AGENT" | "RESELLER" | "BOTH">("BOTH")
  const [savingProductId, setSavingProductId] = useState<string | null>(null)
  const [savingProfileProductId, setSavingProfileProductId] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
    fetchProfiles()
  }, [])

  useEffect(() => {
    if (activeTab === "pricing_profiles") {
      fetchProfiles()
    }
  }, [activeTab])

  async function fetchProducts() {
    setLoading(true)
    try {
      const res = await fetch("/api/products")
      const response = await res.json()
      const productsList = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
        ? response
        : []
      setProducts(productsList)
    } finally {
      setLoading(false)
    }
  }

  async function fetchProfiles() {
    setProfilesLoading(true)
    try {
      const res = await fetch("/api/pricing/profiles")
      if (!res.ok) return
      const payload = await res.json().catch(() => null as any)
      const list = payload?.data ?? payload ?? []
      if (Array.isArray(list)) {
        setProfiles(list)
        if (!selectedProfileId && list[0]?.id) {
          setSelectedProfileId(list[0].id)
          await fetchProfileDetails(list[0].id)
        }
      }
    } finally {
      setProfilesLoading(false)
    }
  }

  async function fetchProfileDetails(profileId: string) {
    setProfileRowsLoading(true)
    try {
      const res = await fetch(`/api/pricing/profiles/${profileId}`)
      if (!res.ok) return
      const payload = await res.json().catch(() => null as any)
      const data = payload?.data ?? payload
      const rows = data?.rows ?? []
      if (Array.isArray(rows)) {
        setProfileRows(rows)
      }
    } finally {
      setProfileRowsLoading(false)
    }
  }

  async function createPricingProfile() {
    if (!newProfileName.trim()) {
      alert("Profile name is required")
      return
    }
    const res = await fetch("/api/pricing/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newProfileName.trim(),
        tag: newProfileTag.trim() || null,
        targetRole: newProfileRole,
      }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => null as any)
      alert(payload?.error?.message || payload?.message || "Failed to create profile")
      return
    }
    const payload = await res.json().catch(() => null as any)
    const profile = payload?.data ?? payload
    setNewProfileName("")
    setNewProfileTag("")
    await fetchProfiles()
    if (profile?.id) {
      setSelectedProfileId(profile.id)
      await fetchProfileDetails(profile.id)
    }
  }

  async function saveProfilePrice(productId: string, price: number) {
    if (!selectedProfileId) return
    if (Number.isNaN(price) || price < 0) {
      return
    }

    setSavingProfileProductId(productId)
    try {
      const res = await fetch(`/api/pricing/profiles/${selectedProfileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, price }),
      })
      if (!res.ok) throw new Error("Failed to update profile price")

      setProfileRows((prev) =>
        prev.map((row) => (row.productId === productId ? { ...row, profilePrice: price } : row))
      )
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save profile price")
    } finally {
      setSavingProfileProductId(null)
    }
  }

  const networkBundles = useMemo(() => {
    return sortBundlesBySizeAsc(products.filter(p => p.provider?.toUpperCase() === selectedNetwork && p.category === "DATA_BUNDLE"))
  }, [products, selectedNetwork])

  const registrationServices = useMemo(() => {
    return products.filter(p => p.category === "REGISTRATION_SERVICE" || p.category === "AFA_REGISTRATION")
  }, [products])

  const currentNetwork = NETWORKS.find(n => n.id === selectedNetwork)
  const NetworkLogo = currentNetwork?.logo

  const networkProfileRows = useMemo(() => {
    return sortBundlesBySizeAsc(profileRows.filter((row) => row.network?.toUpperCase() === selectedNetwork))
  }, [profileRows, selectedNetwork])

  const totalActiveBundles = useMemo(() => {
    return products.filter((product) => product.category === "DATA_BUNDLE" && product.active !== false).length
  }, [products])

  const totalActiveServices = useMemo(() => {
    return products.filter((product) => (product.category === "REGISTRATION_SERVICE" || product.category === "AFA_REGISTRATION") && product.active !== false).length
  }, [products])

  const networkCounts = useMemo(() => {
    return NETWORKS.reduce<Record<string, number>>((acc, network) => {
      acc[network.id] = products.filter((product) => product.provider?.toUpperCase() === network.id && product.category === "DATA_BUNDLE").length
      return acc
    }, {})
  }, [products])

  const networksWithBundles = useMemo(() => {
    return NETWORKS.filter((network) => (networkCounts[network.id] || 0) > 0).length
  }, [networkCounts])

  const missingNetworks = useMemo(() => {
    return NETWORKS.filter((network) => (networkCounts[network.id] || 0) === 0).map((network) => network.name)
  }, [networkCounts])

  const averageMarginPercent = useMemo(() => {
    const activeBundles = products.filter((product) => product.category === "DATA_BUNDLE" && product.active !== false && Number(product.price) > 0)
    if (activeBundles.length === 0) return 0

    const totalMargin = activeBundles.reduce((sum, product) => {
      const price = Number(product.price) || 0
      const basePrice = Number(product.basePrice ?? product.price) || 0
      const storefrontPrice = Number(product.storefrontPrice ?? product.price) || 0
      return sum + (storefrontPrice > 0 ? ((storefrontPrice - basePrice) / storefrontPrice) * 100 : 0)
    }, 0)

    return totalMargin / activeBundles.length
  }, [products])

  const selectedNetworkBaseValue = useMemo(() => {
    return networkBundles.reduce((sum, bundle) => sum + Number(bundle.basePrice ?? bundle.price ?? 0), 0)
  }, [networkBundles])

  const selectedNetworkRetailValue = useMemo(() => {
    return networkBundles.reduce((sum, bundle) => sum + Number(bundle.storefrontPrice ?? bundle.price ?? 0), 0)
  }, [networkBundles])

  const handleEdit = (product: any) => {
    setSelectedProduct(product)
    setEditDialogOpen(true)
  }

  const handleDelete = async (product: any) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    await fetch(`/api/products/${product.id}`, { method: "DELETE" })
    await fetchProducts()
  }

  async function saveProductInline(product: any, updates: Partial<{ name: string; basePrice: number; price: number; storefrontPrice: number; active: boolean }>) {
    const next = {
      name: updates.name ?? product.name,
      description: product.description ?? "",
      provider: product.provider,
      category: product.category,
      bundleType: product.bundleType ?? "DATA",
      basePrice: updates.basePrice ?? Number(product.basePrice ?? product.price ?? 0),
      price: updates.price ?? Number(product.price ?? 0),
      storefrontPrice: updates.storefrontPrice ?? Number(product.storefrontPrice ?? product.price ?? 0),
      active: updates.active ?? product.active !== false,
    }

    if (!next.name.trim()) {
      alert("Bundle name is required")
      return
    }
    if ([next.basePrice, next.price, next.storefrontPrice].some((value) => !Number.isFinite(value) || value < 0)) {
      alert("Prices must be valid positive numbers")
      return
    }
    if (next.price < next.basePrice) {
      alert("Dashboard price should not be below cost")
      return
    }
    if (next.storefrontPrice < next.basePrice) {
      alert("Shop price should not be below cost")
      return
    }

    setSavingProductId(product.id)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error("Failed to save bundle")

      setProducts((current) =>
        current.map((item) => (item.id === product.id ? { ...item, ...next } : item))
      )
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save bundle")
      await fetchProducts()
    } finally {
      setSavingProductId(null)
    }
  }

  function handleInlineNumberBlur(product: any, field: "basePrice" | "price" | "storefrontPrice", value: string) {
    const next = Number(value)
    const current = Number(product[field] ?? product.price ?? 0)
    if (!Number.isFinite(next) || next < 0 || next === current) return
    saveProductInline(product, { [field]: next })
  }

  const handleAddBundle = async () => {
    if (!newBundleName.trim() || !newBundlePrice.trim() || !newBundleBasePrice.trim() || !newBundleStorefrontPrice.trim()) {
      alert("Bundle name, cost, dashboard price, and shop price are required")
      return
    }

    const price = parseFloat(newBundlePrice)
    const basePrice = parseFloat(newBundleBasePrice)
    const storefrontPrice = parseFloat(newBundleStorefrontPrice)
    
    if (isNaN(price) || price < 0) {
      alert("Please enter a valid dashboard price")
      return
    }
    if (isNaN(basePrice) || basePrice < 0) {
      alert("Please enter a valid cost")
      return
    }
    if (isNaN(storefrontPrice) || storefrontPrice < 0) {
      alert("Please enter a valid shop price")
      return
    }
    if (price < basePrice) {
      alert("Dashboard price should not be below cost")
      return
    }
    if (storefrontPrice < basePrice) {
      alert("Shop price should not be below cost")
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
          storefrontPrice,
          active: true,
        }),
      })

      if (!res.ok) throw new Error("Failed to create bundle")

      setNewBundleName("")
      setNewBundlePrice("")
      setNewBundleBasePrice("")
      setNewBundleStorefrontPrice("")
      await fetchProducts()
    } catch (error) {
      alert("Error creating bundle")
    }
  }

  const handleAddRegistrationService = async () => {
    if (!newServiceName.trim() || !newServicePrice.trim() || !newServiceBasePrice.trim() || !newServiceStorefrontPrice.trim()) {
      alert("Service name, provider, cost, dashboard price, and shop price are required")
      return
    }

    const price = parseFloat(newServicePrice)
    const basePrice = parseFloat(newServiceBasePrice)
    const storefrontPrice = parseFloat(newServiceStorefrontPrice)

    if (isNaN(price) || price < 0 || isNaN(basePrice) || basePrice < 0 || isNaN(storefrontPrice) || storefrontPrice < 0) {
      alert("Enter valid prices for the registration service")
      return
    }

    if (price < basePrice) {
      alert("Dashboard price should not be below cost")
      return
    }

    if (storefrontPrice < basePrice) {
      alert("Shop price should not be below cost")
      return
    }

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newServiceName.trim(),
          description: "Registration service requiring full name, phone number, Ghana Card number, location, and date of birth.",
          provider: newServiceProvider,
          category: "REGISTRATION_SERVICE",
          bundleType: "SERVICE",
          serviceForm: JSON.stringify({ version: 1, fields: serviceFields }),
          price,
          basePrice,
          storefrontPrice,
          active: true,
        }),
      })

      if (!res.ok) throw new Error("Failed to create registration service")

      setNewServiceName("Registration Service")
      setNewServiceProvider("MTN")
      setNewServicePrice("")
      setNewServiceBasePrice("")
      setNewServiceStorefrontPrice("")
      setServiceFields(DEFAULT_SERVICE_FIELDS)
      await fetchProducts()
    } catch (error) {
      alert("Error creating registration service")
    }
  }

  const addServiceField = () => {
    const id = `field_${Date.now()}`
    setServiceFields((fields) => [
      ...fields,
      { id, label: "New field", type: "TEXT", required: true, placeholder: "" },
    ])
  }

  const updateServiceField = (index: number, updates: Partial<ServiceFormField>) => {
    setServiceFields((fields) => fields.map((field, i) => (i === index ? { ...field, ...updates } : field)))
  }

  const removeServiceField = (index: number) => {
    setServiceFields((fields) => fields.filter((_, i) => i !== index))
  }

  if (activeTab === "pricing_profiles") {
    return (
      <div className="portal-page flex-1 space-y-6">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Price Groups</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create named pricing tags for agents and resellers, then assign them from user detail pages.
            </p>
          </div>
          <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 lg:w-auto">
            <Button asChild variant="outline">
              <Link href="/dashboard/products">Products</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/products?tab=pricing_profiles">Price groups</Link>
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Profiles" value={profiles.length} description="Reusable price lists." icon={Tags} tone="primary" />
          <MetricCard label="Profile Rows" value={profileRows.length} description="Bundle prices in the selected profile." icon={Package} tone="info" />
          <MetricCard label="Active Bundles" value={totalActiveBundles} description="Available products for assignment." icon={Layers3} tone="success" />
          <MetricCard label="Network Coverage" value={`${networksWithBundles}/${NETWORKS.length}`} description={missingNetworks.length ? `Missing ${missingNetworks.join(", ")}` : "All networks have bundles."} icon={BarChart3} tone={missingNetworks.length ? "warning" : "success"} />
        </div>

        <Card className="premium-surface rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle>Create Pricing Profile</CardTitle>
            <CardDescription>Save a reusable pricing setup with a name and tag.</CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-4">
            <Input
              placeholder="Profile name (e.g. Small Agent)"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
            />
            <Input
              placeholder="Tag (optional)"
              value={newProfileTag}
              onChange={(e) => setNewProfileTag(e.target.value)}
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={newProfileRole}
              onChange={(e) => setNewProfileRole(e.target.value as "AGENT" | "RESELLER" | "BOTH")}
            >
              <option value="BOTH">Both</option>
              <option value="AGENT">Agents</option>
              <option value="RESELLER">Resellers</option>
            </select>
            <Button onClick={createPricingProfile}>Create Profile</Button>
          </CardContent>
        </Card>

        <Card className="premium-surface rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle>Saved Profiles</CardTitle>
            <CardDescription>Select a profile and edit prices by network.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profilesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : profiles.length === 0 ? (
              <EmptyState
                icon={Plus}
                title="No pricing profiles yet"
                description="Create a reusable price list for agents and resellers, then assign it from their detail pages."
                className="py-6"
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {profiles.map((profile) => (
                  <Button
                    key={profile.id}
                    variant={selectedProfileId === profile.id ? "default" : "outline"}
                    onClick={async () => {
                      setSelectedProfileId(profile.id)
                      await fetchProfileDetails(profile.id)
                    }}
                    className="text-xs"
                  >
                    {profile.name}
                    {profile.tag ? ` (${profile.tag})` : ""}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
          {NETWORKS.map(network => (
            <button
              key={network.id}
              onClick={() => setSelectedNetwork(network.id)}
              className={`rounded-lg border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${
                selectedNetwork === network.id
                  ? "border-primary/40 bg-primary/10 shadow-md shadow-primary/10"
                  : "border-border/75 bg-card/95 hover:border-primary/30 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <network.logo className="w-8 h-8" />
                <div className="text-left">
                <div className="font-bold text-lg">{network.name}</div>
                <div className="text-xs text-muted-foreground">
                    {profileRows.filter((r) => r.network?.toUpperCase() === network.id).length} bundles
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <Card className="premium-surface rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle>{currentNetwork?.name} Profile Prices</CardTitle>
            <CardDescription>These values are what assigned users will be charged.</CardDescription>
          </CardHeader>
          <CardContent>
            {profileRowsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !selectedProfileId ? (
              <p className="text-sm text-muted-foreground">Select a profile first.</p>
            ) : networkProfileRows.length === 0 ? (
              <EmptyState
                icon={Plus}
                title="No bundles in this profile"
                description="Add products first, then create price groups."
                secondaryAction={{ label: "Open products", href: "/dashboard/products" }}
                className="py-6"
              />
            ) : (
              <div className="ops-table-surface table-scroll rounded-lg">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bundle</TableHead>
                      <TableHead className="text-right">Base Price</TableHead>
                      <TableHead className="text-right">Profile Price</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Save</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {networkProfileRows.map((row) => {
                      const margin = Math.max(Number(row.profilePrice) - Number(row.basePrice), 0)
                      return (
                        <TableRow key={row.productId}>
                          <TableCell className="font-medium">{row.productName}</TableCell>
                          <TableCell className="text-right">{formatGhanaCedis(row.basePrice)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={row.profilePrice}
                              disabled={savingProfileProductId === row.productId}
                              className="ml-auto h-8 w-28 text-right"
                              onBlur={(e) => {
                                const val = Number(e.target.value)
                                if (Number.isNaN(val) || val < 0) return
                                if (val === row.profilePrice) return
                                saveProfilePrice(row.productId, val)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur()
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right text-primary">{formatGhanaCedis(margin)}</TableCell>
                          <TableCell className="text-right text-[11px] text-muted-foreground">
                            {savingProfileProductId === row.productId ? "Saving..." : "Auto"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="portal-page flex-1 space-y-6">
      {/* Header */}
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Products & Prices</h1>
          <p className="text-sm text-muted-foreground mt-1">Add bundles, services, and prices.</p>
          </div>
          <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 lg:w-auto">
            <Button asChild>
              <Link href="/dashboard/products">Products</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/products?tab=pricing_profiles">Price groups</Link>
            </Button>
          </div>
        </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Bundles" value={totalActiveBundles} description="Active data bundles" icon={Package} tone="success" />
        <MetricCard label="Services" value={totalActiveServices} description="Registration forms" icon={FileText} tone="info" />
        <MetricCard label="Network Coverage" value={`${networksWithBundles}/${NETWORKS.length}`} description={missingNetworks.length ? `Missing ${missingNetworks.join(", ")}` : "All networks have bundles."} icon={BarChart3} tone={missingNetworks.length ? "warning" : "success"} />
        <MetricCard label="Average Margin" value={formatPercent(averageMarginPercent)} description="Shop price vs cost" icon={Percent} tone={averageMarginPercent > 0 ? "primary" : "warning"} />
        <MetricCard label="Price Groups" value={profiles.length} description="Reusable team prices" icon={Tags} tone="primary" />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardContent className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Catalog check</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {missingNetworks.length
                ? `Add ${missingNetworks.join(", ")} bundles.`
                : "All networks have bundles."}
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <Badge variant="outline" className="justify-center rounded-md px-3 py-1">
              {currentNetwork?.name}: {networkBundles.length} bundles
            </Badge>
            <Badge variant="outline" className="justify-center rounded-md px-3 py-1">
              Shop {formatGhanaCedis(selectedNetworkRetailValue)} / Cost {formatGhanaCedis(selectedNetworkBaseValue)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="premium-surface rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Service Forms</CardTitle>
              <CardDescription>Create forms customers can pay for.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-4 rounded-lg border border-border/75 bg-muted/20 p-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Service
            </h3>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
              <Input
                placeholder="Service name (e.g. customer registration)"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
              />
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={newServiceProvider}
                onChange={(e) => setNewServiceProvider(e.target.value)}
              >
                {NETWORKS.map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
                <option value="SERVICE">Other Service</option>
              </select>
              <Input
                placeholder="Source cost (GHS)"
                type="number"
                min="0"
                step="0.01"
                value={newServiceBasePrice}
                onChange={(e) => setNewServiceBasePrice(e.target.value)}
              />
              <Input
                placeholder="Dashboard price (GHS)"
                type="number"
                min="0"
                step="0.01"
                value={newServicePrice}
                onChange={(e) => setNewServicePrice(e.target.value)}
              />
              <Input
                placeholder="Shop price (GHS)"
                type="number"
                min="0"
                step="0.01"
                value={newServiceStorefrontPrice}
                onChange={(e) => setNewServiceStorefrontPrice(e.target.value)}
              />
              <Button onClick={handleAddRegistrationService} className="w-full">
                Add Service
              </Button>
            </div>
              <p className="text-xs text-muted-foreground">
              Customers fill the form, pay, then the request appears under Services.
            </p>
            <div className="space-y-3 rounded-lg border border-border/75 bg-background/55 p-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Form fields</p>
                  <p className="text-xs text-muted-foreground">Name and phone are always collected.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addServiceField}>
                  <Plus className="mr-2 h-4 w-4" /> Add Field
                </Button>
              </div>
              <div className="space-y-2">
                {serviceFields.map((field, index) => (
                  <div key={field.id} className="grid min-w-0 gap-2 rounded-lg border border-border/75 bg-muted/20 p-2 md:grid-cols-[minmax(0,1.1fr)_140px_minmax(0,1fr)_96px_40px] md:items-center">
                    <Input
                      value={field.label}
                      onChange={(event) => updateServiceField(index, { label: event.target.value })}
                      placeholder="Field label"
                      className="h-9"
                    />
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                      value={field.type}
                      onChange={(event) => updateServiceField(index, { type: event.target.value as ServiceFormField["type"] })}
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                    <Input
                      value={field.type === "SELECT" ? (field.options || []).join(", ") : field.placeholder || ""}
                      onChange={(event) =>
                        updateServiceField(
                          index,
                          field.type === "SELECT"
                            ? { options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) }
                            : { placeholder: event.target.value },
                        )
                      }
                      placeholder={field.type === "SELECT" ? "Options: One, Two, Three" : "Placeholder"}
                      className="h-9"
                    />
                    <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) => updateServiceField(index, { required: event.target.checked })}
                      />
                      Required
                    </label>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeServiceField(index)} title="Remove field">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                {serviceFields.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    No extra fields. The shop will collect name and phone only.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {registrationServices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No service yet"
              description="Add a service above to show it in your shop."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {registrationServices.map((service) => (
                  <div key={service.id} className="rounded-lg border border-border/75 bg-background/55 p-3 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{service.name}</p>
                      <p className="text-xs text-muted-foreground">{service.provider || "Service"} registration service</p>
                    </div>
                    <Badge variant={service.active ? "default" : "outline"} className={service.active ? "status-success border" : ""}>
                      {service.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">{formatGhanaCedis(service.basePrice ?? service.price)}</p>
                      <p>Source</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{formatGhanaCedis(service.price)}</p>
                      <p>Buy</p>
                    </div>
                    <div>
                      <p className="font-semibold text-primary">{formatGhanaCedis(service.storefrontPrice ?? service.price)}</p>
                      <p>Shop</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(service)} title="Edit">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(service)} title="Delete">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Network Selector */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
        {NETWORKS.map(network => (
          <button
            key={network.id}
            onClick={() => setSelectedNetwork(network.id)}
          className={`rounded-lg border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${
            selectedNetwork === network.id
              ? "border-primary/40 bg-primary/10 shadow-md shadow-primary/10"
              : "border-border/75 bg-card/95 hover:border-primary/30 hover:bg-muted/40"
          }`}
        >
            <div className="flex items-center gap-3">
              <network.logo className={`w-8 h-8 ${selectedNetwork === network.id ? "" : "opacity-50"}`} />
              <div className="text-left">
                <div className="font-bold text-lg">{network.name}</div>
                <div className="text-xs text-muted-foreground">{products.filter(b => b.provider?.toUpperCase() === network.id && b.category === "DATA_BUNDLE").length} bundles</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Bundle Management */}
      <Card className="premium-surface rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2">
            {NetworkLogo && <NetworkLogo className="w-6 h-6" />}
            <div>
              <CardTitle>{currentNetwork?.name} Bundles</CardTitle>
              <CardDescription>Set cost, dashboard price, and shop price.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add New Bundle Form */}
          <div className="space-y-4 rounded-lg border border-border/75 bg-muted/20 p-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Bundle
            </h3>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Input
                placeholder="Bundle name (e.g., 1GB Data)"
                value={newBundleName}
                onChange={(e) => setNewBundleName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddBundle()}
              />
              <Input
                placeholder="Source cost (GHS)"
                type="number"
                min="0"
                step="0.01"
                value={newBundleBasePrice}
                onChange={(e) => setNewBundleBasePrice(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddBundle()}
              />
              <Input
                placeholder="Dashboard price (GHS)"
                type="number"
                min="0"
                step="0.01"
                value={newBundlePrice}
                onChange={(e) => setNewBundlePrice(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddBundle()}
              />
              <Input
                placeholder="Shop price (GHS)"
                type="number"
                min="0"
                step="0.01"
                value={newBundleStorefrontPrice}
                onChange={(e) => setNewBundleStorefrontPrice(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddBundle()}
              />
              <Button onClick={handleAddBundle} className="w-full">
                Add Bundle
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Cost is your provider price. Dashboard price is your own buy price. Shop price is what customers pay.</p>
            <div className="rounded-lg border border-border/75 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
              Tip: create matching bundle sizes for MTN, Telecel, and AirtelTigo.
            </div>
          </div>

          {/* Bundles List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : networkBundles.length === 0 ? (
            <EmptyState
              icon={Plus}
              title={`No ${currentNetwork?.name ?? "network"} bundles yet`}
              description="Add the first data bundle above."
              secondaryAction={{ label: "Review setup", href: "/dashboard/setup" }}
            />
          ) : (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Current Bundles ({networkBundles.length})</h3>
              <div className="ops-table-surface table-scroll rounded-lg">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Bundle Name</TableHead>
                      <TableHead className="text-right">Source Cost</TableHead>
                      <TableHead className="text-right">Dashboard Price</TableHead>
                      <TableHead className="text-right">Shop</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Save</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {networkBundles.map(bundle => (
                      <TableRow key={bundle.id}>
                        <TableCell className="font-medium">
                          <Input
                            defaultValue={bundle.name}
                            disabled={savingProductId === bundle.id}
                            className="h-8 min-w-[180px]"
                            onBlur={(e) => {
                              const value = e.target.value.trim()
                              if (!value || value === bundle.name) return
                              saveProductInline(bundle, { name: value })
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur()
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={bundle.basePrice ?? bundle.price}
                            disabled={savingProductId === bundle.id}
                            className="ml-auto h-8 w-28 text-right"
                            onBlur={(e) => handleInlineNumberBlur(bundle, "basePrice", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur()
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={bundle.price}
                            disabled={savingProductId === bundle.id}
                            className="ml-auto h-8 w-28 text-right"
                            onBlur={(e) => handleInlineNumberBlur(bundle, "price", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur()
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={bundle.storefrontPrice ?? bundle.price}
                            disabled={savingProductId === bundle.id}
                            className="ml-auto h-8 w-28 text-right"
                            onBlur={(e) => handleInlineNumberBlur(bundle, "storefrontPrice", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur()
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatGhanaCedis(Math.max(Number(bundle.storefrontPrice ?? bundle.price) - Number(bundle.basePrice ?? bundle.price), 0))}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            disabled={savingProductId === bundle.id}
                            onClick={() => saveProductInline(bundle, { active: bundle.active === false })}
                            className="rounded-md"
                          >
                            <Badge variant={bundle.active ? "default" : "outline"} className={bundle.active ? "status-success border" : ""}>
                              {bundle.active ? "Active" : "Inactive"}
                            </Badge>
                          </button>
                        </TableCell>
                        <TableCell className="text-right text-[11px] text-muted-foreground">
                          {savingProductId === bundle.id ? "Saving..." : "Auto"}
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
