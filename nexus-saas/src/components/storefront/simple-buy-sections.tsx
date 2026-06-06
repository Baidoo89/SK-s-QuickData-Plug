"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { AlertCircle, CheckCircle2, CreditCard, FileText, Layers3, Loader2, Smartphone, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SellingAccessAlert } from "@/components/access/selling-access-alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { formatGhanaCedis } from "@/lib/currency"

type StoreBundle = {
  id: string
  name: string
  provider: string
  category?: string
  serviceForm?: string | null
  effectivePrice: number
}

type ServiceFormField = {
  id: string
  label: string
  type: "TEXT" | "PHONE" | "DATE" | "NUMBER" | "SELECT" | "TEXTAREA" | "GHANA_CARD"
  required: boolean
  placeholder?: string
  options?: string[]
}

type BulkResult = {
  lineNumber: number
  phone: string
  size: string
  bundleId: string
  quantity: number
  amount: number
  status: "SUCCESS" | "FAILED"
  message: string
}

type BulkPreviewRow = {
  lineNumber: number
  phone: string
  size: string
  bundleId: string
  amount: number
  valid: boolean
  error: string
}

export type SimpleBuySectionsProps = {
  subscriberSlug: string
  bundles: StoreBundle[]
  services?: StoreBundle[]
  agentId?: string
  resellerId?: string
  returnPath?: string
  storeActive: boolean
  storeInactiveReason?: string
}

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  AIRTELTIGO: ["026", "027", "056", "057"],
  TELECEL: ["020", "050"],
}

function normalizeProviderName(value: string) {
  return (value || "UNKNOWN").toUpperCase()
}

function normalizePhoneNumber(input: string): string | null {
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

function phoneMatchesProvider(phone: string, provider: string): boolean {
  const prefixes = NETWORK_PREFIXES[normalizeProviderName(provider)] || []
  if (prefixes.length === 0) return true
  return prefixes.includes(phone.slice(0, 3))
}

const DEFAULT_SERVICE_FIELDS: ServiceFormField[] = [
  { id: "ghanaCardNumber", label: "Ghana Card number", type: "GHANA_CARD", required: true, placeholder: "GHA-000000000-0" },
  { id: "location", label: "Location / town", type: "TEXT", required: true, placeholder: "e.g. Kumasi" },
  { id: "dateOfBirth", label: "Date of birth", type: "DATE", required: true },
]

function parseServiceFields(serviceForm?: string | null): ServiceFormField[] {
  if (!serviceForm) return DEFAULT_SERVICE_FIELDS
  try {
    const parsed = JSON.parse(serviceForm)
    const fields = Array.isArray(parsed?.fields) ? parsed.fields : []
    return fields
      .filter((field: any) => field && typeof field.id === "string" && typeof field.label === "string")
      .map((field: any) => ({
        id: field.id,
        label: field.label,
        type: ["TEXT", "PHONE", "DATE", "NUMBER", "SELECT", "TEXTAREA", "GHANA_CARD"].includes(field.type) ? field.type : "TEXT",
        required: field.required !== false,
        placeholder: typeof field.placeholder === "string" ? field.placeholder : "",
        options: Array.isArray(field.options) ? field.options.filter((option: unknown) => typeof option === "string") : [],
      }))
  } catch {
    return DEFAULT_SERVICE_FIELDS
  }
}

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

function parseBulkLine(line: string, bundleBySize: Map<string, StoreBundle>, selectedProvider: string): BulkPreviewRow {
  const cleaned = line.trim()

  if (!cleaned) {
    return {
      lineNumber: 0,
      phone: "",
      size: "",
      bundleId: "",
      amount: 0,
      valid: false,
      error: "Empty line",
    }
  }

  if (selectedProvider === "ALL") {
    return {
      lineNumber: 0,
      phone: "",
      size: "",
      bundleId: "",
      amount: 0,
      valid: false,
      error: "Select a network first",
    }
  }

  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length < 2) {
    return {
      lineNumber: 0,
      phone: parts[0] || "",
      size: "",
      bundleId: "",
      amount: 0,
      valid: false,
      error: "Use format: phone size",
    }
  }

  const rawPhone = parts[0]
  const requestedSize = parts[1]
  const normalizedPhone = normalizePhoneNumber(rawPhone)

  if (!normalizedPhone) {
    return {
      lineNumber: 0,
      phone: rawPhone,
      size: requestedSize,
      bundleId: "",
      amount: 0,
      valid: false,
      error: "Phone must be exactly 10 digits",
    }
  }

  if (!phoneMatchesProvider(normalizedPhone, selectedProvider)) {
    return {
      lineNumber: 0,
      phone: normalizedPhone,
      size: requestedSize,
      bundleId: "",
      amount: 0,
      valid: false,
      error: "Phone prefix does not match selected network",
    }
  }

  const normalizedSize = normalizeBundleSizeToken(requestedSize)
  const resolvedBundle = bundleBySize.get(normalizedSize)

  if (!resolvedBundle) {
    return {
      lineNumber: 0,
      phone: normalizedPhone,
      size: requestedSize,
      bundleId: "",
      amount: 0,
      valid: false,
      error: `Size '${requestedSize}' not found for selected network`,
    }
  }

  return {
    lineNumber: 0,
    phone: normalizedPhone,
    size: extractBundleSize(resolvedBundle.name) || normalizedSize,
    bundleId: resolvedBundle.id,
    amount: Number(resolvedBundle.effectivePrice || 0),
    valid: true,
    error: "",
  }
}

