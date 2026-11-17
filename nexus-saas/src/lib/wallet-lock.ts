import type { Prisma } from "@prisma/client"

// Every wallet spending path must take this lock before reading its balance.
// READ COMMITTED gives the following aggregate a fresh snapshot after waiting.
export async function lockWallet(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
  if (!rows.length) throw new Error("WALLET_USER_NOT_FOUND")
}
