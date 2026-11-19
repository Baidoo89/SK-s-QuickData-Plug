export type CatalogBundle = {
  id: string
  name: string
  provider: string
  category: string
  price: number
  basePrice?: number | null
  storefrontPrice?: number | null
  hasBasePrice?: boolean
  hasStorefrontPrice?: boolean
  active: boolean
  description?: string | null
  bundleType?: string
}

export function parsePriceCents(value: string): number | null {
  const text = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ""] = text.split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(cents) ? cents : null
}

export function bundleIssues(bundle: CatalogBundle): string[] {
  const issues: string[] = []
  const base = bundle.basePrice ?? bundle.price
  const shop = bundle.storefrontPrice ?? bundle.price
  if (bundle.hasBasePrice === false) issues.push("Set a base price")
  else if (!Number.isFinite(base) || base < 0) issues.push("Check the base price")
  if (bundle.hasStorefrontPrice === false) issues.push("Set a shop price")
  else if (!Number.isFinite(shop) || shop < 0) issues.push("Check the shop price")
  else if (shop === 0) issues.push("Review the zero shop price")
  else if (Number.isFinite(base) && Math.round(shop * 100) < Math.round(base * 100)) issues.push("Shop price is below the base price")
  return issues
}

export function bundleDifference(bundle: CatalogBundle): number | null {
  const base = bundle.basePrice ?? bundle.price
  const shop = bundle.storefrontPrice ?? bundle.price
  if (bundle.hasBasePrice === false || bundle.hasStorefrontPrice === false || !Number.isFinite(base) || !Number.isFinite(shop)) return null
  return (Math.round(shop * 100) - Math.round(base * 100)) / 100
}
