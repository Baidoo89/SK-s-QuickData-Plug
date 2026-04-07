import { notFound } from "next/navigation"
import { ShoppingCart, Package, FileText, GraduationCap } from "lucide-react"
import { db } from "@/lib/db"
import type { Organization } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { BuyButton } from "@/components/storefront/buy-button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatGhanaCedis } from "@/lib/currency"

function formatBundleLabel(name: string) {
  const match = name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)
  return match ? match[0].replace(/\s+/g, "").toUpperCase() : name
}

async function loadStore(subscriberSlug: string) {
  const organization = await db.organization.findUnique({
    where: { slug: subscriberSlug },
    include: {
      // Subscriptions are ignored for now; include kept for future use.
      subscription: true,
    },
  })

  if (!organization) return null
  // For now, treat the store as active based solely on organization.active.
  const storeActive = organization.active ?? true

  // Use dynamic client access to avoid type issues until prisma client is regenerated
  const products = await db.product.findMany({
    where: { organizationId: organization.id, active: true },
    include: {
      basePrices: {
        where: { organizationId: organization.id },
        select: { price: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const normalized = products.map((product: any) => {
    const basePrice = product.basePrices?.[0]?.price ?? product.price
    return {
      ...product,
      basePrice,
      effectivePrice: basePrice,
    }
  })

  return { organization, products: normalized, storeActive }
}

function ProductGrid({ products, subscriberSlug, storeActive }: { products: any[]; subscriberSlug: string; storeActive: boolean }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <Card key={product.id} className="flex flex-col overflow-hidden transition-all hover:shadow-lg">
          <div className="aspect-video relative bg-slate-100">
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              {product.category === "LEGAL_DOCUMENT" ? <FileText className="h-12 w-12" /> :
               product.category === "EDUCATION" ? <GraduationCap className="h-12 w-12" /> :
               <Package className="h-12 w-12" />}
            </div>
            <div className="absolute right-2 top-2 flex gap-1">
               <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
                  {product.provider}
               </Badge>
            </div>
          </div>
          <CardHeader>
            <CardTitle className="line-clamp-1">
              {product.category === "DATA_BUNDLE" || !product.category ? formatBundleLabel(product.name) : product.name}
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {product.description || "No description available."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Price</p>
                <span className="text-2xl font-bold text-primary">
                  {formatGhanaCedis(product.effectivePrice)}
                </span>
                {product.basePrice !== product.effectivePrice ? (
                  <p className="text-xs text-muted-foreground">
                    Original: {formatGhanaCedis(product.basePrice)}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-slate-50 p-4">
            <BuyButton productId={product.id} subscriberSlug={subscriberSlug} disabled={!storeActive || product.stock === 0} />
          </CardFooter>
        </Card>
      ))}
      {products.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-slate-100 p-4">
            <Package className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="mt-4 text-xl font-semibold">No products found</h3>
          <p className="text-muted-foreground">
            There are no products in this category yet.
          </p>
        </div>
      )}
    </div>
  )
}

interface StorefrontPageProps {
  params: {
    subscriberSlug: string
  }
}

export default async function StorefrontPage({ params }: StorefrontPageProps) {
  const data = await loadStore(params.subscriberSlug)

  if (!data) return notFound()

  const { organization, products, storeActive } = data as { organization: Organization; products: any[]; storeActive: boolean }

  const dataBundles = products.filter((p: any) => p.category === "DATA_BUNDLE" || !p.category)
  const legalDocs = products.filter((p: any) => p.category === "LEGAL_DOCUMENT")
  const education = products.filter((p: any) => p.category === "EDUCATION")
  const totalProducts = products.length

  return (
    <div className="min-h-screen bg-slate-50">
      {!storeActive && (
        <div className="bg-red-50 border-b border-red-200 text-red-800 py-4">
          <div className="container">This store is currently inactive. Purchases are disabled.</div>
        </div>
      )}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3 font-bold text-xl text-primary">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base md:text-lg">{organization.name}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Public storefront · Powered by TeChDalt
              </span>
            </div>
          </div>
          <Button variant="outline" size="icon" className="relative">
            <ShoppingCart className="h-5 w-5" />
            <span className="sr-only">Open cart</span>
          </Button>
        </div>
      </header>

      <div className="bg-gradient-to-r from-slate-900 to-slate-800 py-16 text-white">
        <div className="container">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">{organization.name} Store</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Your one-stop shop for data bundles, legal documents, and educational services.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs md:text-sm">
            <div className="rounded-full bg-white/10 px-3 py-1 backdrop-blur-sm">
              {storeActive ? "Store active" : "Store inactive"}
            </div>
            <div className="rounded-full bg-white/10 px-3 py-1 backdrop-blur-sm">
              {totalProducts} active products
            </div>
          </div>
        </div>
      </div>

      <main className="container py-12">
        <Tabs defaultValue="data_bundles" className="space-y-8">
          <div className="flex justify-center">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="data_bundles">Bundles</TabsTrigger>
              <TabsTrigger value="legal_documents">Legal</TabsTrigger>
              <TabsTrigger value="education">Education</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="data_bundles" className="space-y-4">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Data Bundles</h2>
              <p className="text-muted-foreground">Affordable data packages for all networks.</p>
            </div>
            <ProductGrid products={dataBundles} subscriberSlug={organization.slug} storeActive={storeActive} />
          </TabsContent>

          <TabsContent value="legal_documents" className="space-y-4">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Legal Documents</h2>
              <p className="text-muted-foreground">Official document processing services.</p>
            </div>
            <ProductGrid products={legalDocs} subscriberSlug={organization.slug} storeActive={storeActive} />
          </TabsContent>

          <TabsContent value="education" className="space-y-4">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Education</h2>
              <p className="text-muted-foreground">Result checkers and placement cards.</p>
            </div>
            <ProductGrid products={education} subscriberSlug={organization.slug} storeActive={storeActive} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