export function SimpleBuySections({ subscriberSlug, bundles, services = [], agentId, resellerId, returnPath, storeActive, storeInactiveReason }: SimpleBuySectionsProps) {
  const [submittingSingle, setSubmittingSingle] = useState(false)
  const [submittingBulk, setSubmittingBulk] = useState(false)
  const [submittingService, setSubmittingService] = useState(false)
  const [singlePhone, setSinglePhone] = useState("")
  const [serviceProductId, setServiceProductId] = useState("")
  const [serviceFullName, setServiceFullName] = useState("")
  const [servicePhone, setServicePhone] = useState("")
  const [serviceFormValues, setServiceFormValues] = useState<Record<string, string>>({})
  const [selectedProvider, setSelectedProvider] = useState<string>("ALL")
  const [selectedBundleId, setSelectedBundleId] = useState("")
  const [bulkInput, setBulkInput] = useState("")
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([])
  const productCount = bundles.length + services.length
  const storefrontCanSell = storeActive && productCount > 0
  const storefrontCanSellBundles = storeActive && bundles.length > 0
  const storefrontCanSellServices = storeActive && services.length > 0

  const providers = useMemo(
    () => Array.from(new Set(bundles.map((bundle) => normalizeProviderName(bundle.provider)))),
    [bundles],
  )

  const filteredBundles = useMemo(() => {
    if (selectedProvider === "ALL") return bundles
    return bundles.filter((bundle) => normalizeProviderName(bundle.provider) === selectedProvider)
  }, [bundles, selectedProvider])

  const selectedBundle = useMemo(
    () => filteredBundles.find((bundle) => bundle.id === selectedBundleId) ?? bundles.find((bundle) => bundle.id === selectedBundleId),
    [bundles, filteredBundles, selectedBundleId],
  )

  const totalSingleCost = selectedBundle ? selectedBundle.effectivePrice : 0
  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceProductId),
    [services, serviceProductId],
  )
  const selectedServiceFields = useMemo(
    () => parseServiceFields(selectedService?.serviceForm),
    [selectedService?.serviceForm],
  )
  const totalServiceCost = selectedService ? selectedService.effectivePrice : 0

  useEffect(() => {
    if (selectedBundleId && !filteredBundles.some((bundle) => bundle.id === selectedBundleId)) {
      setSelectedBundleId("")
    }
  }, [filteredBundles, selectedBundleId])

  useEffect(() => {
    setServiceFormValues({})
  }, [serviceProductId])

  const startCheckout = async (items: Array<{ productId: string; phoneNumber: string; quantity: number }>) => {
    if (!storefrontCanSellBundles) {
      throw new Error(storeInactiveReason || "Checkout is not available right now")
    }

    const response = await fetch("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriberSlug,
        agentId,
        resellerId,
        returnPath,
        items,
      }),
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || "Could not start checkout")
    }

    const authorizationUrl = body?.data?.authorizationUrl
    if (!authorizationUrl) {
      throw new Error("Payment checkout was created without a payment link")
    }

    window.location.href = authorizationUrl
    return body.data
  }

  const startServiceCheckout = async () => {
    if (!storefrontCanSellServices) {
      throw new Error(storeInactiveReason || "Service checkout is not available right now")
    }

    const response = await fetch("/api/store/service-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriberSlug,
        agentId,
        resellerId,
        returnPath,
        productId: serviceProductId,
        customerName: serviceFullName,
        phoneNumber: servicePhone,
        formValues: serviceFormValues,
      }),
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || "Could not start service checkout")
    }

    const authorizationUrl = body?.data?.authorizationUrl
    if (!authorizationUrl) {
      throw new Error("Payment checkout was created without a payment link")
    }

    window.location.href = authorizationUrl
    return body.data
  }

  const handleSingleBuy = async (event: FormEvent) => {
    event.preventDefault()

    const normalizedPhone = normalizePhoneNumber(singlePhone)
    if (!selectedBundleId || !normalizedPhone) {
      toast({
        title: "Error",
        description: "Select a network, choose a bundle, and enter a valid phone number",
        variant: "destructive",
      })
      return
    }

    if (!selectedBundle) {
      toast({
        title: "Error",
        description: "Please choose a bundle from the selected network",
        variant: "destructive",
      })
      return
    }

    if (!phoneMatchesProvider(normalizedPhone, selectedBundle.provider)) {
      toast({
        title: "Error",
        description: "Phone prefix does not match the selected network",
        variant: "destructive",
      })
      return
    }

    const shouldContinue = window.confirm(
      `Confirm purchase for ${normalizedPhone}?\nBundle: ${selectedBundle.name}\nAmount: ${formatGhanaCedis(totalSingleCost)}`,
    )

    if (!shouldContinue) {
      return
    }

    setSubmittingSingle(true)
    try {
      await startCheckout([
        {
          productId: selectedBundleId,
          phoneNumber: normalizedPhone,
          quantity: 1,
        },
      ])

      toast({ title: "Redirecting to payment", description: "Complete payment to submit the order." })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: error instanceof Error ? error.message : "Could not start checkout",
      })
      setSubmittingSingle(false)
    }
  }

  const preview = useMemo(() => {
    const lines = bulkInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    const bundleBySize = new Map<string, StoreBundle>()
    for (const bundle of filteredBundles) {
      const key = extractBundleSize(bundle.name)
      if (key && !bundleBySize.has(key)) {
        bundleBySize.set(key, bundle)
      }
    }

    const rows = lines.map((line, index) => {
      const parsed = parseBulkLine(line, bundleBySize, selectedProvider)
      return {
        ...parsed,
        lineNumber: index + 1,
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
  }, [bulkInput, filteredBundles, selectedProvider])

  const handleBulkBuy = async (event: FormEvent) => {
    event.preventDefault()

    if (selectedProvider === "ALL") {
      toast({
        title: "Error",
        description: "Select a network first",
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

    if (filteredBundles.length === 0) {
      toast({
        title: "Error",
        description: "No bundles available for the selected network",
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
        .map((row) => `line ${row.lineNumber}`)
        .join(", ")
      toast({
        title: "Fix invalid lines",
        description: `${preview.invalidRows.length} invalid line(s): ${invalidRefs}`,
        variant: "destructive",
      })
      return
    }

    const shouldContinue = window.confirm(
      `Confirm ${preview.validRows.length} order(s) on ${selectedProvider}?\nTotal: ${formatGhanaCedis(preview.totalAmount)}`,
    )

    if (!shouldContinue) {
      return
    }

    setSubmittingBulk(true)
    setBulkResults([])

    try {
      await startCheckout(
        preview.validRows.map((row) => ({
            productId: row.bundleId,
            phoneNumber: row.phone,
            quantity: 1,
        })),
      )

      toast({ title: "Redirecting to payment", description: "Complete payment to submit the bulk order." })
    } catch (error) {
      toast({
        title: "Checkout failed",
        description: error instanceof Error ? error.message : "Could not start checkout",
        variant: "destructive",
      })
      setSubmittingBulk(false)
    }
  }

  const handleServiceRequest = async (event: FormEvent) => {
    event.preventDefault()

    const normalizedPhone = normalizePhoneNumber(servicePhone)
    const missingRequiredField = selectedServiceFields.find((field) => field.required && !String(serviceFormValues[field.id] || "").trim())
    if (!serviceProductId || !serviceFullName.trim() || !normalizedPhone || missingRequiredField) {
      toast({
        title: "Error",
        description: missingRequiredField
          ? `${missingRequiredField.label} is required`
          : "Choose the service and complete customer name and phone number",
        variant: "destructive",
      })
      return
    }

    if (!selectedService) {
      toast({
        title: "Error",
        description: "Please choose an available registration service",
        variant: "destructive",
      })
      return
    }

    if (!phoneMatchesProvider(normalizedPhone, selectedService.provider)) {
      toast({
        title: "Error",
        description: "Phone prefix does not match the selected service network",
        variant: "destructive",
      })
      return
    }

    const shouldContinue = window.confirm(
      `Confirm registration request?\nName: ${serviceFullName.trim()}\nPhone: ${normalizedPhone}\nService: ${selectedService.name}\nAmount: ${formatGhanaCedis(totalServiceCost)}`,
    )

    if (!shouldContinue) return

    setSubmittingService(true)
    try {
      await startServiceCheckout()
      toast({ title: "Redirecting to payment", description: "Complete payment to submit the registration request." })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: error instanceof Error ? error.message : "Could not start service checkout",
      })
      setSubmittingService(false)
    }
  }

  return (
    <div className="portal-page min-w-0 space-y-5 sm:space-y-6">
      {!storeActive && (
        <SellingAccessAlert
          canSell={false}
          reason={storeInactiveReason || "This storefront is currently inactive. Purchases are disabled."}
        />
      )}

      {storeActive && productCount === 0 && (
        <div className="status-warning flex min-w-0 gap-3 rounded-md border px-4 py-3 text-sm shadow-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">No products or services available</p>
            <p className="break-words">This storefront is active, but no public bundles or service requests are available yet.</p>
          </div>
        </div>
      )}

      {storefrontCanSell && (
        <div className="status-info flex min-w-0 gap-3 rounded-md border px-4 py-3 text-sm shadow-sm">
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Secure payment first</p>
            <p className="break-words">Your order is sent to the seller only after Paystack confirms payment.</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="single" className="min-w-0 space-y-5">
        <TabsList className={`grid h-auto w-full max-w-2xl gap-1 rounded-md bg-muted p-1 ${services.length > 0 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
          <TabsTrigger value="single" className="min-w-0 rounded-md px-2 py-2 text-xs sm:text-sm">
            <ShoppingBag className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
            <span className="truncate">Single Buy</span>
          </TabsTrigger>
          <TabsTrigger value="bulk" className="min-w-0 rounded-md px-2 py-2 text-xs sm:text-sm">
            <Layers3 className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
            <span className="truncate">Bulk Buy</span>
          </TabsTrigger>
          {services.length > 0 ? (
            <TabsTrigger value="services" className="min-w-0 rounded-md px-2 py-2 text-xs sm:text-sm">
              <FileText className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
              <span className="truncate">Services</span>
            </TabsTrigger>
          ) : null}
        </TabsList>

        <div className="grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
          <div className="min-w-0 space-y-5">
            <TabsContent value="single" className="mt-0">
              <Card className="min-w-0 overflow-hidden border-border/80 bg-card/95 shadow-sm">
                <CardHeader className="border-b border-border/70 bg-muted/20">
                  <CardTitle className="flex min-w-0 items-center gap-2 text-lg sm:text-xl">
                    <ShoppingBag className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 break-words">Buy Single Bundle</span>
                  </CardTitle>
                  <CardDescription className="break-words">
                    Select a network, choose a bundle, enter the number, and pay securely. No account required.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 p-4 sm:p-6">
                  <form className="space-y-5" onSubmit={handleSingleBuy}>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Network</label>
                      <div className="table-scroll flex gap-2 pb-1">
                        <Button type="button" size="sm" variant={selectedProvider === "ALL" ? "default" : "outline"} onClick={() => setSelectedProvider("ALL")} className="shrink-0" disabled={!storefrontCanSellBundles}>
                          All
                        </Button>
                        {providers.map((provider) => (
                          <Button
                            key={provider}
                            type="button"
                            size="sm"
                            variant={selectedProvider === provider ? "default" : "outline"}
                            onClick={() => setSelectedProvider(provider)}
                            className="max-w-36 shrink-0 truncate"
                            disabled={!storefrontCanSellBundles}
                          >
                            {provider}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Bundle</label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-3 text-sm shadow-sm outline-none transition hover:border-ring focus:border-ring focus:ring-2 focus:ring-ring/20"
                        value={selectedBundleId}
                        onChange={(event) => setSelectedBundleId(event.target.value)}
                        required
                        disabled={!storefrontCanSellBundles}
                      >
                        <option value="">Select bundle</option>
                        {filteredBundles.map((bundle) => (
                          <option key={bundle.id} value={bundle.id}>
                            {bundle.name} - {bundle.provider} - {formatGhanaCedis(bundle.effectivePrice)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Number</label>
                      <div className="relative">
                        <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="tel"
                          value={singlePhone}
                          onChange={(event) => setSinglePhone(event.target.value)}
                          placeholder="0240000000"
                          required
                          disabled={!storefrontCanSellBundles}
                          className="h-11 pl-9"
                        />
                      </div>
                    </div>

                    {selectedBundle && (
                      <div className="grid min-w-0 gap-3 rounded-md border border-primary/20 bg-primary/10 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0 space-y-1 text-sm">
                          <p className="font-semibold text-foreground">Order summary</p>
                          <p className="break-words text-muted-foreground">
                            {selectedBundle.name} - {selectedBundle.provider}
                          </p>
                        </div>
                        <div className="min-w-0 text-left sm:text-right">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                          <p className="break-words text-xl font-bold text-primary sm:text-2xl">{formatGhanaCedis(totalSingleCost)}</p>
                        </div>
                      </div>
                    )}

                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 w-full rounded-md text-base font-semibold shadow-sm sm:w-auto sm:px-8"
                      disabled={!storefrontCanSellBundles || submittingSingle || !selectedBundleId || !singlePhone.trim()}
                    >
                      {submittingSingle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      {submittingSingle ? "Redirecting..." : "Buy Now"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bulk" className="mt-0">
              <Card className="min-w-0 overflow-hidden border-border/80 bg-card/95 shadow-sm">
                <CardHeader className="border-b border-border/70 bg-muted/20">
                  <CardTitle className="flex min-w-0 items-center gap-2 text-lg sm:text-xl">
                    <Layers3 className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 break-words">Bulk Buy</span>
                  </CardTitle>
                  <CardDescription className="break-words">
                    Add one order per line using phone and size, then review the validation summary before submitting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Network</label>
                    <div className="table-scroll flex gap-2 pb-1">
                      <Button type="button" size="sm" variant={selectedProvider === "ALL" ? "default" : "outline"} onClick={() => setSelectedProvider("ALL")} className="shrink-0" disabled={!storefrontCanSellBundles}>
                        All
                      </Button>
                      {providers.map((provider) => (
                        <Button
                          key={provider}
                          type="button"
                          size="sm"
                          variant={selectedProvider === provider ? "default" : "outline"}
                          onClick={() => setSelectedProvider(provider)}
                          className="max-w-36 shrink-0 truncate"
                          disabled={!storefrontCanSellBundles}
                        >
                          {provider}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <div className="min-w-0 rounded-md border border-border bg-muted/35 p-4 text-sm">
                      <p className="font-semibold text-foreground">Format</p>
                      <p className="mt-1 break-words text-muted-foreground">Use one order per line.</p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-muted/35 p-4 text-sm">
                      <p className="font-semibold text-foreground">Accepted input</p>
                      <p className="mt-1 break-words text-muted-foreground">phone size</p>
                      <p className="break-words text-muted-foreground">or phone 1GB</p>
                    </div>
                  </div>

                  <form className="space-y-3" onSubmit={handleBulkBuy}>
                    <textarea
                      className="min-h-[220px] w-full rounded-md border border-input bg-background p-4 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                      placeholder={selectedProvider !== "ALL" && filteredBundles[0] ? `0240000000 ${extractBundleSize(filteredBundles[0].name) || "1GB"}` : "0240000000 1GB"}
                      value={bulkInput}
                      onChange={(event) => setBulkInput(event.target.value)}
                      disabled={!storefrontCanSellBundles || submittingBulk}
                    />
                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 w-full rounded-md text-base font-semibold shadow-sm sm:w-auto sm:px-8"
                      disabled={!storefrontCanSellBundles || submittingBulk || !bulkInput.trim()}
                    >
                      {submittingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers3 className="mr-2 h-4 w-4" />}
                      {submittingBulk ? "Redirecting..." : "Review & Pay Bulk Orders"}
                    </Button>
                  </form>

                  {bulkInput.trim() && (
                    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/30 p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="break-words font-semibold text-foreground">
                          Orders: {preview.validRows.length} valid / {preview.invalidRows.length} invalid
                        </p>
                        <p className="break-words text-muted-foreground">Estimated payment: {formatGhanaCedis(preview.totalAmount)}</p>
                      </div>
                      {selectedProvider === "ALL" && (
                        <p className="text-destructive">Select a network to resolve bundle sizes before submitting.</p>
                      )}
                      {preview.invalidRows.length > 0 && (
                        <div className="space-y-2">
                          <p className="font-medium text-destructive">Invalid lines</p>
                          <div className="max-h-24 space-y-1 overflow-auto rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                            {preview.invalidRows.slice(0, 6).map((row) => (
                              <p key={`invalid-${row.lineNumber}`} className="break-words">
                                Line {row.lineNumber}: {row.error}
                              </p>
                            ))}
                            {preview.invalidRows.length > 6 && <p>...and {preview.invalidRows.length - 6} more</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {bulkResults.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Results</p>
                        <p className="text-xs text-muted-foreground">Scroll on mobile to review all rows</p>
                      </div>
                      <div className="overflow-hidden rounded-md border border-border">
                        <div className="table-scroll">
                          <table className="min-w-[900px] w-full text-sm">
                            <thead className="bg-muted/60 text-muted-foreground">
                              <tr>
                                <th className="px-4 py-3 text-left font-medium">Line</th>
                                <th className="px-4 py-3 text-left font-medium">Phone</th>
                                <th className="px-4 py-3 text-left font-medium">Size</th>
                                <th className="px-4 py-3 text-left font-medium">Status</th>
                                <th className="px-4 py-3 text-right font-medium">Amount</th>
                                <th className="px-4 py-3 text-left font-medium">Message</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkResults.map((result) => (
                                <tr key={`${result.lineNumber}-${result.phone}-${result.bundleId}`} className="border-t border-border/70">
                                  <td className="px-4 py-3">{result.lineNumber}</td>
                                  <td className="px-4 py-3 font-medium text-foreground">{result.phone}</td>
                                  <td className="px-4 py-3">{result.size}</td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={
                                        result.status === "SUCCESS"
                                           ? "status-success inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold"
                                           : "inline-flex items-center rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
                                      }
                                    >
                                      {result.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-muted-foreground">{formatGhanaCedis(result.amount)}</td>
                                  <td className="px-4 py-3 text-muted-foreground">{result.message}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {services.length > 0 ? (
              <TabsContent value="services" className="mt-0">
                <Card className="min-w-0 overflow-hidden border-border/80 bg-card/95 shadow-sm">
                  <CardHeader className="border-b border-border/70 bg-muted/20">
                    <CardTitle className="flex min-w-0 items-center gap-2 text-lg sm:text-xl">
                      <FileText className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0 break-words">Registration Services</span>
                    </CardTitle>
                    <CardDescription className="break-words">
                      Complete the required customer details, then pay securely before submission.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 p-4 sm:p-6">
                    <form className="space-y-5" onSubmit={handleServiceRequest}>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Registration service</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-3 text-sm shadow-sm outline-none transition hover:border-ring focus:border-ring focus:ring-2 focus:ring-ring/20"
                          value={serviceProductId}
                          onChange={(event) => setServiceProductId(event.target.value)}
                          required
                          disabled={!storefrontCanSellServices}
                        >
                          <option value="">Select registration service</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name} ({service.provider}) - {formatGhanaCedis(service.effectivePrice)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {!selectedService ? (
                        <div className="rounded-md border border-dashed border-border bg-muted/25 p-4 text-sm text-muted-foreground">
                          Select a registration service to show the required customer form.
                        </div>
                      ) : (
                        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Full name</label>
                            <Input
                              value={serviceFullName}
                              onChange={(event) => setServiceFullName(event.target.value)}
                              placeholder="Customer full name"
                              required
                              disabled={!storefrontCanSellServices}
                              className="h-11"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">{selectedService.provider === "SERVICE" ? "Phone number" : `${selectedService.provider} phone number`}</label>
                            <div className="relative">
                              <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                type="tel"
                                value={servicePhone}
                                onChange={(event) => setServicePhone(event.target.value)}
                                placeholder="0240000000"
                                required
                                disabled={!storefrontCanSellServices}
                                className="h-11 pl-9"
                              />
                            </div>
                          </div>
                          {selectedServiceFields.map((field) => (
                            <div key={field.id} className={field.type === "TEXTAREA" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                              <label className="text-sm font-medium text-foreground">
                                {field.label}
                                {field.required ? <span className="text-destructive"> *</span> : null}
                              </label>
                              {field.type === "SELECT" ? (
                                <select
                                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition hover:border-ring focus:border-ring focus:ring-2 focus:ring-ring/20"
                                  value={serviceFormValues[field.id] || ""}
                                  onChange={(event) => setServiceFormValues((values) => ({ ...values, [field.id]: event.target.value }))}
                                  required={field.required}
                                  disabled={!storefrontCanSellServices}
                                >
                                  <option value="">Select {field.label.toLowerCase()}</option>
                                  {(field.options || []).map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              ) : field.type === "TEXTAREA" ? (
                                <textarea
                                  className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                                  value={serviceFormValues[field.id] || ""}
                                  onChange={(event) => setServiceFormValues((values) => ({ ...values, [field.id]: event.target.value }))}
                                  placeholder={field.placeholder || field.label}
                                  required={field.required}
                                  disabled={!storefrontCanSellServices}
                                />
                              ) : (
                                <Input
                                  type={field.type === "DATE" ? "date" : field.type === "NUMBER" ? "number" : field.type === "PHONE" ? "tel" : "text"}
                                  value={serviceFormValues[field.id] || ""}
                                  onChange={(event) => setServiceFormValues((values) => ({ ...values, [field.id]: event.target.value }))}
                                  placeholder={field.placeholder || field.label}
                                  required={field.required}
                                  disabled={!storefrontCanSellServices}
                                  className={field.type === "GHANA_CARD" ? "h-11 uppercase" : "h-11"}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedService && (
                        <div className="grid min-w-0 gap-3 rounded-md border border-primary/20 bg-primary/10 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <div className="min-w-0 space-y-1 text-sm">
                            <p className="font-semibold text-foreground">Registration summary</p>
                            <p className="break-words text-muted-foreground">
                              {selectedService.name} - {selectedService.provider}
                            </p>
                          </div>
                          <div className="min-w-0 text-left sm:text-right">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                            <p className="break-words text-xl font-bold text-primary sm:text-2xl">{formatGhanaCedis(totalServiceCost)}</p>
                          </div>
                        </div>
                      )}

                      <Button
                        type="submit"
                        size="lg"
                        className="h-12 w-full rounded-md text-base font-semibold shadow-sm sm:w-auto sm:px-8"
                        disabled={
                          !storefrontCanSellServices ||
                          submittingService ||
                          !serviceProductId ||
                          !serviceFullName.trim() ||
                          !servicePhone.trim() ||
                          selectedServiceFields.some((field) => field.required && !String(serviceFormValues[field.id] || "").trim())
                        }
                      >
                        {submittingService ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {submittingService ? "Redirecting..." : "Submit & Pay"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </div>

          <div className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="min-w-0 border-border/80 bg-card/95 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">How it works</CardTitle>
                <CardDescription>Quick checkout for customers on any device.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex min-w-0 gap-3 rounded-md bg-muted/40 p-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">1</div>
                  <p className="min-w-0 break-words">Pick a bundle or service and enter the required customer details.</p>
                </div>
                <div className="flex min-w-0 gap-3 rounded-md bg-muted/40 p-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">2</div>
                  <p className="min-w-0 break-words">Pay securely with card, bank, or mobile money where available.</p>
                </div>
                <div className="flex min-w-0 gap-3 rounded-md bg-muted/40 p-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">3</div>
                  <p className="min-w-0 break-words">After payment, the seller receives the order for fulfillment.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 border-border/80 bg-card/95 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Available catalog</CardTitle>
                <CardDescription>{productCount} public item{productCount === 1 ? "" : "s"} loaded from this storefront.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {bundles.slice(0, 5).map((bundle) => (
                  <div key={bundle.id} className="grid min-w-0 gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-foreground">{bundle.name}</p>
                      <p className="break-words text-xs text-muted-foreground">{bundle.provider}</p>
                    </div>
                    <p className="break-words font-semibold text-primary sm:text-right">{formatGhanaCedis(bundle.effectivePrice)}</p>
                  </div>
                ))}
                {services.slice(0, 5).map((service) => (
                  <div key={service.id} className="grid min-w-0 gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-foreground">{service.name}</p>
                      <p className="break-words text-xs text-muted-foreground">{service.provider} registration service</p>
                    </div>
                    <p className="break-words font-semibold text-primary sm:text-right">{formatGhanaCedis(service.effectivePrice)}</p>
                  </div>
                ))}
                {productCount === 0 && <p className="text-sm text-muted-foreground">No public bundles or services available yet.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  )
}
