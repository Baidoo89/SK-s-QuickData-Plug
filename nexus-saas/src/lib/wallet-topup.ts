import { db } from "@/lib/db"
import { lockWallet } from "@/lib/wallet-lock"

type VerifiedPayment = {
  reference?: unknown; status?: unknown; currency?: unknown; amount?: unknown;
  metadata?: Record<string, unknown>
}
function cents(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("INVALID_WALLET_PAYMENT")
  const rounded = Math.round(value * 100)
  if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(value * 100 - rounded) > 0.000001) throw new Error("INVALID_WALLET_PAYMENT")
  return rounded
}
// Call only with the server-to-server verification response, never browser data.
export async function recordVerifiedWalletTopup(input: { organizationId: string; reference: string; fundingOwner: "PLATFORM" | "SUBSCRIBER"; payment: VerifiedPayment }) {
  const { payment } = input
  const meta = payment.metadata ?? {}
  const userId = typeof meta.walletUserId === "string" ? meta.walletUserId : ""
  if (!input.reference || payment.reference !== input.reference || payment.status !== "success" || payment.currency !== "GHS" || meta.purpose !== "wallet_topup" || meta.organizationId !== input.organizationId || !userId) throw new Error("INVALID_WALLET_PAYMENT")
  const net = cents(meta.walletTopupAmountGHS)
  const gross = cents(meta.walletGrossAmountGHS)
  if (!Number.isSafeInteger(payment.amount) || gross !== payment.amount || net > gross) throw new Error("INVALID_WALLET_PAYMENT")
  const paymentReference = `paystack:${input.organizationId}:${input.reference}`
  return db.$transaction(async tx => {
    await lockWallet(tx, userId)
    const user = await tx.user.findUnique({ where: { id: userId } })
    const expectedFunding = user && ["SUBSCRIBER", "SUPERADMIN"].includes(user.role) ? "PLATFORM" : "SUBSCRIBER"
    if (!user || user.organizationId !== input.organizationId || input.fundingOwner !== expectedFunding || (meta.walletFundingOwner !== undefined && meta.walletFundingOwner !== expectedFunding)) throw new Error("INVALID_WALLET_PAYMENT")
    const existing = await tx.walletTransaction.findUnique({ where: { paymentReference } })
    if (existing) {
      if (existing.userId !== userId || existing.amount !== net / 100 || existing.status !== "success") throw new Error("INVALID_WALLET_PAYMENT")
      return { credited: false, transactionId: existing.id }
    }
    const credit = await tx.walletTransaction.create({ data: { userId, performedByEmail: user.email, performedByRole: user.role, method: "paystack", amount: net / 100, status: "success", paymentReference } })
    return { credited: true, transactionId: credit.id }
  }, { maxWait: 10000, timeout: 20000 })
}
