export const WITHDRAWAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  PAID: "PAID",
  REJECTED: "REJECTED",
  CANCELED: "CANCELED",
} as const

export type WithdrawalStatus = (typeof WITHDRAWAL_STATUS)[keyof typeof WITHDRAWAL_STATUS]

const transitionMap: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELED"],
  APPROVED: ["PAID", "REJECTED", "CANCELED"],
  PAID: [],
  REJECTED: [],
  CANCELED: [],
}

export function canTransitionWithdrawalStatus(current: string, next: string) {
  const from = current.toUpperCase() as WithdrawalStatus
  const to = next.toUpperCase() as WithdrawalStatus

  if (!(from in transitionMap)) return false
  return transitionMap[from].includes(to)
}

export function normalizeWithdrawalStatus(input: string) {
  return input.trim().toUpperCase() as WithdrawalStatus
}

export function isWithdrawalStatus(input: string): input is WithdrawalStatus {
  const normalized = input.trim().toUpperCase()
  return Object.values(WITHDRAWAL_STATUS).includes(normalized as WithdrawalStatus)
}
