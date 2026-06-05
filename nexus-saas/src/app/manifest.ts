import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TechDalt",
    short_name: "TechDalt",
    description: "VTU SaaS for data vendors, storefronts, agents, resellers, wallets, and order fulfillment.",
    start_url: "/",
    display: "standalone",
    background_color: "#101827",
    theme_color: "#5B8CFF",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  }
}
