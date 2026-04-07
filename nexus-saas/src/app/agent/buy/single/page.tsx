"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { CheckCircle, Smartphone } from "lucide-react"

function formatGhanaCedis(value: number): string {
  return `GH₵ ${value.toFixed(2)}`
}

function formatBundleLabel(name: string) {
  const match = name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)
  return match ? match[0].replace(/\s+/g, "").toUpperCase() : name
}

export default function AgentBuySinglePage() {
  const { toast } = useToast()
  const [phone, setPhone] = useState("")
  const [networks, setNetworks] = useState<{ id: string; name: string }[]>([])
  const [selectedNetwork, setSelectedNetwork] = useState("")
  const [bundles, setBundles] = useState<any[]>([])
  const [selectedBundle, setSelectedBundle] = useState("")
  const [loadingBundles, setLoadingBundles] = useState(false)
  const [buying, setBuying] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState<any>(null)

  // Load networks on mount
  useEffect(() => {
    async function loadNetworks() {
      try {
        const res = await fetch("/api/networks")
        if (!res.ok) return
        const payload = await res.json()
        const networkList = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : []

        setNetworks(networkList)
      } catch (error) {
        console.error("Failed to load networks:", error)
      }
    }
    loadNetworks()
  }, [])

  // Load bundles when network changes
  useEffect(() => {
    async function loadBundles() {
      if (!selectedNetwork) {
        setBundles([])
        return
      }
      setLoadingBundles(true)
      try {
        const res = await fetch(
          `/api/bundles?networkId=${encodeURIComponent(selectedNetwork)}`
        )
        if (!res.ok) return
        const payload = await res.json()
        let data = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : []

        // Sort by size
        data = data.sort((a: any, b: any) => {
          function parseSize(s: string) {
            const match = s.match(/(\d+(?:\.\d+)?)(GB|MB)/i)
            if (!match) return 0
            let val = parseFloat(match[1])
            if (match[2].toUpperCase() === "GB") return val * 1000
            return val
          }
          return parseSize(a.name) - parseSize(b.name)
        })

        setBundles(data)
        setSelectedBundle("")
      } catch (error) {
        console.error("Failed to load bundles:", error)
      } finally {
        setLoadingBundles(false)
      }
    }
    loadBundles()
  }, [selectedNetwork])

  // Get selected bundle details
  const selectedBundleObj = bundles.find((b) => b.id === selectedBundle)
  const totalCost = selectedBundleObj ? selectedBundleObj.effectivePrice : 0
  const selectedNetworkObj = networks.find((n) => n.id === selectedNetwork)

  async function handleSingleBuy(e: React.FormEvent) {
    e.preventDefault()
    if (!phone || !selectedBundle) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      })
      return
    }

    const shouldContinue = window.confirm(
      `Confirm purchase for ${phone.trim()}?\nBundle: ${formatBundleLabel(selectedBundleObj?.name ?? "Selected bundle")}\nAmount: ${formatGhanaCedis(totalCost)}`
    )
    if (!shouldContinue) {
      return
    }

    setBuying(true)
    setOrderSuccess(null)
    try {
      const res = await fetch("/api/agent/buy-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          bundleId: selectedBundle,
          quantity: 1,
        }),
      })

      if (!res.ok) {
        const errorResponse = await res.json()
        const errorMessage = errorResponse.error?.message || errorResponse.message || "Purchase failed"
        throw new Error(errorMessage)
      }

      const data = await res.json()
      const order = data.data

      setOrderSuccess(order)
      setPhone("")

      toast({
        title: "Success",
        description: `Order ${order.orderId} created!`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not complete purchase",
        variant: "destructive",
      })
    } finally {
      setBuying(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 md:p-8">
      <div>
        {/* Header */}
        <div className="mb-2 space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Buy data</h1>
          <p className="text-sm text-muted-foreground">Create a single purchase with guided pricing and confirmation.</p>
        </div>

        {/* Main Card */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-base">Single purchase</CardTitle>
          </CardHeader>

          <CardContent className="pt-6">
            {!orderSuccess ? (
              <form className="space-y-5" onSubmit={handleSingleBuy}>
                {/* Network Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Network</label>
                  <div className="flex flex-wrap gap-2">
                    {networks.map((n) => {
                      const active = selectedNetwork === n.id
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setSelectedNetwork(n.id)
                            setSelectedBundle("")
                          }}
                          className={[
                            "rounded-full px-3 py-1 text-xs font-semibold transition",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80",
                          ].join(" ")}
                        >
                          {n.name}
                        </button>
                      )
                    })}
                  </div>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                    value={selectedNetwork}
                    onChange={(e) => {
                      setSelectedNetwork(e.target.value)
                      setSelectedBundle("")
                    }}
                    disabled={networks.length === 0}
                  >
                    <option value="">Select network</option>
                    {networks.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                  {networks.length === 0 && (
                    <p className="text-xs text-red-500">No networks available</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Showing bundles for {selectedNetworkObj?.name || "selected network"}
                  </p>
                </div>

                {/* Bundle Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Bundle</label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                    value={selectedBundle}
                    onChange={(e) => setSelectedBundle(e.target.value)}
                    disabled={!selectedNetwork || loadingBundles || bundles.length === 0}
                  >
                    <option value="">Select bundle</option>
                    {bundles.map((b) => {
                      // Extract size from name (e.g., "1GB Bundle" → "1GB")
                      const sizeMatch = b.name.match(/^[\d.]+\s*[A-Z]+/)
                      const size = sizeMatch ? sizeMatch[0] : b.name
                      return (
                        <option key={b.id} value={b.id}>
                          {size} – {formatGhanaCedis(b.effectivePrice)}
                        </option>
                      )
                    })}
                  </select>
                  {bundles.length === 0 && !loadingBundles && selectedNetwork && (
                    <p className="text-xs text-yellow-600">No bundles available for {selectedNetworkObj?.name}</p>
                  )}
                  {loadingBundles && (
                    <p className="text-xs text-blue-600">Loading bundles...</p>
                  )}
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Recipient phone number</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+233501234567"
                      className="pl-9 py-3 text-sm"
                      autoComplete="tel"
                      inputMode="tel"
                    />
                  </div>
                </div>

                {/* Price Summary */}
                {selectedBundleObj && (
                  <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-slate-700">Recipient number:</span>
                      <span className="font-semibold text-slate-900">{phone.trim() || "-"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-700">Total cost:</span>
                      <span className="text-2xl font-bold text-blue-600">{formatGhanaCedis(totalCost)}</span>
                    </div>
                  </div>
                )}

                {/* Buy Button */}
                <Button
                  type="submit"
                  disabled={buying || !selectedBundle || !phone}
                  className="mt-2 h-10 w-full text-sm font-semibold"
                >
                  {buying ? "Processing..." : "Complete Purchase"}
                </Button>
              </form>
            ) : (
              /* Success Message */
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-center">
                  <div className="flex justify-center mb-4">
                    <CheckCircle className="w-12 h-12 text-green-600" />
                  </div>
                  <h3 className="text-lg font-bold text-green-700 mb-2">Order Created!</h3>
                  <p className="text-sm text-green-600 mb-4">Your data bundle has been ordered successfully.</p>
                </div>

                <div className="space-y-3 rounded-lg bg-slate-50 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Order ID:</span>
                    <span className="font-mono font-semibold text-slate-900">{orderSuccess.orderId}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-between text-sm">
                    <span className="text-slate-600">Bundle:</span>
                    <span className="font-semibold text-slate-900">{formatBundleLabel(orderSuccess.bundle)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Phone:</span>
                    <span className="font-semibold text-slate-900">{orderSuccess.phone}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Amount:</span>
                    <span className="font-bold text-blue-600">{formatGhanaCedis(orderSuccess.total)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                    <span className="text-slate-600">Status:</span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
                      {orderSuccess.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Dispatch:</span>
                    <span className="font-semibold text-slate-900">{orderSuccess.dispatchMode || "MANUAL"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Provider:</span>
                    <span className="font-semibold text-slate-900">{orderSuccess.dispatchProvider || "Manual Queue"}</span>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    setOrderSuccess(null)
                    setPhone("")
                  }}
                  className="w-full"
                >
                  Buy Another Bundle
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer Info */}
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Your wallet will be debited upon successful order confirmation.
        </p>
      </div>
    </div>
  )
}
