import crypto from "crypto"

function safeEqualHex(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "hex")
    const b = Buffer.from(bHex, "hex")
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function normalizeSignatureHeader(value: string | null): string {
  if (!value) return ""
  const trimmed = value.trim()
  if (trimmed.startsWith("sha256=")) {
    return trimmed.slice("sha256=".length)
  }
  return trimmed
}

export function verifyProviderWebhookSignature(params: {
  rawBody: string
  signatureHeader: string | null
  sharedSecret: string | undefined
}) {
  const sharedSecret = params.sharedSecret?.trim()
  const incoming = normalizeSignatureHeader(params.signatureHeader)

  if (!sharedSecret || !incoming) {
    return false
  }

  const expected = crypto
    .createHmac("sha256", sharedSecret)
    .update(params.rawBody, "utf8")
    .digest("hex")

  return safeEqualHex(incoming.toLowerCase(), expected.toLowerCase())
}
