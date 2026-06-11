const rawWhatsappNumber = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER || ""

export const supportEmail = "support@techdalt.com"

export function normalizeWhatsappNumber(value = rawWhatsappNumber) {
  const digits = value.replace(/\D/g, "")
  if (!digits) return null
  if (digits.startsWith("0")) return `233${digits.slice(1)}`
  return digits
}

export function getSupportWhatsappHref(message = "Hello TechDalt, I need help with software development, subscription, or support.") {
  const number = normalizeWhatsappNumber()
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
