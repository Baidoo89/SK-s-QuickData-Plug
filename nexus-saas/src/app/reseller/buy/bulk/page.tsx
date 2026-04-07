"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

function formatGhanaCedis(value: number): string {
  return `GH₵ ${value.toFixed(2)}`
}

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  AIRTELTIGO: ["026", "027", "056", "057"],
  TELECEL: ["020", "050"],
}

export default function ResellerBuyBulkPage() {
  const { toast } = useToast()
  const [bulkInput, setBulkInput] = useState("")
  const [networks, setNetworks] = useState<{ id: string; name: string }[]>([])
  const [selectedNetwork, setSelectedNetwork] = useState("")
  const [bundles, setBundles] = useState<any[]>([])
  const [loadingBundles, setLoadingBundles] = useState(false)
  const [bulkBuying, setBulkBuying] = useState(false)
  const [bulkResults, setBulkResults] = useState<any[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [validatingBulk, setValidatingBulk] = useState(false)
  const [validationIssues, setValidationIssues] = useState<any>(null)
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)

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

  useEffect(() => {
    async function loadBundles() {
      if (!selectedNetwork) {
        setBundles([])
        return
      }

      setLoadingBundles(true)
      try {
        const res = await fetch(`/api/bundles?networkId=${encodeURIComponent(selectedNetwork)}`)
        if (!res.ok) return
        const payload = await res.json()
        let data = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : []

        data = data.sort((a: any, b: any) => {
          const parseSize = (name: string) => {
            const match = name.match(/(\d+(?:\.\d+)?)(GB|MB|KB|TB)/i)
            if (!match) return 0
            const value = parseFloat(match[1])
            const unit = match[2].toUpperCase()
            if (unit === "TB") return value * 1000 * 1000
            if (unit === "GB") return value * 1000
            if (unit === "MB") return value
            return value / 1000
          }
          return parseSize(a.name) - parseSize(b.name)
        })

        setBundles(data)
      } catch (error) {
        console.error("Failed to load bundles:", error)
      } finally {
        setLoadingBundles(false)
      }
    }
    loadBundles()
  }, [selectedNetwork])

  function normalizeBundleSizeToken(raw: string) {
    const trimmed = raw.trim().toUpperCase()
    if (!trimmed) return ""
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return `${trimmed}GB`
    return trimmed.replace(/\s+/g, "")
  }

  function extractBundleSize(name: string) {
    const match = name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)
    return match ? match[0].replace(/\s+/g, "").toUpperCase() : ""
  }

  function normalizePhoneForBulk(input: string): string | null {
    const digitsOnly = input.replace(/\D/g, "")
    if (!digitsOnly) return null

    if (digitsOnly.length === 12 && digitsOnly.startsWith("233")) {
      return `0${digitsOnly.slice(3)}`
    }

    if (digitsOnly.length === 10) {
      return digitsOnly
    }

    return null
  }

  function phoneMatchesSelectedNetwork(phone: string, networkId: string): boolean {
    const prefixes = NETWORK_PREFIXES[networkId?.toUpperCase()] || []
    if (prefixes.length === 0) return true
    return prefixes.includes(phone.slice(0, 3))
  }

  const preview = useMemo(() => {
    const lines = bulkInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    const bundleBySize = new Map<string, any>()
    for (const bundle of bundles) {
      const key = extractBundleSize(bundle.name)
      if (key && !bundleBySize.has(key)) {
        bundleBySize.set(key, bundle)
      }
    }

    const rows = lines.map((line, index) => {
      const parts = line.split(/\s+/).filter(Boolean)
      if (parts.length < 2) {
        return {
          lineNumber: index + 1,
          raw: line,
          phone: "",
          size: "",
          bundleId: "",
          amount: 0,
          valid: false,
          error: "Use format: phone size",
        }
      }

      const rawPhone = parts[0]
      const normalizedPhone = normalizePhoneForBulk(rawPhone)
      if (!normalizedPhone) {
        return {
          lineNumber: index + 1,
          raw: line,
          phone: rawPhone,
          size: parts[1] || "",
          bundleId: "",
          amount: 0,
          valid: false,
          error: "Phone must be exactly 10 digits",
        }
      }

      if (!phoneMatchesSelectedNetwork(normalizedPhone, selectedNetwork)) {
        return {
          lineNumber: index + 1,
          raw: line,
          phone: normalizedPhone,
          size: parts[1] || "",
          bundleId: "",
          amount: 0,
          valid: false,
          error: "Phone prefix does not match selected network",
        }
      }

      const requestedSize = parts[1]
      const normalizedSize = normalizeBundleSizeToken(requestedSize)
      const resolvedBundle = bundleBySize.get(normalizedSize)

      if (!resolvedBundle) {
        return {
          lineNumber: index + 1,
          raw: line,
          phone: normalizedPhone,
          size: requestedSize,
          bundleId: "",
          amount: 0,
          valid: false,
          error: `Size '${requestedSize}' not found for selected network`,
        }
      }

      return {
        lineNumber: index + 1,
        raw: line,
        phone: normalizedPhone,
        size: extractBundleSize(resolvedBundle.name) || requestedSize,
        bundleId: resolvedBundle.id,
        amount: Number(resolvedBundle.effectivePrice || 0),
        valid: true,
        error: "",
      }
    })

    const seenPhones = new Set<string>()
    const dedupedRows = rows.map((row) => {
      if (!row.valid) return row
      if (seenPhones.has(row.phone)) {
        return {
          ...row,
          valid: false,
          error: "Duplicate phone number in this batch",
        }
      }
      seenPhones.add(row.phone)
      return row
    })

    const validRows = dedupedRows.filter((row) => row.valid)
    const invalidRows = dedupedRows.filter((row) => !row.valid)
    const totalAmount = validRows.reduce((sum, row) => sum + row.amount, 0)

    return {
      lines,
      rows: dedupedRows,
      validRows,
      invalidRows,
      totalAmount,
    }
  }, [bulkInput, bundles, selectedNetwork])

  async function executeBulkBuy() {
    setBulkBuying(true)
    setBulkResults([])
    setConfirmOpen(false)

    try {
      const results = []

      for (const item of preview.validRows) {
        try {
          const res = await fetch("/api/reseller/buy-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: item.phone,
              bundleId: item.bundleId,
              quantity: 1,
            }),
          })

          if (res.ok) {
            const data = await res.json()
            results.push({ ...item, quantity: 1, status: "SUCCESS", orderId: data.data.orderId })
          } else {
            const errorResponse = await res.json()
            const errorMessage = errorResponse.error?.message || errorResponse.message || "Order failed"
            results.push({ ...item, quantity: 1, status: "ERROR", error: errorMessage })
          }
        } catch (error) {
          results.push({
            ...item,
            quantity: 1,
            status: "ERROR",
            error: error instanceof Error ? error.message : "Unknown error",
          })
        }
      }

      setBulkResults(results)
      const successCount = results.filter((r) => r.status === "SUCCESS").length
      toast({ title: "Bulk Complete", description: `${successCount}/${results.length} orders created` })
    } catch {
      toast({ title: "Error", description: "Could not process bulk orders", variant: "destructive" })
    } finally {
      setBulkBuying(false)
    }
  }

  async function validateBulkOrders() {
    try {
      setValidatingBulk(true)
      const phones = preview.validRows.map((row) => row.phone)
      
      const res = await fetch("/api/reseller/validate-bulk-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phones,
          totalAmount: preview.totalAmount,
        }),
      })

      if (!res.ok) {
        toast({
          title: "Validation Error",
          description: "Could not validate orders",
          variant: "destructive",
        })
        return false
      }

      const data = await res.json()
      const issues = data.data

      if (issues.warnings.insufficientFunds || issues.warnings.activeOrderConflicts) {
        setValidationIssues(issues)
        setValidationDialogOpen(true)
        return false
      }

      return true
    } catch (error) {
      toast({
        title: "Error",
        description: "Validation failed",
        variant: "destructive",
      })
      return false
    } finally {
      setValidatingBulk(false)
    }
  }

  async function handleBulkBuy(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedNetwork) {
      toast({
        title: "Error",
        description: "Select a network first",
        variant: "destructive",
      })
      return
    }

    if (bundles.length === 0) {
      toast({
        title: "Error",
        description: "No bundles available for the selected network",
        variant: "destructive",
      })
      return
    }

    if (!bulkInput.trim()) {
      toast({
        title: "Error",
        description: "Enter bulk orders in the required format",
        variant: "destructive",
      })
      return
    }

    if (preview.validRows.length === 0) {
      toast({
        title: "No valid orders",
        description: "Enter at least one valid line in the format: phone size",
        variant: "destructive",
      })
      return
    }

    if (preview.invalidRows.length > 0) {
      const invalidRefs = preview.invalidRows
        .slice(0, 5)
        .map((row) => row.phone || `line ${row.lineNumber}`)
        .join(", ")
      toast({
        title: "Fix invalid lines",
        description: `${preview.invalidRows.length} invalid line(s): ${invalidRefs}`,
        variant: "destructive",
      })
      return
    }

    const isValid = await validateBulkOrders()
    if (isValid) {
      setConfirmOpen(true)
    }
  }

  return (
    <div className="space-y-4 px-4 py-6 md:p-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Bulk Buy</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-hidden">
          <form className="space-y-4" onSubmit={handleBulkBuy}>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Network <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full text-xs border rounded px-2 py-2 bg-white"
                value={selectedNetwork}
                onChange={(e) => setSelectedNetwork(e.target.value)}
                disabled={networks.length === 0}
              >
                <option value="">Select network</option>
                {networks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
              {loadingBundles && <p className="text-xs text-blue-600">Loading bundles for selected network...</p>}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
              <p className="text-xs font-medium text-blue-900">Format: phone + spaces + size</p>
              <p className="text-xs text-blue-800">
                Enter one order per line using: <strong>phone size</strong>
              </p>
              <p className="text-xs text-blue-800">
                <strong>Example:</strong>
              </p>
              <code className="text-xs block bg-blue-100 p-2 rounded font-mono">
                {`0557574477 1
0557574488 2
0557574499 1GB`}
              </code>
              <p className="text-[11px] text-blue-800">
                If you type only a number, it is treated as GB (for example, <strong>1</strong> means <strong>1GB</strong>).
              </p>
            </div>

            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="0557574477 1"
              className="w-full h-32 text-xs border rounded p-3 font-mono"
            />

            {bulkInput.trim() && (
              <div className="rounded border bg-muted/30 p-3 space-y-1.5 text-xs">
                <p>
                  <strong>Orders:</strong> {preview.validRows.length} valid / {preview.invalidRows.length} invalid
                </p>
                <p>
                  <strong>Estimated debit:</strong> {formatGhanaCedis(preview.totalAmount)}
                </p>
                {preview.invalidRows.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-red-600 font-medium">Invalid lines:</p>
                    <div className="max-h-24 overflow-auto rounded border border-red-200 bg-red-50/60 p-2 text-red-700">
                      {preview.invalidRows.slice(0, 6).map((row) => (
                        <p key={`invalid-${row.lineNumber}`}>
                          Line {row.lineNumber} ({row.phone || "no phone"}): {row.error}
                        </p>
                      ))}
                      {preview.invalidRows.length > 6 && (
                        <p>...and {preview.invalidRows.length - 6} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={bulkBuying || !bulkInput.trim() || preview.validRows.length === 0}
              className="w-full text-xs"
            >
              {bulkBuying ? "Processing..." : "Review & Confirm Purchase"}
            </Button>
          </form>

          {bulkResults.length > 0 && (
            <div className="mt-4 space-y-3">
              <h3 className="text-xs font-semibold">Results</h3>
              <div className="w-full max-w-full overflow-x-auto rounded-md border bg-background">
                <table className="min-w-[760px] w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="whitespace-nowrap border-b px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                      <th className="whitespace-nowrap border-b px-3 py-2 text-left font-medium text-muted-foreground">Size</th>
                      <th className="border-b px-3 py-2 text-center font-medium text-muted-foreground">Qty</th>
                      <th className="border-b px-3 py-2 text-center font-medium text-muted-foreground">Status</th>
                      <th className="border-b px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                      <th className="whitespace-nowrap border-b px-3 py-2 text-left font-medium text-muted-foreground">Order ID / Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((result, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2">{result.phone}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{result.size || "-"}</td>
                        <td className="px-3 py-2 text-center">{result.quantity || 1}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              result.status === "SUCCESS"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {result.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatGhanaCedis(Number(result.amount || 0))}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {result.status === "SUCCESS" ? result.orderId : result.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Purchase</DialogTitle>
            <DialogDescription>
              You are about to place {preview.validRows.length} order(s) on {networks.find((n) => n.id === selectedNetwork)?.name || "selected network"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Total orders:</strong> {preview.validRows.length}
            </p>
            <p>
              <strong>Total debit:</strong> {formatGhanaCedis(preview.totalAmount)}
            </p>
            <div className="rounded border bg-muted/30 p-2">
              <p className="mb-1 text-xs font-medium text-foreground">Orders to place</p>
              <div className="max-h-44 overflow-auto space-y-1 text-xs">
                {preview.validRows.map((row) => (
                  <div key={`confirm-${row.lineNumber}`} className="flex items-center justify-between gap-2">
                    <span>
                      {row.phone} - {row.size}
                    </span>
                    <span className="font-medium">{formatGhanaCedis(row.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Wallet will be debited as orders are created.
            </p>
            <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              This action starts real purchases and wallet debits immediately. You cannot undo completed orders.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={executeBulkBuy} disabled={bulkBuying}>
              {bulkBuying ? "Processing..." : "Confirm & Buy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Validation Issues Found</DialogTitle>
            <DialogDescription>
              Please review the issues below before proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {validationIssues?.warnings.insufficientFunds && (
              <div className="rounded border border-red-200 bg-red-50 p-3">
                <p className="font-medium text-red-900">⚠️ Insufficient Wallet Balance</p>
                <p className="text-xs text-red-800 mt-1">
                  Your wallet has {formatGhanaCedis(validationIssues.walletBalance)} but you need {formatGhanaCedis(preview.totalAmount)} for these orders.
                </p>
              </div>
            )}
            {validationIssues?.warnings.activeOrderConflicts && (
              <div className="rounded border border-orange-200 bg-orange-50 p-3">
                <p className="font-medium text-orange-900">⚠️ Active Orders on These Phones</p>
                <p className="text-xs text-orange-800 mt-1">
                  {validationIssues.phonesWithActiveOrders.length} phone(s) already have pending/processing orders:
                </p>
                <div className="text-xs text-orange-700 mt-2 max-h-24 overflow-auto space-y-1">
                  {validationIssues.phonesWithActiveOrders.map((phone: string) => (
                    <div key={phone} className="font-mono">
                      {phone}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setValidationDialogOpen(false)}>
              Go Back & Fix
            </Button>
            <Button 
              type="button" 
              onClick={() => {
                setValidationDialogOpen(false)
                setConfirmOpen(true)
              }}
            >
              Proceed Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
