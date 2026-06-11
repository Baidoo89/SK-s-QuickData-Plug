"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"

type ProviderConnectionSummary = {
  providerKey: string
  providerName: string
  templateKey?: string
  active: boolean
}

type MappingRow = {
  productId: string
  name: string
  network: string
  price: number
  externalProductCode: string
  notes: string
}

type ProviderProductMappingCardProps = {
  endpoint?: string
}

type MappingFilter = "ALL" | "MAPPED" | "UNMAPPED"

export function ProviderProductMappingCard({ endpoint = "/api/dashboard/provider-product-mappings" }: ProviderProductMappingCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [savingProductId, setSavingProductId] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [airtelRoute, setAirtelRoute] = useState<"AT_EXPIRY" | "AT_NOEXPIRY">("AT_EXPIRY")
  const [providerKey, setProviderKey] = useState("primary")
  const [networkFilter, setNetworkFilter] = useState("")
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("ALL")
  const [query, setQuery] = useState("")
  const [connections, setConnections] = useState<ProviderConnectionSummary[]>([])
  const [rows, setRows] = useState<MappingRow[]>([])

  async function loadMappings(nextProviderKey = providerKey) {
    setLoading(true)
    try {
      const res = await fetch(`${endpoint}?providerKey=${encodeURIComponent(nextProviderKey)}`)
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error?.message || "Could not load product mappings")

      setProviderKey(payload?.data?.providerKey || nextProviderKey)
      setConnections(Array.isArray(payload?.data?.connections) ? payload.data.connections : [])
      const nextRows = (Array.isArray(payload?.data?.rows) ? payload.data.rows : []) as MappingRow[]
      setRows(nextRows)
      const nextNetworks = Array.from(new Set(nextRows.map((row) => String(row.network || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
      if (nextNetworks.length > 0) {
        setNetworkFilter((current) => {
          if (current === "ALL" || nextNetworks.includes(current)) return current
          return nextNetworks.find((network) => network.toUpperCase().includes("MTN")) || nextNetworks[0]
        })
      } else {
        setNetworkFilter("")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load package codes",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMappings("primary")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  async function saveMapping(row: MappingRow) {
    setSavingProductId(row.productId)
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerKey,
          productId: row.productId,
          externalProductCode: row.externalProductCode,
          notes: row.notes,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error?.message || "Could not save product mapping")

      toast({
        title: row.externalProductCode.trim() ? "Mapping saved" : "Mapping removed",
        description: `${row.name} is updated for ${providerKey}.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save product mapping",
        variant: "destructive",
      })
    } finally {
      setSavingProductId(null)
    }
  }

  function updateRow(productId: string, patch: Partial<MappingRow>) {
    setRows((current) => current.map((row) => (row.productId === productId ? { ...row, ...patch } : row)))
  }

  function extractGbSize(name: string) {
    const match = name.match(/\b(\d+(?:\.\d+)?)\s*(GB|MB|KB|TB)\b/i)
    if (!match) return ""

    const amount = Number(match[1])
    const unit = match[2].toUpperCase()
    if (!Number.isFinite(amount)) return ""
    if (unit === "GB") return Number.isInteger(amount) ? String(amount) : String(amount)
    if (unit === "MB") return String(amount / 1024)
    if (unit === "TB") return String(amount * 1024)
    return ""
  }

  function buildSkDataPlugCode(row: MappingRow) {
    const size = extractGbSize(row.name)
    if (!size) return ""

    const network = row.network.trim().toUpperCase()
    if (network.includes("AIRTEL") || network === "AT" || network === "AIRTELTIGO") {
      return `${airtelRoute}:${size}`
    }

    return size
  }

  function autoFillSkDataPlugMappings(targetRows = filteredRows) {
    const targetIds = new Set(targetRows.map((row) => row.productId))
    let filled = 0
    let skipped = 0
    const nextRows = rows.map((row) => {
      if (!targetIds.has(row.productId)) return row
      const code = buildSkDataPlugCode(row)
      if (!code) {
        skipped += 1
        return row
      }
      filled += 1
      return {
        ...row,
        externalProductCode: code,
        notes: row.notes || (code.includes(":") ? `SKDataPlug ${code.split(":")[0]} route` : "SKDataPlug gb_size"),
      }
    })

    setRows(nextRows)

    toast({
      title: "Mappings prepared",
      description: `${filled} row${filled === 1 ? "" : "s"} filled, ${skipped} skipped. Review and save mappings.`,
    })
  }

  async function saveVisibleMappings() {
    const mappedRows = filteredRows.filter((row) => row.externalProductCode.trim())
    if (mappedRows.length === 0) {
      toast({ title: "No visible codes to save", description: "Auto-fill or enter package codes in the current view first." })
      return
    }

    setBulkSaving(true)
    try {
      let saved = 0
      for (const row of mappedRows) {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerKey,
            productId: row.productId,
            externalProductCode: row.externalProductCode,
            notes: row.notes,
          }),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok) throw new Error(payload?.error?.message || `Could not save ${row.name}`)
        saved += 1
      }

      toast({
        title: "Package codes saved",
        description: `${saved} visible package code${saved === 1 ? "" : "s"} saved for ${providerKey}.`,
      })
      await loadMappings(providerKey)
    } catch (error) {
      toast({
        title: "Bulk save failed",
        description: error instanceof Error ? error.message : "Could not save package codes.",
        variant: "destructive",
      })
    } finally {
      setBulkSaving(false)
    }
  }

  const mappedCount = useMemo(() => rows.filter((row) => row.externalProductCode.trim()).length, [rows])
  const networks = useMemo(() => Array.from(new Set(rows.map((row) => row.network.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows])
  const networkCounts = useMemo(() => {
    const counts = new Map<string, { total: number; mapped: number }>()
    for (const row of rows) {
      const key = row.network.trim() || "Unknown"
      const current = counts.get(key) || { total: 0, mapped: 0 }
      current.total += 1
      if (row.externalProductCode.trim()) current.mapped += 1
      counts.set(key, current)
    }
    return counts
  }, [rows])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const networkMatches = !networkFilter || networkFilter === "ALL" || row.network === networkFilter
      const mappingMatches =
        mappingFilter === "ALL" ||
        (mappingFilter === "MAPPED" && row.externalProductCode.trim()) ||
        (mappingFilter === "UNMAPPED" && !row.externalProductCode.trim())
      const queryMatches =
        !normalizedQuery ||
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.network.toLowerCase().includes(normalizedQuery) ||
        row.externalProductCode.toLowerCase().includes(normalizedQuery)

      return networkMatches && mappingMatches && queryMatches
    })
  }, [mappingFilter, networkFilter, normalizedQuery, rows])
  const visibleMappedCount = useMemo(() => filteredRows.filter((row) => row.externalProductCode.trim()).length, [filteredRows])
  const selectedConnection = connections.find((connection) => connection.providerKey === providerKey)
  const selectedTemplateKey = selectedConnection?.templateKey || ""
  const isSkDataPlug = selectedTemplateKey === "skplug" || selectedConnection?.providerName.toLowerCase().includes("skdata")

  return (
    <Card className="premium-surface min-w-0 overflow-hidden rounded-lg">
      <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">Package Code Matching</CardTitle>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              Match your TechDalt bundles to the package codes required by the selected delivery account.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit rounded-md">
            {mappedCount}/{rows.length} mapped
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Delivery Account</label>
            <select
              value={providerKey}
              disabled={loading}
              onChange={(event) => {
                const nextProviderKey = event.target.value
                setProviderKey(nextProviderKey)
                loadMappings(nextProviderKey)
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(connections.length > 0 ? connections : [{ providerKey: "primary", providerName: "Primary Provider", active: true }]).map((connection) => (
                <option key={connection.providerKey} value={connection.providerKey}>
                  {connection.providerName} ({connection.providerKey})
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => loadMappings(providerKey)} disabled={loading} className="w-full sm:w-auto">
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 shadow-sm">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            <Button
              type="button"
              variant={networkFilter === "ALL" ? "default" : "outline"}
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={() => setNetworkFilter("ALL")}
            >
              All <Badge variant="secondary" className="ml-2 rounded-md text-[10px]">{rows.length}</Badge>
            </Button>
            {networks.map((network) => {
              const count = networkCounts.get(network)
              return (
                <Button
                  key={network}
                  type="button"
                  variant={networkFilter === network ? "default" : "outline"}
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => setNetworkFilter(network)}
                >
                  {network}
                  <Badge variant="secondary" className="ml-2 rounded-md text-[10px]">
                    {count?.mapped || 0}/{count?.total || 0}
                  </Badge>
                </Button>
              )
            })}
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 text-xs"
              placeholder="Search bundle, network, or package code"
            />
            <div className="grid grid-cols-3 gap-2">
              {(["ALL", "UNMAPPED", "MAPPED"] as const).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  variant={mappingFilter === filter ? "default" : "outline"}
                  size="sm"
                  className="h-9 text-[11px]"
                  onClick={() => setMappingFilter(filter)}
                >
                  {filter === "ALL" ? "All" : filter === "UNMAPPED" ? "Unmapped" : "Mapped"}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="rounded-md">Viewing {filteredRows.length}</Badge>
            <Badge variant="outline" className="rounded-md">{visibleMappedCount}/{filteredRows.length} visible mapped</Badge>
            <span className="min-w-0 break-words">Work one network at a time, then use All only when you need a full audit.</span>
          </div>
        </div>

        {isSkDataPlug ? (
          <div className="grid gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-semibold text-primary">SKDataPlug code helper</p>
              <p className="break-words text-[11px] text-primary/80">
                MTN and Telecel map to the gb_size only. AirtelTigo must choose an SKDataPlug route because they publish AT_EXPIRY and AT_NOEXPIRY separately.
              </p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-center">
                <label className="text-[11px] font-medium text-primary">AirtelTigo route</label>
                <select
                  value={airtelRoute}
                  onChange={(event) => setAirtelRoute(event.target.value as "AT_EXPIRY" | "AT_NOEXPIRY")}
                  className="h-9 w-full rounded-md border border-primary/20 bg-background px-3 text-xs text-foreground"
                >
                  <option value="AT_EXPIRY">AT_EXPIRY</option>
                  <option value="AT_NOEXPIRY">AT_NOEXPIRY</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:min-w-[17rem]">
              <Button type="button" variant="outline" size="sm" className="border-primary/30 text-xs" onClick={() => autoFillSkDataPlugMappings()} disabled={loading || bulkSaving || filteredRows.length === 0}>
                Auto-fill visible
              </Button>
              <Button type="button" size="sm" className="text-xs" onClick={saveVisibleMappings} disabled={loading || bulkSaving || filteredRows.length === 0}>
                {bulkSaving ? "Saving..." : "Save visible"}
              </Button>
            </div>
          </div>
        ) : null}

        {selectedConnection?.active === false ? (
          <div className="break-words rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            This delivery account is paused. Saved codes stay here, but automatic delivery will skip it until it is active.
          </div>
        ) : null}

        <div className="ops-table-surface table-scroll rounded-lg">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Bundle</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Package Code</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    {loading ? "Loading bundles..." : rows.length === 0 ? "No active data bundles found." : "No bundles match the current filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell className="max-w-[220px] whitespace-normal break-words font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-md text-[10px]">
                        {row.network}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatGhanaCedis(row.price)}</TableCell>
                    <TableCell>
                      <Input
                        value={row.externalProductCode}
                        onChange={(event) => updateRow(row.productId, { externalProductCode: event.target.value })}
                        onBlur={(event) => saveMapping({ ...row, externalProductCode: event.currentTarget.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur()
                        }}
                        className="h-9 min-w-[180px] text-xs"
                        placeholder={isSkDataPlug ? "e.g. 5 or AT_EXPIRY:5" : "e.g. MTN_10GB"}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.notes}
                        onChange={(event) => updateRow(row.productId, { notes: event.target.value })}
                        onBlur={(event) => saveMapping({ ...row, notes: event.currentTarget.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur()
                        }}
                        className="h-9 min-w-[160px] text-xs"
                        placeholder="Optional"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={row.externalProductCode.trim() ? "secondary" : "outline"} className="rounded-md text-[10px]">
                        {savingProductId === row.productId ? "Saving" : row.externalProductCode.trim() ? "Mapped" : "Default"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="break-words text-[11px] text-muted-foreground">
          If a code is empty, TechDalt sends the local product ID. For SKDataPlug, use gb_size such as 1, 5, or 10. For AirtelTigo, use AT_EXPIRY:5 or AT_NOEXPIRY:5.
        </p>
      </CardContent>
    </Card>
  )
}
