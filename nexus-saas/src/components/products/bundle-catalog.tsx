"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BundleEditor, CATALOG_NETWORKS } from "@/components/products/bundle-editor"
import { bundleDifference, bundleIssues, parsePriceCents, type CatalogBundle } from "@/lib/catalog-pricing"
import { PageHeader } from "@/components/ui/page-header"

const money = (value: number) => Number.isFinite(value) ? `GHS ${value.toFixed(2)}` : "Not set"
type PriceEdit = { base: string; shop: string; error?: string }

export function BundleCatalog() {
  const [products, setProducts] = useState<CatalogBundle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const [network, setNetwork] = useState("ALL")
  const [query, setQuery] = useState("")
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [editing, setEditing] = useState<CatalogBundle | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const [priceEdits, setPriceEdits] = useState<Record<string, PriceEdit>>({})
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch("/api/products", { signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Could not load your bundles.")
        const data = payload?.data ?? payload
        if (!Array.isArray(data)) throw new Error("Could not read the bundle list. Please refresh it.")
        if (!controller.signal.aborted) setProducts(data)
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof TypeError ? "Could not reach the service. Check your connection and try again." : cause.message || "Could not load your bundles.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  const bundles = useMemo(() => products.filter(product => product.category === "DATA_BUNDLE"), [products])
  const needsAttention = bundles.filter(bundle => bundleIssues(bundle).length > 0).length
  const visible = bundles.filter(bundle => (network === "ALL" || bundle.provider === network) && (!attentionOnly || bundleIssues(bundle).length > 0) && `${bundle.name} ${bundle.provider}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  function openEditor(bundle: CatalogBundle | null) {
    setEditing(bundle)
    setEditorOpen(true)
    setNotice("")
  }

  function saved(bundle: CatalogBundle) {
    setProducts(current => current.some(item => item.id === bundle.id) ? current.map(item => item.id === bundle.id ? bundle : item) : [bundle, ...current])
    setEditorOpen(false)
    setNotice(`${bundle.name} saved. ${bundle.active ? "The bundle is active." : "The bundle is hidden from your shop."}`)
  }

  function beginPriceEdit(bundle: CatalogBundle) {
    setPriceEdits(current => ({
      ...current,
      [bundle.id]: {
        base: bundle.hasBasePrice === false ? "" : String(bundle.basePrice ?? bundle.price ?? ""),
        shop: bundle.hasStorefrontPrice === false ? "" : String(bundle.storefrontPrice ?? bundle.price ?? ""),
      },
    }))
    setNotice("")
  }

  function cancelPriceEdit(id: string) {
    setPriceEdits(current => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  function updatePriceEdit(id: string, field: "base" | "shop", value: string) {
    setPriceEdits(current => ({ ...current, [id]: { ...current[id], [field]: value, error: undefined } }))
  }

  async function savePrices(bundle: CatalogBundle) {
    const draft = priceEdits[bundle.id]
    if (!draft || savingPriceId) return
    const baseCents = parsePriceCents(draft.base)
    const shopCents = parsePriceCents(draft.shop)
    const invalid = baseCents === null
      ? "Enter a base price of zero or more, using up to two decimal places."
      : shopCents === null
        ? "Enter a shop price of zero or more, using up to two decimal places."
        : shopCents < baseCents
          ? "The shop price cannot be below the base price."
          : ""
    if (invalid) {
      setPriceEdits(current => ({ ...current, [bundle.id]: { ...current[bundle.id], error: invalid } }))
      return
    }
    if (baseCents === null || shopCents === null) return
    setSavingPriceId(bundle.id)
    setNotice("")
    try {
      const values = {
        name: bundle.name,
        provider: bundle.provider,
        category: bundle.category,
        bundleType: bundle.bundleType ?? "DATA",
        description: bundle.description ?? "",
        basePrice: baseCents / 100,
        storefrontPrice: shopCents / 100,
        // Keep the legacy default price used by existing team pricing rules.
        price: bundle.price ?? shopCents / 100,
        active: bundle.active,
      }
      const response = await fetch(`/api/products/${encodeURIComponent(bundle.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Could not save these prices.")
      const savedBundle = payload?.data ?? payload
      if (!savedBundle?.id) throw new Error("The save response could not be confirmed. Refresh the bundle list before trying again.")
      const updated = { ...bundle, ...savedBundle, ...values, id: savedBundle.id, hasBasePrice: true, hasStorefrontPrice: true }
      setProducts(current => current.map(item => item.id === bundle.id ? updated : item))
      cancelPriceEdit(bundle.id)
      setNotice(`${bundle.name} prices saved.`)
    } catch (cause) {
      setPriceEdits(current => ({
        ...current,
        [bundle.id]: {
          ...current[bundle.id],
          error: cause instanceof TypeError ? "Could not reach the service. Your entries are still here." : cause instanceof Error ? cause.message : "Could not save these prices.",
        },
      }))
    } finally {
      setSavingPriceId(null)
    }
  }

  return (
    <div className="portal-page mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Products & prices"
        description="Manage bundles and shop prices."
        actions={<Button onClick={() => openEditor(null)} disabled={loading || Boolean(error)} className="min-h-11 shrink-0"><Plus className="mr-2 h-4 w-4" />Add a bundle</Button>}
      />
      <div role="status" className={notice ? "rounded-lg border border-success/30 bg-success/10 p-3 text-sm" : "sr-only"}>{notice}</div>
      {loading ? <p role="status" className="rounded-lg border border-border p-6 text-sm text-muted-foreground">Loading your bundles...</p> : error ? <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-5 text-sm"><p>{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>Try loading again</Button></div> : <>
        <section aria-label="Catalog overview" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <div className="rounded-lg border border-border bg-card p-3 sm:p-4"><p className="text-xl font-bold sm:text-2xl">{bundles.length}</p><p className="text-xs text-muted-foreground sm:text-sm">Total bundles</p></div><div className="rounded-lg border border-border bg-card p-3 sm:p-4"><p className="text-xl font-bold sm:text-2xl">{bundles.filter(bundle => bundle.active).length}</p><p className="text-xs text-muted-foreground sm:text-sm">Active bundles</p></div><button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)} className={`rounded-lg border p-3 text-left sm:p-4 ${attentionOnly ? "border-primary bg-primary/10" : "border-border bg-card"}`}><p className="text-xl font-bold sm:text-2xl">{needsAttention}</p><p className="text-xs text-muted-foreground sm:text-sm">Need a price review{attentionOnly ? " · showing these" : " · view bundles"}</p></button>
        </section>
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5" aria-label="Your bundles">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2"><label htmlFor="catalog-search" className="block text-sm font-medium">Find a bundle</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="catalog-search" type="search" placeholder="Search by name or network" value={query} onChange={event => setQuery(event.target.value)} className="h-11 pl-9" /></div></div>
            <div className="space-y-2"><label htmlFor="catalog-filter-network" className="block text-sm font-medium">Network</label><select id="catalog-filter-network" value={network} onChange={event => setNetwork(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm lg:w-44"><option value="ALL">All networks</option>{CATALOG_NETWORKS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <Button variant="outline" className="h-11" onClick={() => { setNotice(""); setReload(value => value + 1) }}><RefreshCw className="mr-2 h-4 w-4" />Refresh list</Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">Base = team cost · Shop = customer price. Difference is before fees.</p>
          {visible.length ? <ul className="space-y-3">{visible.map(bundle => {
            const issues = bundleIssues(bundle)
            const difference = bundleDifference(bundle)
            const priceEdit = priceEdits[bundle.id]
            return <li key={bundle.id} className="min-w-0 rounded-lg border border-border bg-background/50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h2 className="break-words text-lg font-semibold">{bundle.name}</h2><p className="text-xs text-muted-foreground">{CATALOG_NETWORKS.find(item => item.id === bundle.provider)?.name ?? bundle.provider} · {bundle.active ? "Active" : "Hidden from shop"}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => beginPriceEdit(bundle)} aria-label={`Edit prices for ${bundle.provider} ${bundle.name}`} className="min-h-11">Edit prices</Button><Button variant="ghost" onClick={() => openEditor(bundle)} aria-label={`Edit ${bundle.provider} ${bundle.name}`} className="min-h-11">Edit bundle</Button></div></div>{priceEdit ? <div className="mt-4 space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1"><label htmlFor={`base-price-${bundle.id}`} className="text-xs font-medium">Base price</label><Input id={`base-price-${bundle.id}`} aria-label={`Base price for ${bundle.provider} ${bundle.name}`} inputMode="decimal" value={priceEdit.base} onChange={event => updatePriceEdit(bundle.id, "base", event.target.value)} className="h-10" /></div><div className="space-y-1"><label htmlFor={`shop-price-${bundle.id}`} className="text-xs font-medium">Shop price</label><Input id={`shop-price-${bundle.id}`} aria-label={`Shop price for ${bundle.provider} ${bundle.name}`} inputMode="decimal" value={priceEdit.shop} onChange={event => updatePriceEdit(bundle.id, "shop", event.target.value)} className="h-10" /></div></div>{priceEdit.error && <p role="alert" className="text-xs text-destructive">{priceEdit.error}</p>}<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Difference: {(() => { const base = parsePriceCents(priceEdit.base); const shop = parsePriceCents(priceEdit.shop); return base !== null && shop !== null ? money((shop - base) / 100) : "Enter both prices" })()}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => cancelPriceEdit(bundle.id)} disabled={savingPriceId === bundle.id}>Cancel</Button><Button size="sm" onClick={() => savePrices(bundle)} disabled={savingPriceId === bundle.id}>{savingPriceId === bundle.id ? "Saving..." : "Save prices"}</Button></div></div></div> : <><dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Base price</dt><dd className="mt-1 font-semibold">{bundle.hasBasePrice === false ? "Not set" : money(bundle.basePrice ?? bundle.price)}</dd></div><div><dt className="text-xs text-muted-foreground">Shop price</dt><dd className="mt-1 font-semibold">{bundle.hasStorefrontPrice === false ? "Using default price" : money(bundle.storefrontPrice ?? bundle.price)}</dd></div><div><dt className="text-xs text-muted-foreground">Difference before fees</dt><dd className="mt-1 font-semibold">{difference === null ? "Set the base price first" : money(difference)}</dd></div></dl>{issues.length > 0 && <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"><p className="font-medium">Needs a price review</p><ul className="mt-1 list-inside list-disc text-xs leading-6">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}</>}</li>
          })}</ul> : <div className="space-y-3 py-8 text-center"><h2 className="text-lg font-semibold">{bundles.length ? "No bundles match these filters" : "Add your first bundle"}</h2><p className="text-sm text-muted-foreground">{bundles.length ? "Try another network or clear your search and price-review filter." : "Choose a network, give the bundle a name, and set its base and shop prices."}</p>{bundles.length ? <Button variant="outline" onClick={() => { setNetwork("ALL"); setQuery(""); setAttentionOnly(false) }}>Clear filters</Button> : <Button onClick={() => openEditor(null)}>Add your first bundle</Button>}</div>}
        </section>
      </>}
      <details className="rounded-lg border border-border bg-card p-4 text-sm"><summary className="cursor-pointer font-semibold">Advanced tools</summary><p className="mt-3 text-xs leading-6 text-muted-foreground">Price groups, services, and advanced catalog controls.</p><div className="mt-3 flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/dashboard/products?tab=pricing_profiles">Price groups</Link></Button><Button asChild variant="outline"><Link href="/dashboard/products?tab=advanced#service-forms">Services &amp; advanced</Link></Button></div></details>
      {editorOpen && <BundleEditor key={editing?.id ?? `new-${network}`} bundle={editing} initialNetwork={network === "ALL" ? "MTN" : network} onClose={() => setEditorOpen(false)} onSaved={saved} />}
    </div>
  )
}
