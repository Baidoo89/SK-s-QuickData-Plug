"use client"

import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { parsePriceCents, type CatalogBundle } from "@/lib/catalog-pricing"

export const CATALOG_NETWORKS = [{ id: "MTN", name: "MTN" }, { id: "TELECEL", name: "Telecel" }, { id: "AIRTELTIGO", name: "AirtelTigo" }]
const money = (amount: number) => `GHS ${amount.toFixed(2)}`

export function BundleEditor({ bundle, initialNetwork, onClose, onSaved }: {
  bundle: CatalogBundle | null
  initialNetwork: string
  onClose: () => void
  onSaved: (bundle: CatalogBundle) => void
}) {
  const [name, setName] = useState(bundle?.name ?? "")
  const [provider, setProvider] = useState(bundle?.provider ?? initialNetwork)
  const [baseText, setBaseText] = useState(bundle && bundle.hasBasePrice !== false ? String(bundle.basePrice ?? bundle.price) : "")
  const [shopText, setShopText] = useState(bundle && bundle.hasStorefrontPrice !== false ? String(bundle.storefrontPrice ?? bundle.price) : "")
  const [active, setActive] = useState(bundle?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const submitting = useRef(false)
  const baseCents = parsePriceCents(baseText)
  const shopCents = parsePriceCents(shopText)
  const difference = baseCents !== null && shopCents !== null ? (shopCents - baseCents) / 100 : null

  async function save(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    if (!name.trim()) { setError("Enter a bundle name, such as 1 GB or 500 MB."); return }
    if (!CATALOG_NETWORKS.some(network => network.id === provider) && provider !== bundle?.provider) { setError("Choose a network."); return }
    if (baseCents === null) { setError("Enter a base price of zero or more, using up to two decimal places."); return }
    if (shopCents === null) { setError("Enter a shop price of zero or more, using up to two decimal places."); return }
    if (shopCents < baseCents) { setError("The shop price cannot be below the base price. Check both amounts before saving."); return }
    const values = {
      name: name.trim(), provider, category: "DATA_BUNDLE", bundleType: bundle?.bundleType ?? "DATA",
      description: bundle?.description ?? "", basePrice: baseCents / 100, storefrontPrice: shopCents / 100,
      // Preserve the legacy default price when editing. Assigned team prices
      // continue to be resolved by the existing server-side pricing rules.
      price: bundle?.price ?? shopCents / 100, active,
    }
    submitting.current = true
    setSaving(true)
    setError("")
    try {
      const response = await fetch(bundle ? `/api/products/${encodeURIComponent(bundle.id)}` : "/api/products", {
        method: bundle ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Could not save this bundle. Your changes are still here.")
      const saved = payload?.data ?? payload
      if (!saved?.id) throw new Error("The save response could not be confirmed. Close this form and refresh the bundle list before trying again.")
      onSaved({ ...bundle, ...saved, ...values, id: saved.id, hasBasePrice: true, hasStorefrontPrice: true })
    } catch (cause) {
      setError(cause instanceof TypeError ? "Could not reach the service. Your entries are still here. Refresh the bundle list before retrying an interrupted save." : cause instanceof Error ? cause.message : "Could not save this bundle.")
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{bundle ? "Edit bundle" : "Add a bundle"}</DialogTitle><DialogDescription>Choose the network and prices. Your changes take effect when you save.</DialogDescription></DialogHeader>
        <form onSubmit={save} noValidate className="space-y-5">
          <fieldset disabled={saving} className="space-y-4">
            <div className="space-y-2"><label htmlFor="catalog-network" className="text-sm font-semibold">Network</label><select id="catalog-network" value={provider} onChange={event => setProvider(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{CATALOG_NETWORKS.map(network => <option key={network.id} value={network.id}>{network.name}</option>)}{bundle && !CATALOG_NETWORKS.some(network => network.id === bundle.provider) && <option value={bundle.provider}>{bundle.provider}</option>}</select></div>
            <div className="space-y-2"><label htmlFor="catalog-name" className="text-sm font-semibold">Bundle name</label><Input id="catalog-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. 1 GB or 500 MB" required className="h-11" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><label htmlFor="catalog-base" className="text-sm font-semibold">Base price (GHS)</label><Input id="catalog-base" inputMode="decimal" value={baseText} onChange={event => setBaseText(event.target.value)} placeholder="e.g. 4.00" aria-describedby="catalog-base-help" required className="h-11" /><p id="catalog-base-help" className="text-xs leading-5 text-muted-foreground">Used as your cost estimate and the starting price for team purchases.</p></div>
              <div className="space-y-2"><label htmlFor="catalog-shop" className="text-sm font-semibold">Shop price (GHS)</label><Input id="catalog-shop" inputMode="decimal" value={shopText} onChange={event => setShopText(event.target.value)} placeholder="e.g. 5.00" aria-describedby="catalog-shop-help" required className="h-11" /><p id="catalog-shop-help" className="text-xs leading-5 text-muted-foreground">What customers pay through your shop link.</p></div>
            </div>
            <section aria-label="Pricing summary" className="space-y-2 rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm">
              <p className="flex flex-wrap justify-between gap-2"><span>Difference before fees</span><strong>{difference === null ? "Enter both prices" : money(difference)}</strong></p><p className="text-xs leading-5 text-muted-foreground">Shop price minus base price. Payment and delivery fees can reduce this amount.</p>
              {shopCents === 0 && <p className="text-sm text-warning">A zero shop price means the customer would pay GHS 0.00. Check this amount before saving.</p>}
            </section>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} className="h-4 w-4 accent-primary" /><span>Show this bundle in my shop</span></label>
            <p className="text-xs leading-5 text-muted-foreground">Active bundles appear in your shop and team purchase lists once shop setup is complete.</p>
            <details className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">How team prices work</summary><p className="mt-3 text-xs leading-5 text-muted-foreground">Agents and resellers start at the base price unless an assigned price group or individual price overrides it. Changing the base price can change what they pay. <Link href="/dashboard/products?tab=pricing_profiles" className="text-primary underline">Manage price groups</Link> after saving your changes.</p></details>
          </fieldset>
          {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving bundle..." : "Save bundle"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
