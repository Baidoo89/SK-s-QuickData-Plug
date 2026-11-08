// Only the isolated preview app serves these sample responses.
// No production auth, database, gateway or provider modules are imported here.
import type { CatalogBundle } from "@/lib/catalog-pricing"
export const dynamic = "force-dynamic"

const networks = [{ id: "MTN", name: "MTN" }, { id: "TELECEL", name: "Telecel" }, { id: "AIRTELTIGO", name: "AirtelTigo" }]
const bundles = [
  { id: "mtn-1", name: "1 GB", provider: "MTN", effectivePrice: 5 },
  { id: "mtn-10", name: "10 GB", provider: "MTN", effectivePrice: 45 },
  { id: "tel-5", name: "5 GB", provider: "TELECEL", effectivePrice: 20 },
  { id: "at-5", name: "5 GB", provider: "AIRTELTIGO", effectivePrice: 20 },
]

// Temporary demo state only. Restarting the preview resets these catalog edits.
const catalog = new Map<string, CatalogBundle>(bundles.map((bundle, index) => [bundle.id, {
  ...bundle, category: "DATA_BUNDLE", price: bundle.effectivePrice,
  basePrice: bundle.effectivePrice - 1, storefrontPrice: bundle.effectivePrice,
  hasBasePrice: index !== 2, hasStorefrontPrice: index !== 2, active: index !== 3,
}]))

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.pathname === "/api/products") return Response.json({ data: [...catalog.values()] })
  if (url.pathname === "/api/networks") return Response.json({ data: networks })
  if (url.pathname === "/api/bundles") return Response.json({ data: bundles.filter(bundle => bundle.provider === url.searchParams.get("networkId")) })
  if (url.pathname === "/api/selling-access/status") return Response.json({ data: { canSell: true } })
  return Response.json({ message: "This endpoint is not part of the sample preview." }, { status: 404 })
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  if (url.pathname === "/api/products") {
    const body = await request.json()
    const product: CatalogBundle = { ...body, id: `sample-${crypto.randomUUID()}`, hasBasePrice: true, hasStorefrontPrice: true }
    catalog.set(product.id, product)
    return Response.json({ data: product }, { status: 201 })
  }
  if (url.pathname === "/api/store/checkout") return Response.json({ data: { authorizationUrl: "/preview-payment" } })
  if (url.pathname === "/api/agent/buy-data" || url.pathname === "/api/reseller/buy-data") {
    const body = await request.json()
    const bundle = bundles.find(item => item.id === body.bundleId)
    if (!bundle) return Response.json({ message: "Choose a sample bundle." }, { status: 400 })
    return Response.json({ data: { orderId: `DEMO-${Date.now()}`, phone: body.phone, bundle: bundle.name, total: bundle.effectivePrice, status: "PENDING" } })
  }
  return Response.json({ message: "This action needs a configured test environment." }, { status: 404 })
}

export async function PUT(request: Request) {
  const url = new URL(request.url)
  const id = url.pathname.startsWith("/api/products/") ? url.pathname.slice("/api/products/".length) : ""
  const existing = catalog.get(id)
  if (!existing) return Response.json({ message: "Sample bundle not found." }, { status: 404 })
  const body = await request.json()
  const updated: CatalogBundle = { ...existing, ...body, id, hasBasePrice: true, hasStorefrontPrice: true }
  catalog.set(id, updated)
  return Response.json(updated)
}
