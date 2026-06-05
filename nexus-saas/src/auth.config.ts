import type { NextAuthOptions, Session, User } from "next-auth"
import type { JWT } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { db } from "@/lib/db"

type TokenUser = { role?: string; organizationId?: string | null; hasActiveSubscription?: boolean }
type AppToken = JWT & TokenUser
type AppSessionUser = NonNullable<Session["user"]> & TokenUser
type AuthorizedParams = {
  auth: { user?: TokenUser } | null
  request: { nextUrl: NextRequest["nextUrl"] }
}

type AuthConfig = Omit<NextAuthOptions, "callbacks"> & {
  callbacks: NonNullable<NextAuthOptions["callbacks"]> & {
    authorized?: (params: AuthorizedParams) => boolean
  }
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }: { token: AppToken; user?: User | null }) {
      // In edge runtime (middleware), avoid hitting Prisma; rely on the token
      // that was already populated during the regular auth flow.
      // This prevents Prisma's "not configured for Edge Runtime" error.
      if (process.env.NEXT_RUNTIME === "edge") {
        return token
      }

      // Persist role, org and subscription status for routing guards
      const email = user?.email ?? token.email

      if (email) {
        const existing = await db.user.findUnique({
          where: { email: email as string },
          include: {
            organization: {
              include: {
                subscription: true,
              },
            },
          },
        })

        if (existing) {
          token.role = existing.role ?? "SUBSCRIBER"
          token.organizationId = existing.organizationId ?? null

          const subscription = existing.organization?.subscription
          const now = new Date()
          const hasActiveSubscription = !!(
            subscription &&
            subscription.status === "ACTIVE" &&
            (!subscription.nextBillingAt || subscription.nextBillingAt > now)
          )

          token.hasActiveSubscription = hasActiveSubscription
        }
      }

      return token
    },
    async session({ session, token }: { session: Session; token: AppToken }) {
      if (session.user) {
        const role = typeof token.role === "string" ? token.role : undefined
        const organizationId = typeof token.organizationId === "string" ? token.organizationId : undefined
        const hasActiveSubscription = Boolean(token.hasActiveSubscription)

        ;(session.user as AppSessionUser).role = role
        ;(session.user as AppSessionUser).organizationId = organizationId
        ;(session.user as AppSessionUser).hasActiveSubscription = hasActiveSubscription
      }
      return session
    },
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // Only redirect to URLs on the same origin
      if (url.startsWith("/")) return `${baseUrl}${url}`
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
    authorized({ auth, request: { nextUrl } }: AuthorizedParams) {
      const isLoggedIn = !!auth?.user
      const role = auth?.user?.role
      const path = nextUrl.pathname
      const isDashboard = path.startsWith("/dashboard")
      const isAdmin = path.startsWith("/admin")
      const isAuthPage = path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/reset")
      const isSubscriptionPage = path.startsWith("/dashboard/subscription")

      // Allow auth pages to be accessed by anyone
      if (isAuthPage) {
        return true
      }

      // If not logged in, deny access to protected pages
      if (!isLoggedIn) {
        return false
      }

      // Dashboard requires SUBSCRIBER role
      if (isDashboard) {
        if (role !== "SUBSCRIBER") return false

        // Allow all dashboard pages; subscription enforcement is handled in
        // application logic (e.g. shop APIs and UI messaging).
        return true
      }

      // Admin requires SUPERADMIN role
      if (isAdmin) {
        return role === "SUPERADMIN"
      }

      return true
    },
  },
  providers: [],
} satisfies AuthConfig
