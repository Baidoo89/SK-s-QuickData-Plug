import { Prisma } from "@prisma/client"

// Monetary arithmetic uses integer pesewas. Reject sub-pesewa inputs instead
// of silently changing requested prices or balances.
export function moneyToMinor(value: number | string): number {
  let scaled: Prisma.Decimal
  try { scaled = new Prisma.Decimal(value).mul(100) } catch { throw new Error("INVALID_MONEY") }
  if (!scaled.isFinite() || !scaled.isInteger()) throw new Error("INVALID_MONEY")
  const minor = scaled.toNumber()
  if (!Number.isSafeInteger(minor)) throw new Error("INVALID_MONEY")
  return minor
}
export function minorToMoney(minor: number): number {
  if (!Number.isSafeInteger(minor)) throw new Error("INVALID_MONEY")
  return new Prisma.Decimal(minor).div(100).toNumber()
}
export function subtractMoney(...values: number[]): number {
  if (!values.length) return 0
  const minor = values.slice(1).reduce((sum, value) => sum - moneyToMinor(value), moneyToMinor(values[0]))
  return minorToMoney(minor)
}
export function multiplyMoney(value: number, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("INVALID_MONEY")
  return minorToMoney(moneyToMinor(value) * quantity)
}
// Float ledger columns remain until the staged storage migration. PostgreSQL
// casts each entry to decimal before summing, avoiding a floating-point sum.
export async function getWalletBalance(client: Prisma.TransactionClient, userId: string): Promise<number> {
  const rows = await client.$queryRaw<Array<{ amount: string }>>`SELECT COALESCE(SUM("amount"::numeric), 0)::text AS amount FROM "WalletTransaction" WHERE "userId" = ${userId} AND "status" = 'success'`
  return minorToMoney(moneyToMinor(rows[0].amount))
}
