const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "assets",
  "static",
  "mail",
  "smtp",
  "support",
])

export function getRootStorefrontDomain() {
  return (
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
    process.env.NEXT_PUBLIC_APP_DOMAIN ||
    process.env.APP_ROOT_DOMAIN ||
    "techdalt.com"
  )
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
}

export function stripHostPort(host: string | null | undefined) {
  return (host || "").toLowerCase().split(":")[0]
}

export function getStorefrontSubdomain(host: string | null | undefined) {
  const hostname = stripHostPort(host)
  const rootDomain = getRootStorefrontDomain()

  if (!hostname || hostname === rootDomain || !hostname.endsWith(`.${rootDomain}`)) {
    return null
  }

  const subdomain = hostname.slice(0, -(rootDomain.length + 1))
  if (!subdomain || subdomain.includes(".") || RESERVED_SUBDOMAINS.has(subdomain)) {
    return null
  }

  return subdomain
}

export function isStorefrontSubdomainHost(host: string | null | undefined, handle?: string) {
  const subdomain = getStorefrontSubdomain(host)
  return Boolean(subdomain && (!handle || subdomain === handle))
}

export function buildStorefrontUrl(path: string, origin: string) {
  const match = path.match(/^\/shop\/([^/?#]+)/)
  const handle = match?.[1] ? decodeURIComponent(match[1]) : ""
  if (!handle) return `${origin}${path}`

  try {
    const url = new URL(origin)
    const rootDomain = getRootStorefrontDomain()
    if (url.hostname === rootDomain || url.hostname === `www.${rootDomain}`) {
      url.hostname = `${handle}.${rootDomain}`
      url.pathname = "/"
      url.search = ""
      url.hash = ""
      return url.toString().replace(/\/$/, "")
    }
  } catch {
    return `${origin}${path}`
  }

  return `${origin}${path}`
}

export function isAllowedStorefrontReturnUrl(value: string | null | undefined) {
  if (!value) return false

  try {
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol)) return false

    const hostname = stripHostPort(url.host)
    const rootDomain = getRootStorefrontDomain()
    const isRoot = hostname === rootDomain || hostname === `www.${rootDomain}`
    const isSubdomain = Boolean(getStorefrontSubdomain(url.host))

    return isRoot || isSubdomain
  } catch {
    return false
  }
}
