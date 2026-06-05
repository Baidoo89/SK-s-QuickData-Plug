export function getRoleLandingPath(role: string | null | undefined) {
  if (role === "SUPERADMIN") return "/admin"
  if (role === "SUBSCRIBER") return "/dashboard"
  if (role === "AGENT") return "/agent"
  if (role === "RESELLER") return "/reseller"
  return "/login"
}
