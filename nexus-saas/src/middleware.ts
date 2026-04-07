import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Keep middleware edge-safe: auth and RBAC are enforced in API routes and server pages.
export function middleware(_req: NextRequest) {
	return NextResponse.next()
}

// Limit middleware to authenticated app areas only
export const config = {
	matcher: [
		"/dashboard/:path*",
		"/admin/:path*",
		"/store/:path*",
		"/reseller/:path*",
		"/agent/:path*",
	],
}

