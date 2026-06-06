import { NextRequest, NextResponse } from "next/server"

import { getStorefrontSubdomain } from "@/lib/storefront-url"

const PUBLIC_FILE = /\.(.*)$/

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/agent") ||
    pathname.startsWith("/reseller") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/new-password") ||
    pathname.startsWith("/verify-email") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next()
  }

  const handle = getStorefrontSubdomain(req.headers.get("host"))
  if (!handle) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = `/shop/${handle}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
