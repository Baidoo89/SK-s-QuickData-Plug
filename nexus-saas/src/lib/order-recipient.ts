export function resolveOrderRecipientPhone(order: {
  phoneNumber?: string | null
  customer?: { phone?: string | null } | null
}) {
  return order.phoneNumber?.trim() || order.customer?.phone?.trim() || ""
}
