"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { formatGhanaCedis } from "@/lib/currency"

interface Product {
  id: string
  name: string
  description?: string
  category?: string
  provider?: string
  bundleType?: string
  stock?: number
  basePrice?: number
  price: number
  active?: boolean
  createdAt?: string
  updatedAt?: string
}

interface ProductDetailsModalProps {
  product: Product
  onClose: () => void
}

export function ProductDetailsModal({ product, onClose }: ProductDetailsModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {product.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
              <p className="mt-0.5">{product.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {product.category && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</p>
                <p className="mt-0.5">{product.category.replace(/_/g, " ")}</p>
              </div>
            )}
            {product.provider && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Provider</p>
                <p className="mt-0.5">{product.provider}</p>
              </div>
            )}
            {product.bundleType && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bundle type</p>
                <p className="mt-0.5">{product.bundleType}</p>
              </div>
            )}
            {typeof product.stock === "number" && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stock</p>
                <p className="mt-0.5">{product.stock}</p>
              </div>
            )}
            {typeof product.basePrice === "number" && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Base price</p>
                <p className="mt-0.5">{formatGhanaCedis(product.basePrice)}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current price</p>
              <p className="mt-0.5">{formatGhanaCedis(product.price)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
              <Badge
                variant={product.active ? "default" : "secondary"}
                className={product.active ? "mt-0.5 bg-green-100 text-green-800" : "mt-0.5 bg-gray-100 text-gray-500"}
              >
                {product.active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Product ID</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{product.id}</p>
          </div>
          {product.createdAt && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(product.createdAt).toLocaleDateString()}
                </p>
              </div>
              {product.updatedAt && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Updated</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(product.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
