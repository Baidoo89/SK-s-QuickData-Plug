type TokenUser = { role?: string; organizationId?: string; hasActiveSubscription?: boolean }

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }: any) {
      // Keep jwt callback DB-free so it is safe in edge/runtime contexts.
      // Credentials authorize() already reads from DB and returns user fields.
      if (user) {
        token.role = (user as any).role ?? token.role ?? "SUBSCRIBER"
        token.organizationId = (user as any).organizationId ?? token.organizationId ?? null
        ;(token as any).hasActiveSubscription = (user as any).hasActiveSubscription ?? (token as any).hasActiveSubscription ?? false
      }

      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        const role = typeof token.role === "string" ? token.role : undefined
        const organizationId = typeof token.organizationId === "string" ? token.organizationId : undefined
        const hasActiveSubscription = Boolean((token as any).hasActiveSubscription)

        ;(session.user as TokenUser).role = role
        ;(session.user as TokenUser).organizationId = organizationId
        ;(session.user as TokenUser).hasActiveSubscription = hasActiveSubscription
      }
      return session
    },
    async redirect({ url, baseUrl }: any) {
      // Only redirect to URLs on the same origin
      if (url.startsWith("/")) return `${baseUrl}${url}`
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
    authorized({ auth, request: { nextUrl } }: any) {
      const isLoggedIn = !!auth?.user
      const role = (auth?.user as TokenUser)?.role
      const path = nextUrl.pathname
      const isDashboard = path.startsWith("/dashboard")
      const isAdmin = path.startsWith("/admin")
      const isAuthPage = path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/reset")
      const isStore = path.startsWith("/store")
      const isReseller = path.startsWith("/reseller")
      const isAgent = path.startsWith("/agent")

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

      // Agent portal requires AGENT role
      if (isAgent) {
        return role === "AGENT"
      }

      // Reseller portal requires RESELLER role
      if (isReseller) {
        return role === "RESELLER"
      }

      // Storefront areas (admin/agent storefronts) must be authenticated but can be any role
      if (isStore) {
        return isLoggedIn
      }

      return true
    },
  },
  providers: [],
}
