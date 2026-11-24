export type PaystackMetadata = Record<string, unknown>

/**
 * Paystack documents transaction metadata as a stringified JSON object, while
 * some test fixtures and older responses provide an object directly.
 */
export function parsePaystackMetadata(value: unknown): PaystackMetadata {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as PaystackMetadata
  }

  if (typeof value !== "string" || !value.trim()) return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as PaystackMetadata
      : {}
  } catch {
    return {}
  }
}
