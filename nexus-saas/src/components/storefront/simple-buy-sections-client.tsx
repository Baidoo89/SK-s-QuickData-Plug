"use client"

import dynamic from "next/dynamic"
import type { SimpleBuySectionsProps } from "@/components/storefront/simple-buy-sections"

const SimpleBuySections = dynamic(
  () => import("@/components/storefront/simple-buy-sections").then((module) => module.SimpleBuySections),
  {
    ssr: false,
    loading: () => (
      <div className="premium-surface rounded-lg p-6 text-sm text-muted-foreground">
        Loading checkout...
      </div>
    ),
  },
)

export function SimpleBuySectionsClient(props: SimpleBuySectionsProps) {
  return <SimpleBuySections {...props} />
}
