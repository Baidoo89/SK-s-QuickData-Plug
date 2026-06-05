"use client"

import { useEffect, useMemo, useState } from "react"
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
  category?: string
  price: number
  basePrice?: number
  parentCost?: number
  profilePrice?: number
  effectiveDefaultPrice?: number | null
  blockedByStrictProfile?: boolean
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

interface PricingProfile {
  id: string
  name: string
  tag?: string | null
  itemCount: number
  assignmentCount: number
}

interface PricingProfileRow {
  productId: string
  productName: string
  network: string
  category?: string
  parentCost: number
  profilePrice: number
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
  const [profiles, setProfiles] = useState<PricingProfile[]>([])
  const [assignedProfileId, setAssignedProfileId] = useState("")
  const [strictPricing, setStrictPricing] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState("")
  const [profileRows, setProfileRows] = useState<PricingProfileRow[]>([])
  const [newProfileName, setNewProfileName] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)

  // Get unique providers from products
  const providers = Array.from(new Set(products.map((p) => p.provider))).sort()
  const activeProvider = selectedProvider && providers.includes(selectedProvider) ? selectedProvider : providers[0]
  const filteredProducts = activeProvider ? products.filter((p) => p.provider === activeProvider) : products
  const filteredProfileRows = activeProvider ? profileRows.filter((row) => row.network === activeProvider) : profileRows

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
      const payload = response.data || []
      const data = Array.isArray(payload) ? payload : payload.prices || []
      const map: Record<string, number> = {}
      data.forEach((p: any) => {
        map[p.productId] = p.price
      })
      setResellerPrices(map)
      if (!Array.isArray(payload) && Array.isArray(payload.products)) {
        setProducts(payload.products)
      }
      if (!Array.isArray(payload) && payload.assignment) {
        const profileId = payload.assignment.pricingProfileId || ""
        setAssignedProfileId(profileId)
        setStrictPricing(Boolean(payload.assignment.strictPricing))
        if (profileId) setSelectedProfileId((current) => current || profileId)
      }
    }
    loadPrices()
  }, [resellerId])

  useEffect(() => {
    async function loadProfiles() {
      if (!resellerId) return
      const res = await fetch(`/api/agent/pricing/profiles?resellerId=${resellerId}`)
      if (!res.ok) return
      const response = await res.json()
      const payload = response.data || {}
      const list = Array.isArray(payload.profiles) ? payload.profiles : []
      const assignment = payload.assignment || null
      const profileId = assignment?.pricingProfileId || ""

      setProfiles(list)
      setAssignedProfileId(profileId)
      setStrictPricing(Boolean(assignment?.strictPricing))
      setSelectedProfileId((current) => current || profileId || list[0]?.id || "")
    }

    loadProfiles()
  }, [resellerId])

  useEffect(() => {
    async function loadProfileDetails() {
      if (!selectedProfileId) {
        setProfileRows([])
        return
      }

      const res = await fetch(`/api/agent/pricing/profiles/${selectedProfileId}`)
      if (!res.ok) {
        setProfileRows([])
        return
      }

      const response = await res.json()
      const payload = response.data || {}
      setProfileRows(Array.isArray(payload.rows) ? payload.rows : [])
    }

    loadProfileDetails()
  }, [selectedProfileId])

  const reloadProfileList = async (nextSelectedId?: string) => {
    const res = await fetch(`/api/agent/pricing/profiles?resellerId=${resellerId}`)
    if (!res.ok) return
    const response = await res.json()
    const payload = response.data || {}
    const list = Array.isArray(payload.profiles) ? payload.profiles : []
    const assignment = payload.assignment || null

    setProfiles(list)
    setAssignedProfileId(assignment?.pricingProfileId || "")
    setStrictPricing(Boolean(assignment?.strictPricing))
    if (nextSelectedId) setSelectedProfileId(nextSelectedId)
  }

  const createProfile = async () => {
    const name = newProfileName.trim()
    if (name.length < 2) {
      toast({ variant: "destructive", title: "Profile name required", description: "Use at least 2 characters." })
      return
    }

    setSavingProfile(true)
    try {
      const res = await fetch("/api/agent/pricing/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const response = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(response?.error?.message || response?.message || "Could not create profile")
      }

      const profile = response.data
      setNewProfileName("")
      await reloadProfileList(profile?.id)
      toast({ title: "Pricing profile created" })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Could not create profile",
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const assignProfile = async (profileId: string | null = assignedProfileId) => {
    setSavingProfile(true)
    try {
      const res = await fetch("/api/agent/pricing/profiles/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resellerId, profileId: profileId || null, strictPricing }),
      })
      const response = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(response?.error?.message || response?.message || "Could not assign profile")
      }

      await reloadProfileList(profileId || undefined)
      const prices = await fetch(`/api/reseller-prices?resellerId=${resellerId}`)
      if (prices.ok) {
        const priceResponse = await prices.json()
        const payload = priceResponse.data || {}
        if (Array.isArray(payload.products)) setProducts(payload.products)
      }
      toast({ title: profileId ? "Pricing profile assigned" : "Pricing profile cleared" })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Could not assign profile",
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const saveProfilePrice = async (productId: string, price: number) => {
    if (!selectedProfileId) return
    const row = profileRows.find((item) => item.productId === productId)
    const parentCost = row?.parentCost ?? 0
    if (price < parentCost) {
      toast({
        variant: "destructive",
        title: "Price below cost",
        description: `Profile price must be at least ${formatGhanaCedis(parentCost)}.`,
      })
      return
    }

    setSavingProfile(true)
    try {
      const res = await fetch(`/api/agent/pricing/profiles/${selectedProfileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, price }),
      })
      const response = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(response?.error?.message || response?.message || "Could not update profile price")
      }

      setProfileRows((prev) => prev.map((item) => item.productId === productId ? { ...item, profilePrice: price } : item))
      setProducts((prev) => prev.map((item) => item.id === productId ? { ...item, profilePrice: price } : item))
      toast({ title: "Profile price updated" })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Could not update profile price",
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const savePrice = async (productId: string, price: number) => {
    const product = products.find((item) => item.id === productId)
    const parentCost = product?.parentCost ?? product?.price ?? 0
    if (price < parentCost) {
      toast({
        variant: "destructive",
        title: "Price below cost",
        description: `Reseller price must be at least ${formatGhanaCedis(parentCost)}.`,
      })
      return
    }

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

  const pricingSummary = useMemo(() => {
    const configured = products.filter((product) => resellerPrices[product.id] !== undefined).length
    const profileDefaults = products.filter((product) => product.profilePrice !== undefined).length
    const margins = products.map((product) => {
      const parentCost = product.parentCost ?? product.price
      const defaultPrice = product.effectiveDefaultPrice ?? product.profilePrice ?? parentCost
      const sellingPrice = resellerPrices[product.id] ?? defaultPrice
      return Math.max(sellingPrice - parentCost, 0)
    })
    const averageMargin = margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0
    return { configured, profileDefaults, total: products.length, averageMargin }
  }, [products, resellerPrices])

  const marginPercent = (sellingPrice: number, costPrice: number) => {
    if (sellingPrice <= 0) return 0
    return (Math.max(sellingPrice - costPrice, 0) / sellingPrice) * 100
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
    <div className="portal-page space-y-6">
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

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
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
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive",
              ].join(" ")}
            >
              {reseller.active !== false ? "Active" : "Inactive"}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <div className="table-scroll hidden md:block">
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
          <CardTitle className="text-sm font-semibold">Reseller pricing profile</CardTitle>
          <CardDescription className="text-xs">
            Assign a reusable default price sheet to this reseller. Use individual overrides below only for special exceptions.
          </CardDescription>
          <div className="grid min-w-0 gap-3 pt-3 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Create profile</p>
              <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Example: Retail reseller"
                  className="h-9 text-xs"
                />
                <Button type="button" size="sm" onClick={createProfile} disabled={savingProfile} className="h-9 shrink-0">
                  Create
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                New profiles start with your current agent cost as the reseller buy price.
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned to this reseller</p>
              <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[1fr_auto]">
                <select
                  value={assignedProfileId}
                  onChange={(e) => {
                    setAssignedProfileId(e.target.value)
                    if (e.target.value) setSelectedProfileId(e.target.value)
                  }}
                  className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="">No assigned profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
                <Button type="button" size="sm" onClick={() => assignProfile()} disabled={savingProfile} className="h-9">
                  Save assignment
                </Button>
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={strictPricing}
                  onChange={(e) => setStrictPricing(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>
                  Profile only. Products missing from the profile will be hidden for this reseller until added to the profile.
                </span>
              </label>
              {assignedProfileId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => assignProfile(null)}
                  disabled={savingProfile}
                  className="mt-3 h-8 text-xs"
                >
                  Clear assignment
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reseller pricing profiles yet. Create one above, assign it to this reseller, then adjust the prices here.
            </p>
          ) : (
            <>
              <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold">Edit profile prices</p>
                  <p className="text-[11px] text-muted-foreground">
                    These prices become the reseller&apos;s default buy prices unless an override below is saved.
                  </p>
                </div>
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-xs sm:w-64"
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.itemCount})
                    </option>
                  ))}
                </select>
              </div>

              {filteredProfileRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products available in this profile for {activeProvider}.</p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {filteredProfileRows.map((row) => {
                      const profit = Math.max(row.profilePrice - row.parentCost, 0)
                      return (
                        <div key={row.productId} className="rounded-lg border bg-background p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{row.productName}</p>
                              <p className="text-[11px] text-muted-foreground">{row.network}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">Cost: {formatGhanaCedis(row.parentCost)}</p>
                          </div>
                          <div className="mt-2">
                            <p className="text-[11px] text-muted-foreground">Profile reseller buy price</p>
                            <Input
                              type="number"
                              step="0.01"
                              min={row.parentCost}
                              className="mt-1 h-8 text-xs"
                              defaultValue={row.profilePrice}
                              onBlur={(e) => {
                                const val = parseFloat(e.currentTarget.value)
                                if (Number.isNaN(val) || Math.abs(val - row.profilePrice) < 0.0001) return
                                saveProfilePrice(row.productId, val)
                              }}
                            />
                          </div>
                          <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs">
                            <p className="font-medium">{formatGhanaCedis(profit)}</p>
                            <p className="text-muted-foreground">Default profit per order</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="table-scroll hidden md:block">
                    <Table className="min-w-full text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Network</TableHead>
                          <TableHead className="text-right">Agent cost</TableHead>
                          <TableHead className="text-right">Profile price</TableHead>
                          <TableHead className="text-right">Default profit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProfileRows.map((row) => {
                          const profit = Math.max(row.profilePrice - row.parentCost, 0)
                          return (
                            <TableRow key={row.productId}>
                              <TableCell className="font-medium text-xs">{row.productName}</TableCell>
                              <TableCell className="text-xs">{row.network}</TableCell>
                              <TableCell className="text-right text-xs">{formatGhanaCedis(row.parentCost)}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={row.parentCost}
                                  className="ml-auto h-7 w-28 text-right text-xs"
                                  defaultValue={row.profilePrice}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.currentTarget.value)
                                    if (Number.isNaN(val) || Math.abs(val - row.profilePrice) < 0.0001) return
                                    saveProfilePrice(row.productId, val)
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-right text-xs">{formatGhanaCedis(profit)}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
              {savingProfile && <p className="mt-2 text-xs text-muted-foreground">Saving profile changes...</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Pricing overrides</CardTitle>
          <CardDescription className="text-xs">
            Set one-off reseller buy prices only where this reseller should differ from the assigned profile.
          </CardDescription>
          <div className="grid min-w-0 gap-3 pt-3 md:grid-cols-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Overrides</p>
              <p className="mt-1 text-lg font-semibold">{pricingSummary.configured}/{pricingSummary.total}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Profile defaults</p>
              <p className="mt-1 text-lg font-semibold">{pricingSummary.profileDefaults}/{pricingSummary.total}</p>
            </div>
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Rule</p>
              <p className="mt-1 text-xs text-muted-foreground">Override prices must stay equal to or above your agent cost.</p>
            </div>
          </div>
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
                  const parentCost = product.parentCost ?? product.price
                  const hasOverride = resellerPrices[product.id] !== undefined
                  const defaultPrice = product.effectiveDefaultPrice ?? product.profilePrice ?? parentCost
                  const current = hasOverride ? resellerPrices[product.id] : defaultPrice
                  const sourceLabel = hasOverride
                    ? "Override"
                    : product.blockedByStrictProfile
                      ? "Profile required"
                      : product.profilePrice !== undefined
                        ? "Profile default"
                        : "Parent cost"
                  const profit = Math.max(current - parentCost, 0)
                  return (
                    <div key={product.id} className="rounded-lg border bg-background p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{product.name}</p>
                          <p className="text-[11px] text-muted-foreground">{product.provider} · {sourceLabel}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">Cost: {formatGhanaCedis(parentCost)}</p>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] text-muted-foreground">Reseller buy price</p>
                        <Input
                          type="number"
                          step="0.01"
                          min={parentCost}
                          className="h-8 text-xs"
                          defaultValue={current}
                          disabled={product.blockedByStrictProfile}
                          onBlur={(e) => {
                            const val = parseFloat(e.currentTarget.value)
                            if (Number.isNaN(val)) return
                            const previous = current
                            if (Math.abs(val - previous) < 0.0001) return
                            savePrice(product.id, val)
                          }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2 text-xs">
                        <div>
                          <p className="font-semibold text-foreground">{formatGhanaCedis(profit)}</p>
                          <p className="text-muted-foreground">Profit/order</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-primary">{marginPercent(current, parentCost).toFixed(1)}%</p>
                          <p className="text-muted-foreground">Margin</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="table-scroll hidden md:block">
                <Table className="min-w-full text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Parent cost</TableHead>
                  <TableHead className="text-right">Reseller buy price</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const parentCost = product.parentCost ?? product.price
                  const hasOverride = resellerPrices[product.id] !== undefined
                  const defaultPrice = product.effectiveDefaultPrice ?? product.profilePrice ?? parentCost
                  const current = hasOverride ? resellerPrices[product.id] : defaultPrice
                  const sourceLabel = hasOverride
                    ? "Override"
                    : product.blockedByStrictProfile
                      ? "Profile required"
                      : product.profilePrice !== undefined
                        ? "Profile default"
                        : "Parent cost"
                  const profit = Math.max(current - parentCost, 0)
                  return (
                    <TableRow key={product.id} className="hover:bg-muted/50 transition">
                      <TableCell className="font-medium text-xs">
                        <div>
                          <p>{product.name}</p>
                          <p className="text-[11px] font-normal text-muted-foreground">{sourceLabel}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs">{formatGhanaCedis(parentCost)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={parentCost}
                          className="h-7 text-xs w-28 text-right ml-auto"
                          defaultValue={current}
                          disabled={product.blockedByStrictProfile}
                          onBlur={(e) => {
                            const val = parseFloat(e.currentTarget.value)
                            if (Number.isNaN(val)) return
                            const previous = current
                            if (Math.abs(val - previous) < 0.0001) return
                            savePrice(product.id, val)
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div>
                          <p className="font-medium">{formatGhanaCedis(profit)}</p>
                          <p className="text-[11px] text-muted-foreground">{marginPercent(current, parentCost).toFixed(1)}%</p>
                        </div>
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
    </div>
  )
}

