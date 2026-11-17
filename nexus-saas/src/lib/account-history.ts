import type { Prisma } from "@prisma/client"
import { lockWallet } from "@/lib/wallet-lock"

export async function requireNoAccountHistory(tx: Prisma.TransactionClient, userId: string) {
  // The user lock also serializes this check with wallet spending and lending.
  await lockWallet(tx, userId)
  const counts = await Promise.all([
    tx.walletTransaction.count({ where: { userId } }),
    tx.creditAccount.count({ where: { userId } }),
    tx.withdrawalRequest.count({ where: { userId } }),
    tx.order.count({ where: { OR: [{ userId }, { sellerUserId: userId }] } }),
    tx.serviceRequest.count({ where: { OR: [{ userId }, { sellerUserId: userId }] } }),
    tx.subscriptionCheckout.count({ where: { createdByUserId: userId } }),
  ])
  if (counts.some(count => count > 0)) throw new Error("ACCOUNT_HAS_FINANCIAL_HISTORY")
}
