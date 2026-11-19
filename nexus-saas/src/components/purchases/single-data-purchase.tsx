"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SellingAccessAlert } from "@/components/access/selling-access-alert"

type Network = { id: string; name: string }
type Bundle = { id: string; name: string; effectivePrice: number }
type SellingAccess = { canSell: boolean; reason?: string | null }
type PurchaseRole = "owner" | "agent" | "reseller"
type Order = { orderId: string; phone: string; bundle: string; total: number; status: string }
const money = (amount: number) => `GHS ${amount.toFixed(2)}`

function normalizePhone(input: string) {
  if (!/^[+\d\s()-]+$/.test(input)) return null
  const digits = input.replace(/\D/g, "")
  if (/^233\d{9}$/.test(digits)) return `0${digits.slice(3)}`
  return /^0\d{9}$/.test(digits) ? digits : null
}

function sizeInMb(name: string) {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[1]) * ({ TB: 1e6, GB: 1000, MB: 1, KB: 0.001 }[match[2].toUpperCase()] ?? 1)
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error?.message || body?.message || "Something went wrong. Please try again.")
  return body?.data ?? body
}

export function SingleDataPurchase({ role }: { role: PurchaseRole }) {
  const [networks, setNetworks] = useState<Network[]>([])
  const [networkId, setNetworkId] = useState("")
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [bundleId, setBundleId] = useState("")
  const [phone, setPhone] = useState("")
  const [networksLoading, setNetworksLoading] = useState(true)
  const [bundlesLoading, setBundlesLoading] = useState(false)
  const [networkError, setNetworkError] = useState("")
  const [bundleError, setBundleError] = useState("")
  const [formError, setFormError] = useState("")
  const [purchaseError, setPurchaseError] = useState("")
  const [networkRetry, setNetworkRetry] = useState(0)
  const [bundleRetry, setBundleRetry] = useState(0)
  const [sellingAccess, setSellingAccess] = useState<SellingAccess | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [buying, setBuying] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const submitting = useRef(false)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (role === "owner") return
    let active = true
    request<SellingAccess>("/api/selling-access/status")
      .then(data => { if (active) setSellingAccess(data) })
      .catch(() => { /* Purchase endpoints enforce selling access independently. */ })
    return () => { active = false }
  }, [role])

  useEffect(() => {
    const controller = new AbortController()
    setNetworksLoading(true)
    setNetworkError("")
    request<Network[]>("/api/networks", { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data)) throw new Error("Could not read the available networks.")
        if (!controller.signal.aborted) setNetworks(data)
      })
      .catch(error => { if (!controller.signal.aborted) setNetworkError(error.message || "Could not load networks.") })
      .finally(() => { if (!controller.signal.aborted) setNetworksLoading(false) })
    return () => controller.abort()
  }, [networkRetry])

  useEffect(() => {
    if (!networkId) return
    const controller = new AbortController()
    setBundlesLoading(true)
    setBundleError("")
    request<Bundle[]>(`/api/bundles?networkId=${encodeURIComponent(networkId)}`, { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data)) throw new Error("Could not read the available bundles.")
        if (!controller.signal.aborted) setBundles([...data].sort((a, b) => sizeInMb(a.name) - sizeInMb(b.name)))
      })
      .catch(error => { if (!controller.signal.aborted) setBundleError(error.message || "Could not load bundles.") })
      .finally(() => { if (!controller.signal.aborted) setBundlesLoading(false) })
    return () => controller.abort()
  }, [networkId, bundleRetry])

  useEffect(() => { if (reviewing) reviewHeading.current?.focus() }, [reviewing])
  useEffect(() => { if (order) resultHeading.current?.focus() }, [order])

  const network = networks.find(item => item.id === networkId)
  const bundle = bundles.find(item => item.id === bundleId)
  const normalizedPhone = normalizePhone(phone)
  const blocked = role !== "owner" && sellingAccess?.canSell === false
  const portalBase = role === "owner" ? "/dashboard" : `/${role}`

  function review(event: FormEvent) {
    event.preventDefault()
    if (!bundle || !network) { setFormError("Choose a network and bundle first."); return }
    if (!normalizedPhone) { setFormError("Enter a 10-digit Ghana number, such as 0241234567, or use +233241234567."); return }
    setFormError("")
    setPurchaseError("")
    setReviewing(true)
  }

  async function buy() {
    if (submitting.current || blocked || !bundle || !normalizedPhone) return
    submitting.current = true
    setBuying(true)
    setPurchaseError("")
    try {
      const result = await request<Order & { phoneNumber?: string }>(role === "owner" ? "/api/vtu/order" : `/api/${role}/buy-data`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(role === "owner"
          ? { productId: bundle.id, phoneNumber: normalizedPhone, quantity: 1 }
          : { phone: normalizedPhone, bundleId: bundle.id, quantity: 1 }),
      })
      if (!result?.orderId) throw new Error("We could not confirm the order. Check your orders before trying again.")
      setOrder({
        orderId: result.orderId,
        phone: result.phone || result.phoneNumber || normalizedPhone,
        bundle: result.bundle || bundle.name,
        total: typeof result.total === "number" ? result.total : bundle.effectivePrice,
        status: result.status,
      })
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "We could not confirm the order.")
    } finally {
      submitting.current = false
      setBuying(false)
    }
  }

  return (
    <div className="portal-page mx-auto w-full max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-2"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Buy data</h1><p className="text-sm text-muted-foreground">Choose a bundle, add the recipient, then review before paying.</p></div>{role === "agent" && <Link href="/agent/buy/bulk" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">Buying for many numbers?</Link>}</div>
      {blocked && <SellingAccessAlert canSell={false} reason={sellingAccess.reason || "Ask your store owner to finish the shop setup."} />}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20"><CardTitle className="text-base">{order ? "Your order" : reviewing ? "Review your purchase" : "Buy for one number"}</CardTitle></CardHeader>
        <CardContent className="space-y-5 pt-6">
          {order ? (
            <div className="space-y-5">
              <div className="space-y-2"><CheckCircle2 className="h-9 w-9 text-primary" /><h2 ref={resultHeading} tabIndex={-1} className="text-xl font-semibold outline-none">Order recorded</h2><p className="text-sm text-muted-foreground">Follow the delivery status in Orders. Your order reference is below.</p></div>
              <dl className="space-y-3 rounded-lg bg-muted/40 p-4 text-sm">
                {[["Order reference", order.orderId], ["Recipient", order.phone], ["Bundle", order.bundle], ["Total", money(order.total)], ["Status", order.status === "COMPLETED" ? "Delivered" : order.status === "PROCESSING" ? "Delivery in progress" : order.status === "FAILED" ? "Delivery failed — check Orders for details" : order.status === "PENDING" ? "Waiting for processing" : order.status]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-medium">{value}</dd></div>)}
              </dl>
              <Button asChild className="w-full"><Link href={`${portalBase}/orders`}>Track in Orders</Link></Button>
              <Button variant="outline" className="w-full" onClick={() => { setOrder(null); setReviewing(false); setPhone(""); setPurchaseError("") }}>Buy another bundle</Button>
            </div>
          ) : reviewing && bundle ? (
            <div className="space-y-5">
              <h2 ref={reviewHeading} tabIndex={-1} className="text-xl font-semibold outline-none">Check the recipient and total</h2>
              <dl className="space-y-3 rounded-lg bg-muted/40 p-4 text-sm">{[["Network", network?.name], ["Bundle", bundle.name], ["Recipient", normalizedPhone], ["Wallet payment", money(bundle.effectivePrice)]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
              <p className="text-sm leading-6 text-muted-foreground">Confirming will charge your wallet. Double-check the recipient number. Delivery status will appear in Orders.</p>
              {purchaseError && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-4 text-sm"><p>{purchaseError}</p><Link href={`${portalBase}/orders`} className="font-medium text-primary underline">Check Orders before trying again</Link><p className="text-muted-foreground">If your balance is too low, <Link href={`${portalBase}/wallet`} className="text-primary underline">add funds to your wallet</Link>.</p></div>}
              <Button className="h-12 w-full" disabled={buying || blocked} onClick={buy}>{buying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{buying ? "Placing your order..." : `Confirm & pay ${money(bundle.effectivePrice)}`}</Button>
              <Button variant="outline" className="w-full" disabled={buying} onClick={() => { setReviewing(false); setPurchaseError("") }}>Edit details</Button>
            </div>
          ) : (
            <form onSubmit={review} className="space-y-6">
              <fieldset disabled={blocked} className="space-y-3"><legend className="mb-2 text-sm font-semibold">1. Choose your network</legend>
                {networksLoading && <p role="status" className="text-sm text-muted-foreground">Loading networks...</p>}
                {networkError && <div role="alert" className="space-y-2 text-sm"><p>{networkError}</p><Button type="button" variant="outline" onClick={() => setNetworkRetry(value => value + 1)}>Retry networks</Button></div>}
                {!networksLoading && !networkError && !networks.length && <p className="text-sm text-muted-foreground">No networks are available yet. Ask your store owner to add active bundles.</p>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{networks.map(item => <button key={item.id} type="button" aria-pressed={networkId === item.id} onClick={() => { if (networkId === item.id) return; setNetworkId(item.id); setBundleId(""); setBundles([]); setBundleError(""); setBundlesLoading(true); setFormError("") }} className={`min-h-12 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${networkId === item.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>{item.name}</button>)}</div>
              </fieldset>
              <div className="space-y-2"><label htmlFor="purchase-bundle" className="text-sm font-semibold">2. Choose your bundle</label>
                <select id="purchase-bundle" required value={bundleId} disabled={blocked || !networkId || bundlesLoading || !bundles.length || Boolean(bundleError)} onChange={event => setBundleId(event.target.value)} className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"><option value="">{!networkId ? "Choose a network first" : bundlesLoading ? "Loading bundles..." : "Choose a bundle"}</option>{bundles.map(item => <option key={item.id} value={item.id}>{item.name} · {money(item.effectivePrice)}</option>)}</select>
                {bundlesLoading && <p role="status" className="text-sm text-muted-foreground">Loading bundles...</p>}
                {bundleError && <div role="alert" className="space-y-2 text-sm"><p>{bundleError}</p><Button type="button" variant="outline" onClick={() => setBundleRetry(value => value + 1)}>Retry bundles</Button></div>}
                {networkId && !bundlesLoading && !bundleError && !bundles.length && <p className="text-sm text-muted-foreground">No bundles are available for {network?.name}. Choose another network or ask your store owner.</p>}
              </div>
              <div className="space-y-2"><label htmlFor="purchase-phone" className="text-sm font-semibold">3. Enter the recipient number</label><Input id="purchase-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0241234567" value={phone} onChange={event => { setPhone(event.target.value); setFormError("") }} required disabled={blocked} aria-describedby={formError ? "purchase-phone-help purchase-error" : "purchase-phone-help"} aria-invalid={Boolean(formError)} className="h-12" /><p id="purchase-phone-help" className="text-xs leading-5 text-muted-foreground">Use a Ghana number, such as 0241234567 or +233241234567. Choose the recipient’s network above.</p></div>
              {formError && <p id="purchase-error" role="alert" className="text-sm text-destructive">{formError}</p>}
              {bundle && <p className="flex flex-wrap justify-between gap-2 rounded-lg bg-primary/10 p-4 text-sm"><span>Total from your wallet</span><strong>{money(bundle.effectivePrice)}</strong></p>}
              <Button type="submit" className="h-12 w-full" disabled={blocked || !bundle || !phone.trim() || bundlesLoading}>Review purchase</Button>
              <p className="text-center text-xs text-muted-foreground">You’ll confirm the details before your wallet is charged.</p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
