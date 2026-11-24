const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "DELIVERED",
  PENDING_PAYMENT: "AWAITING PAYMENT",
  PAYMENT_FAILED: "PAYMENT FAILED",
  PAYMENT_INIT_FAILED: "PAYMENT SETUP FAILED",
}

export function getOrderStatusLabel(status: string) {
  return STATUS_LABELS[status] || status
}

export function getOrderStatusBadgeClass(status: string) {
  const normalized = status.trim().toUpperCase().replace(/\s+/g, "_")
  if (normalized === "COMPLETED" || normalized === "DELIVERED") return "status-success border"
  if (normalized === "PROCESSING") return "status-info border"
  if (normalized === "PENDING" || normalized === "PENDING_PAYMENT" || normalized === "AWAITING_PAYMENT") return "status-warning border"
  if (normalized === "FAILED" || normalized === "PAYMENT_FAILED" || normalized === "PAYMENT_INIT_FAILED") return "border-destructive/50 bg-destructive/10 text-destructive"
  if (normalized === "REFUNDED") return "border-info/40 bg-info/10 text-info"
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "border-muted-foreground/40 bg-muted text-muted-foreground"
  return "border-border bg-muted text-muted-foreground"
}
