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

export function ProviderProductMappingCard({ endpoint = "/api/dashboard/provider-product-mappings" }: ProviderProductMappingCardProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [savingProductId, setSavingProductId] = useState<string | null>(null)
  const [providerKey, setProviderKey] = useState("primary")
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
      setRows(Array.isArray(payload?.data?.rows) ? payload.data.rows : [])
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load provider mappings",
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

  const mappedCount = useMemo(() => rows.filter((row) => row.externalProductCode.trim()).length, [rows])
  const selectedConnection = connections.find((connection) => connection.providerKey === providerKey)

  return (
    <Card className="min-w-0 overflow-hidden border border-border bg-card/95 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">Provider Product Mapping</CardTitle>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              Match your local bundles to the package codes required by the selected provider slot.
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
            <label className="text-xs font-medium">Provider Slot</label>
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

        {selectedConnection?.active === false ? (
          <div className="break-words rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            This provider slot is paused. Mappings are saved, but dispatch will skip the slot until it is active.
          </div>
        ) : null}

        <div className="table-scroll rounded-md border border-border">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Bundle</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Provider Package Code</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    {loading ? "Loading bundles..." : "No active data bundles found."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
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
                        placeholder="e.g. MTN_10GB"
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
          If a code is empty, dispatch sends the local product ID. For SKPlug, enter the gb_size value for each bundle, such as 1, 5, or 10.
        </p>
      </CardContent>
    </Card>
  )
}
