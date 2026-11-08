"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BundleEditor, CATALOG_NETWORKS } from "@/components/products/bundle-editor"
import { bundleDifference, bundleIssues, type CatalogBundle } from "@/lib/catalog-pricing"

const money = (value: number) => Number.isFinite(value) ? `GHS ${value.toFixed(2)}` : "Not set"

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

  return (
    <div className="portal-page mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="space-y-2"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Products & prices</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">Add the bundles you sell, check their prices, and choose what appears in your shop.</p></div><Button onClick={() => openEditor(null)} disabled={loading || Boolean(error)} className="min-h-11 shrink-0"><Plus className="mr-2 h-4 w-4" />Add a bundle</Button></div>
      <div role="status" className={notice ? "rounded-lg border border-success/30 bg-success/10 p-3 text-sm" : "sr-only"}>{notice}</div>
      {loading ? <p role="status" className="rounded-lg border border-border p-6 text-sm text-muted-foreground">Loading your bundles...</p> : error ? <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-5 text-sm"><p>{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>Try loading again</Button></div> : <>
        <section aria-label="Catalog overview" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4"><p className="text-2xl font-bold">{bundles.length}</p><p className="text-sm text-muted-foreground">Total bundles</p></div><div className="rounded-lg border border-border bg-card p-4"><p className="text-2xl font-bold">{bundles.filter(bundle => bundle.active).length}</p><p className="text-sm text-muted-foreground">Active bundles</p></div><button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)} className={`rounded-lg border p-4 text-left ${attentionOnly ? "border-primary bg-primary/10" : "border-border bg-card"}`}><p className="text-2xl font-bold">{needsAttention}</p><p className="text-sm text-muted-foreground">Need a price review{attentionOnly ? " · showing these" : " · view bundles"}</p></button>
        </section>
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5" aria-label="Your bundles">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2"><label htmlFor="catalog-search" className="block text-sm font-medium">Find a bundle</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="catalog-search" type="search" placeholder="Search by name or network" value={query} onChange={event => setQuery(event.target.value)} className="h-11 pl-9" /></div></div>
            <div className="space-y-2"><label htmlFor="catalog-filter-network" className="block text-sm font-medium">Network</label><select id="catalog-filter-network" value={network} onChange={event => setNetwork(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm lg:w-44"><option value="ALL">All networks</option>{CATALOG_NETWORKS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <Button variant="outline" className="h-11" onClick={() => { setNotice(""); setReload(value => value + 1) }}><RefreshCw className="mr-2 h-4 w-4" />Refresh list</Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">Base price starts team purchases unless overridden. Shop price is what your customers pay. The difference shown is before fees.</p>
          {visible.length ? <ul className="space-y-3">{visible.map(bundle => {
            const issues = bundleIssues(bundle)
            const difference = bundleDifference(bundle)
            return <li key={bundle.id} className="min-w-0 rounded-lg border border-border bg-background/50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h2 className="break-words text-lg font-semibold">{bundle.name}</h2><p className="text-xs text-muted-foreground">{CATALOG_NETWORKS.find(item => item.id === bundle.provider)?.name ?? bundle.provider} · {bundle.active ? "Active" : "Hidden from shop"}</p></div><Button variant="outline" onClick={() => openEditor(bundle)} aria-label={`Edit ${bundle.provider} ${bundle.name}`} className="min-h-11">Edit bundle</Button></div><dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Base price</dt><dd className="mt-1 font-semibold">{bundle.hasBasePrice === false ? "Not set" : money(bundle.basePrice ?? bundle.price)}</dd></div><div><dt className="text-xs text-muted-foreground">Shop price</dt><dd className="mt-1 font-semibold">{bundle.hasStorefrontPrice === false ? "Using default price" : money(bundle.storefrontPrice ?? bundle.price)}</dd></div><div><dt className="text-xs text-muted-foreground">Difference before fees</dt><dd className="mt-1 font-semibold">{difference === null ? "Set the base price first" : money(difference)}</dd></div></dl>{issues.length > 0 && <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"><p className="font-medium">Needs a price review</p><ul className="mt-1 list-inside list-disc text-xs leading-6">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}</li>
          })}</ul> : <div className="space-y-3 py-8 text-center"><h2 className="text-lg font-semibold">{bundles.length ? "No bundles match these filters" : "Add your first bundle"}</h2><p className="text-sm text-muted-foreground">{bundles.length ? "Try another network or clear your search and price-review filter." : "Choose a network, give the bundle a name, and set its base and shop prices."}</p>{bundles.length ? <Button variant="outline" onClick={() => { setNetwork("ALL"); setQuery(""); setAttentionOnly(false) }}>Clear filters</Button> : <Button onClick={() => openEditor(null)}>Add your first bundle</Button>}</div>}
        </section>
      </>}
      <details className="rounded-lg border border-border bg-card p-4 text-sm"><summary className="cursor-pointer font-semibold">Services, team pricing & advanced tools</summary><p className="mt-3 text-xs leading-6 text-muted-foreground">Use price groups for agent and reseller prices. Registration services and the existing catalog controls are available below.</p><div className="mt-3 flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/dashboard/products?tab=pricing_profiles">Manage price groups</Link></Button><Button asChild variant="outline"><Link href="/dashboard/products?tab=advanced#service-forms">Services & advanced catalog</Link></Button></div></details>
      {editorOpen && <BundleEditor key={editing?.id ?? `new-${network}`} bundle={editing} initialNetwork={network === "ALL" ? "MTN" : network} onClose={() => setEditorOpen(false)} onSaved={saved} />}
    </div>
  )
}
