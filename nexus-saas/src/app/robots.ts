import type { MetadataRoute } from "next"

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://techdalt.com"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/register", "/login", "/shop/"],
        disallow: [
          "/admin/",
          "/agent/",
          "/dashboard/",
          "/reseller/",
          "/api/",
          "/dev/",
          "/new-password",
          "/reset",
          "/verify-email",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
